/**
 * Self-containment check.
 *
 * Verifies the plugin is installable and immediately usable on a machine where
 * no external Paper-gogo package exists:
 *
 *   1. the bundled `workflow/` carries every required document and skill
 *   2. the bundled workflow files match the integrity hashes in the manifest
 *   3. every skill the workflow routes to exists as a directory with a readable SKILL.md
 *   4. with ALL external discovery disabled (no config.root, no env var, cwd in a
 *      temp directory that contains nothing) the plugin still resolves its own
 *      bundled content and its tools return real content
 *
 * `node test/check-bundle.mjs`
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { access, mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { constants } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import * as plugin from '../src/plugin.js'
import { PHASES, GATES } from '../src/data/phases.js'
import { BUNDLED_WORKFLOW_DIR, isWorkflowRoot, resolveWorkflowRoot } from '../src/lib/root.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '..')
const WORKFLOW = path.join(PROJECT_ROOT, 'workflow')

let passed = 0
let failed = 0
const failures = []

async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (err) {
    failed++
    failures.push({ name, err })
    console.log(`  FAIL ${name}\n         ${String(err.message).split('\n')[0]}`)
  }
}

const exists = async (p) => {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

console.log('自包含检查（模拟无外部 Paper-gogo 包的机器）\n')

console.log('包内容')

await test('bundled workflow 目录就是插件内的 workflow/', () => {
  assert.equal(path.resolve(BUNDLED_WORKFLOW_DIR), path.resolve(WORKFLOW))
})

await test('bundled workflow 通过工作流根校验（SKILL.md + 工作流 + references）', async () => {
  assert.equal(await isWorkflowRoot(WORKFLOW), true)
})

await test('必需的入口与工作流文档都存在', async () => {
  for (const rel of [
    'SKILL.md',
    'paper-workflow-v6.md',
    'paper-workflow-v5.md',
    'PACKAGE_MANIFEST.md',
    'SKILLS_INDEX.md',
    'THIRD_PARTY_NOTICES.md',
    'PUBLIC_REPO_SETUP.md',
    'references/command-system.md',
    'references/phase-skill-routing.md',
    'references/reviewer-checklist.md',
  ]) {
    assert.ok(await exists(path.join(WORKFLOW, rel)), `缺少 ${rel}`)
  }
})

await test('工作流完整性哈希与 PACKAGE_MANIFEST.md 一致', async () => {
  const manifest = await readFile(path.join(WORKFLOW, 'PACKAGE_MANIFEST.md'), 'utf8')
  const expected = {}
  for (const m of manifest.matchAll(/\|\s*`([^`]+\.md)`\s*\|\s*`([0-9A-F]{64})`\s*\|/g)) {
    expected[m[1]] = m[2]
  }
  assert.ok(Object.keys(expected).length >= 2, '未能从 PACKAGE_MANIFEST.md 解析出哈希')
  for (const [file, want] of Object.entries(expected)) {
    const buf = await readFile(path.join(WORKFLOW, file))
    const got = createHash('sha256').update(buf).digest('hex').toUpperCase()
    assert.equal(got, want, `${file} 的 SHA-256 与清单不一致`)
  }
})

console.log('\n技能完整性')

/**
 * Every skill the workflow actually routes to must exist as a loadable skill
 * (a directory containing SKILL.md).
 *
 * The skill set comes from the routing data in `src/data/phases.js`, which is
 * the authoritative per-Phase primary/auxiliary assignment. We deliberately do
 * NOT scrape every backticked token in the routing document: that text also
 * names framework-figure *state* variables (`framework-concept`,
 * `framework-final`) which are state identifiers, not skills.
 */
await test('工作流路由引用的技能全部可加载（目录 + SKILL.md）', async () => {
  const skillNames = new Set()
  for (const p of PHASES) {
    skillNames.add(p.primary)
    for (const a of p.aux || []) skillNames.add(a.skill)
  }

  const missing = []
  for (const s of skillNames) {
    const dir = await findSkillDir(s)
    if (!dir) {
      missing.push(`${s}（未找到目录）`)
      continue
    }
    if (!(await exists(path.join(dir, 'SKILL.md')))) missing.push(`${s}（缺少 SKILL.md）`)
  }
  assert.deepEqual(missing, [], `以下技能无法加载：\n    ${missing.join('\n    ')}`)
})

async function findSkillDir(name, root = WORKFLOW) {
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch {
    return null
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue
    if (e.name === name) return path.join(root, e.name)
    if (['node_modules', '__pycache__', '.git'].includes(e.name)) continue
    const found = await findSkillDir(name, path.join(root, e.name))
    if (found) return found
  }
  return null
}

await test('每个 Stage 的每个 Phase 的主技能都能解析到目录', async () => {
  const missing = []
  for (const p of PHASES) {
    if (!(await findSkillDir(p.primary))) missing.push(`Phase ${p.n}: ${p.primary}`)
  }
  assert.deepEqual(missing, [], `缺失：${missing.join(', ')}`)
})

await test('SKILLS_INDEX.md 的技能数与磁盘实际一致', async () => {
  const index = await readFile(path.join(WORKFLOW, 'SKILLS_INDEX.md'), 'utf8')
  const claimed = Number(index.match(/内置技能总数：\*\*(\d+)\*\*/)?.[1])
  assert.ok(Number.isInteger(claimed) && claimed > 0, '索引中未找到技能总数')
  const onDisk = (await collectSkillDirs(WORKFLOW)).length
  assert.equal(onDisk, claimed, `索引声明 ${claimed} 个，磁盘实际 ${onDisk} 个（请运行 npm run build:index）`)
})

async function collectSkillDirs(root) {
  const out = []
  async function walk(dir, depth) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    if (entries.some((e) => e.isFile() && e.name === 'SKILL.md') && depth > 0) {
      out.push(dir)
      return
    }
    for (const e of entries) {
      if (!e.isDirectory() || ['node_modules', '__pycache__', '.git'].includes(e.name)) continue
      await walk(path.join(dir, e.name), depth + 1)
    }
  }
  await walk(root, 0)
  return out
}

await test('附加合集带有各自的许可证文件', async () => {
  const extras = path.join(WORKFLOW, 'extras')
  assert.ok(await exists(path.join(extras, 'THIRD_PARTY_NOTICES.extras.md')), '缺少 extras 许可证说明')
  for (const [dir, lic] of [
    ['academic-research-skills', 'LICENSE'],
    ['claude-scholar', 'LICENSE'],
    ['scipilot-figure-skill', 'LICENSE'],
  ]) {
    assert.ok(await exists(path.join(extras, dir, lic)), `${dir} 缺少 ${lic}`)
  }
})

console.log('\n无外部依赖运行')

await test('关闭全部外部发现后，插件仍解析到自带内容', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'paper-gogo-standalone-'))
  const prevRoot = process.env.DSH_PAPER_GOGO_ROOT
  const prevRoot2 = process.env.PAPER_GOGO_ROOT
  const prevCwd = process.cwd()
  delete process.env.DSH_PAPER_GOGO_ROOT
  delete process.env.PAPER_GOGO_ROOT
  process.chdir(tmp)
  try {
    const resolved = await resolveWorkflowRoot({ root: null, searchRoots: [] })
    assert.equal(resolved.source, 'bundled', `来源应为 bundled，实际 ${resolved.source}`)
    assert.equal(path.resolve(resolved.root), path.resolve(WORKFLOW))
    assert.equal(resolved.bundled, true)
  } finally {
    process.chdir(prevCwd)
    if (prevRoot !== undefined) process.env.DSH_PAPER_GOGO_ROOT = prevRoot
    if (prevRoot2 !== undefined) process.env.PAPER_GOGO_ROOT = prevRoot2
    await rm(tmp, { recursive: true, force: true })
  }
})

await test('无外部包时，每个工具都返回真实内容（不报缺失）', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'paper-gogo-tools-'))
  const prevCwd = process.cwd()
  const prevRoot = process.env.DSH_PAPER_GOGO_ROOT
  const prevRoot2 = process.env.PAPER_GOGO_ROOT
  delete process.env.DSH_PAPER_GOGO_ROOT
  delete process.env.PAPER_GOGO_ROOT
  process.chdir(tmp)
  try {
    const tools = []
    plugin.apply({ tools: { register: (d) => (tools.push(d), () => {}) }, get: () => undefined }, {})
    const byName = new Map(tools.map((t) => [t.name, t]))

    // doctor must report a usable, bundled root
    const doctor = await byName.get('paper_doctor').execute({}, { signal: new AbortController().signal })
    assert.equal(doctor.usable, true, 'doctor 应报告可用')
    assert.equal(doctor.bundled, true, 'doctor 应报告内容来自插件自带')
    assert.equal(path.resolve(doctor.root), path.resolve(WORKFLOW))

    // manifest
    const manifest = await byName.get('paper_manifest').execute({}, { signal: new AbortController().signal })
    assert.equal(manifest.phaseCount, 18)
    assert.equal(manifest.gateCount, GATES.length)

    // doc read must succeed from the bundled copy
    const doc = await byName.get('paper_doc').execute({ doc: 'workflow', mode: 'outline' }, { signal: new AbortController().signal })
    assert.equal(doc.found, true, '应能从自带副本读取工作流文档')
    assert.ok(doc.sections.length > 10)

    const index = await byName.get('paper_doc').execute({ doc: 'skills-index' }, { signal: new AbortController().signal })
    assert.equal(index.found, true, '应能读取内置技能清单')

    // a phase journal must be writable into the bundled tree
    const log = await byName.get('paper_phase_log').execute(
      { phase: 0, goal: '自包含检查', skills: ['world-model-method'], evidenceState: 'SUPPORTED', overwrite: true },
      { signal: new AbortController().signal },
    )
    assert.ok(log.absolutePath.startsWith(path.resolve(WORKFLOW)), `写入路径应在自带目录内：${log.absolutePath}`)
    const written = await readFile(log.absolutePath, 'utf8')
    assert.match(written, /Phase 0：项目检查/)
    await rm(log.absolutePath, { force: true })
    await rm(path.dirname(log.absolutePath), { recursive: true, force: true })
  } finally {
    process.chdir(prevCwd)
    if (prevRoot !== undefined) process.env.DSH_PAPER_GOGO_ROOT = prevRoot
    if (prevRoot2 !== undefined) process.env.PAPER_GOGO_ROOT = prevRoot2
    await rm(tmp, { recursive: true, force: true })
  }
})

await test('preferBundled=false 时优先使用外部 Paper-gogo 包', async () => {
  const external = 'D:\\Skills\\Paper-gogo-v2'
  if (!(await exists(external))) {
    console.log('         （跳过：本机没有外部 Paper-gogo 包）')
    return
  }
  const resolved = await resolveWorkflowRoot({ root: external, preferBundled: false })
  assert.equal(resolved.source, 'config.root')
  assert.equal(path.resolve(resolved.root), path.resolve(external))
  assert.equal(resolved.bundled, false)
})

console.log(`\n${'-'.repeat(62)}`)
console.log(`自包含检查：通过 ${passed} 项，失败 ${failed} 项`)
if (failed > 0) {
  console.log('\n失败明细：')
  for (const f of failures) console.log(`\n- ${f.name}\n  ${f.err.stack || f.err.message}`)
  process.exit(1)
}
console.log('插件可独立安装使用，不依赖外部 Paper-gogo 包。')
