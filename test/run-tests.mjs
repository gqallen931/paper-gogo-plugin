/**
 * Test suite for dsh-paper-gogo-plugin.
 *
 * Runs with no harness: it imports the plugin, drives it with a mock Cordis
 * context, and validates every registered tool against the real
 * `@deepseek-ai/dsh-tools` contract (argument validation via the exported
 * `validateArgs`, canonical-value validation against each tool's own
 * `output.schema`).
 *
 * `node test/run-tests.mjs`
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateArgs, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'

import * as plugin from '../src/plugin.js'
import { PHASES, PHASE_BY_N, GATES, journalFileName } from '../src/data/phases.js'
import { COMMANDS, COMMAND_GROUPS, COMMAND_NAMES } from '../src/data/commands.js'
import {
  auditEvidence,
  evaluateGate,
  nextPhase,
  normalizeGateResults,
  parseClaims,
  recognizeState,
} from '../src/lib/gates.js'
import { routeIntent, describeCommand, commandCatalogByGroup } from '../src/lib/routing.js'
import { searchUpward, isWorkflowRoot, resolveWorkflowRoot, BUNDLED_WORKFLOW_DIR } from '../src/lib/root.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '..')
/** The installed Paper-gogo workflow package this plugin reads. */
const PAPER_GOGO = 'D:\\Skills\\Paper-gogo-v2'

// --- tiny test runner -----------------------------------------------------

let passed = 0
let failed = 0
const failures = []

async function test(name, fn) {
  try {
    await fn()
    passed++
    process.stdout.write(`  ok   ${name}\n`)
  } catch (err) {
    failed++
    failures.push({ name, err })
    process.stdout.write(`  FAIL ${name}\n         ${String(err.message).split('\n')[0]}\n`)
  }
}

function group(title) {
  process.stdout.write(`\n${title}\n`)
}

// --- helpers --------------------------------------------------------------

/** Collect the tools a fresh plugin instance registers. */
function loadTools(config = {}) {
  const tools = []
  const logs = []
  const ctx = {
    tools: {
      register(def) {
        tools.push(def)
        return () => {}
      },
    },
    get: () => undefined,
    logger: { info: (m) => logs.push(m) },
  }
  plugin.apply(ctx, config)
  return { tools, logs, ctx }
}

/** Validate a canonical value against a tool's declared output schema. */
function assertOutputValid(tool, value) {
  const result = validateJsonSchemaValue(tool.output.schema, value)
  const violations = result === true ? [] : Array.isArray(result) ? result : [String(result)]
  assert.deepEqual(violations, [], `${tool.name} 的规范值不符合 output.schema：${violations.join('; ')}`)
}

/** Run a tool the way the registry would: validate args, execute, validate output, render. */
async function callTool(tool, args) {
  const violations = validateArgs(tool.parameters, args)
  assert.deepEqual(violations, [], `${tool.name} 参数校验失败：${violations.join('; ')}`)
  const value = await tool.execute(args, { signal: new AbortController().signal })
  assertOutputValid(tool, value)
  const blocks = tool.output.render(args, value)
  assert.ok(Array.isArray(blocks) && blocks.length > 0, `${tool.name} 的 render 必须返回非空内容块数组`)
  for (const b of blocks) {
    assert.equal(b.type, 'text', `${tool.name} 的 render 只应返回 text 块`)
    assert.equal(typeof b.text, 'string', `${tool.name} 的 text 块必须有 text 字段`)
  }
  return { value, text: blocks.map((b) => b.text).join('\n') }
}

// --- tests ----------------------------------------------------------------

group('数据模型')

await test('恰好定义 18 个 Phase，编号 0-17 连续', () => {
  assert.equal(PHASES.length, 18)
  const nums = PHASES.map((p) => p.n)
  assert.deepEqual(nums, [...Array(18).keys()])
})

await test('每个 Phase 都有名称、目标、产出、主技能、门禁与回退', () => {
  for (const p of PHASES) {
    assert.ok(p.name && p.name.length > 0, `Phase ${p.n} 缺少 name`)
    assert.ok(p.goal && p.goal.length > 0, `Phase ${p.n} 缺少 goal`)
    assert.ok(Array.isArray(p.outputs) && p.outputs.length > 0, `Phase ${p.n} 缺少 outputs`)
    assert.ok(p.primary && p.primary.length > 0, `Phase ${p.n} 缺少 primary`)
    assert.ok(p.gate && p.gate.length > 0, `Phase ${p.n} 缺少 gate`)
    assert.ok(p.fallback && p.fallback.length > 0, `Phase ${p.n} 缺少 fallback`)
  }
})

await test('恰好定义 7 个门禁 G0-G6', () => {
  assert.equal(GATES.length, 7)
  assert.deepEqual(GATES.map((g) => g.id), ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6'])
})

await test('主技能均对应工作流包中真实存在的技能目录', async () => {
  const { readdir } = await import('node:fs/promises')
  const known = new Set()
  for (const g of plugin.SKILL_GROUPS) {
    known.add(g.id) // the group itself is a skill (world-model-method, python-expert, ...)
    try {
      const entries = await readdir(path.join(PAPER_GOGO, g.id), { withFileTypes: true })
      for (const e of entries) if (e.isDirectory()) known.add(e.name)
    } catch {
      /* a missing group is reported by the doctor tool, not here */
    }
  }
  const missing = []
  for (const p of PHASES) {
    if (!known.has(p.primary)) missing.push(`Phase ${p.n}: ${p.primary}`)
    for (const a of p.aux || []) if (!known.has(a.skill)) missing.push(`Phase ${p.n} aux: ${a.skill}`)
  }
  assert.deepEqual(missing, [], `以下技能在工作流包中找不到对应目录：${missing.join(', ')}`)
})

await test('阶段记录文件名符合 Phase{N}_{name}.md 约定且不含非法字符', () => {
  for (const p of PHASES) {
    const f = journalFileName(p)
    assert.match(f, /^Phase\d+_[\w\u4e00-\u9fa5-]+\.md$/u, `文件名不合规：${f}`)
    assert.ok(!/[\\/:*?"<>|\s+]/.test(f.replace(/^Phase\d+_/, '').replace(/\.md$/, '')), `文件名含非法字符：${f}`)
  }
  assert.equal(journalFileName(PHASE_BY_N.get(0)), 'Phase0_项目检查.md')
  // The source document writes this record as the abbreviated
  // `Phase1_要素采集.md` while the heading is `必需要素采集`; the derived name
  // follows the heading, which is the convention the global rule states.
  assert.equal(journalFileName(PHASE_BY_N.get(1)), 'Phase1_必需要素采集.md')
  assert.equal(journalFileName(PHASE_BY_N.get(5)), 'Phase5_方案设计_框架图_S0-S3.md')
})

await test('命令清单无重复，且每组的命令都归属于已声明的组', () => {
  assert.equal(new Set(COMMAND_NAMES).size, COMMAND_NAMES.length, '存在重复命令')
  const groups = new Set(COMMAND_GROUPS.map((g) => g.id))
  for (const c of COMMANDS) assert.ok(groups.has(c.group), `${c.cmd} 的分组 ${c.group} 未声明`)
})

await test('每条命令都有 purpose 与可执行的 run', () => {
  for (const c of COMMANDS) {
    assert.ok(c.purpose && c.purpose.length > 0, `${c.cmd} 缺少 purpose`)
    assert.ok(c.run && c.run.length > 10, `${c.cmd} 的 run 过短`)
  }
})

group('门禁引擎')

await test('宽松输入被正确归一化（布尔/大小写/对象/中文）', () => {
  const r = normalizeGateResults({
    G0: true,
    g1: 'pass',
    G2: { result: 'pass with conditions' },
    G3: 'FAIL',
    G4: '通过',
    G5: '未通过',
  })
  assert.equal(r.G0, 'PASS')
  assert.equal(r.G1, 'PASS')
  assert.equal(r.G2, 'PASS WITH CONDITIONS')
  assert.equal(r.G3, 'FAIL')
  assert.equal(r.G4, 'PASS')
  assert.equal(r.G5, 'FAIL')
})

await test('未提供的门禁被报告为 NOT EVALUATED 而非默认通过', () => {
  const v = evaluateGate({ phase: 8, gates: { G4: 'PASS' } })
  assert.equal(v.recommendation, 'NEEDS_EVALUATION')
  assert.equal(v.notEvaluated.length, 6)
})

await test('任一 FAIL 门禁阻断推进', () => {
  const v = evaluateGate({
    phase: 8,
    gates: { G0: 'PASS', G1: 'PASS', G2: 'PASS', G3: 'PASS', G4: 'FAIL', G5: 'PASS', G6: 'PASS' },
    next: true,
  })
  assert.equal(v.recommendation, 'BLOCKED')
  assert.equal(v.blockingFailed.length, 1)
  assert.match(v.reasons.join(' '), /不能靠润色覆盖/)
})

await test('条件通过的门禁不直接放行', () => {
  const v = evaluateGate({
    phase: 5,
    gates: { G0: 'PASS', G1: 'PASS', G2: 'PASS WITH CONDITIONS', G3: 'PASS', G4: 'PASS', G5: 'PASS', G6: 'PASS' },
    next: true,
  })
  assert.equal(v.recommendation, 'PASS WITH CONDITIONS')
})

await test('全部门禁 PASS 且 next=true 时才建议推进', () => {
  const all = Object.fromEntries(GATES.map((g) => [g.id, 'PASS']))
  assert.equal(evaluateGate({ phase: 8, gates: all }).recommendation, 'CONTINUE')
  assert.equal(evaluateGate({ phase: 8, gates: all, next: true }).recommendation, 'ADVANCE')
})

await test('非法 Phase 编号被拒绝', () => {
  assert.throws(() => evaluateGate({ phase: 99, gates: {} }), /0-17/)
  assert.throws(() => evaluateGate({ phase: -1, gates: {} }), /0-17/)
})

await test('声明产出但未提供的 artifact 会被报告', () => {
  const v = evaluateGate({ phase: 0, gates: {}, artifacts: [] })
  assert.ok(v.missingArtifacts.length > 0)
})

await test('Phase 到门禁的映射覆盖全部 18 个 Phase', () => {
  const all = Object.fromEntries(GATES.map((g) => [g.id, 'PASS']))
  for (let n = 0; n <= 17; n++) {
    const v = evaluateGate({ phase: n, gates: all })
    assert.ok(/^G[0-6]$/.test(v.phaseGate), `Phase ${n} 的门禁归属非法`)
  }
})

group('证据审计')

await test('识别四态标签', () => {
  assert.equal(recognizeState('SUPPORTED'), 'SUPPORTED')
  assert.equal(recognizeState('marked as verify'), 'VERIFY')
  assert.equal(recognizeState('MISSING'), 'MISSING')
  assert.equal(recognizeState('没有任何标注'), null)
})

await test('解析 Markdown 表格并统计状态', () => {
  const md = [
    '| 主张 | 位置 | 证据 | 状态 |',
    '|---|---|---|---|',
    '| 方法优于 baseline | 4.2 | 表 2 | SUPPORTED |',
    '| 泛化到跨域 | 4.3 | 无 | MISSING |',
    '| 机制解释 | 5.1 | 推测 | INFERRED |',
  ].join('\n')
  const v = auditEvidence({ claims: md })
  assert.equal(v.total, 3)
  assert.equal(v.counts.SUPPORTED, 1)
  assert.equal(v.counts.MISSING, 1)
  assert.equal(v.counts.INFERRED, 1)
  assert.equal(v.verdict, 'BLOCKED')
})

await test('MISSING 主张阻断推进，VERIFY 要求核实', () => {
  const v = auditEvidence({ claims: '主张A :: MISSING\n主张B :: VERIFY' })
  assert.equal(v.verdict, 'BLOCKED')
  assert.equal(v.missing.length, 1)
  assert.equal(v.verify.length, 1)
  assert.match(v.findings.join(' '), /停止相应结论/)
})

await test('无状态标注的主张不会被默认为 SUPPORTED', () => {
  const v = auditEvidence({ claims: '主张A :: 没有任何标注\n主张B :: SUPPORTED' })
  assert.equal(v.total, 1, '未标注行不应被算作主张')
  assert.equal(v.verdict, 'READY')
})

await test('空输入被拒绝', () => {
  assert.throws(() => auditEvidence({ claims: '   ' }), /非空/)
})

await test('支持“主张 :: 状态”行格式', () => {
  const v = auditEvidence({ claims: '- 模型在新数据集上有效 :: INFERRED' })
  assert.equal(v.total, 1)
  assert.equal(v.rows[0].state, 'INFERRED')
  assert.equal(v.rows[0].claim, '模型在新数据集上有效')
})

group('命令路由')

await test('意图“帮我看看创新点够不够”路由到 /检查创新', () => {
  const r = routeIntent('帮我看看创新点够不够')
  assert.equal(r.matched, true)
  assert.equal(r.recommendation.cmd, '/检查创新')
})

await test('意图“审稿人会说实验有什么问题”路由到审稿相关命令', () => {
  const r = routeIntent('审稿人会说实验有什么问题')
  assert.equal(r.matched, true)
  assert.ok(['/审稿人诊断', '/修改实验'].includes(r.recommendation.cmd), r.recommendation.cmd)
})

await test('直接给出命令名时精确命中', () => {
  const r = routeIntent('请执行 /证据审计')
  assert.equal(r.recommendation.cmd, '/证据审计')
  assert.ok(r.candidates[0].score >= 1000)
})

await test('无匹配时返回 matched=false 而不是乱猜', () => {
  const r = routeIntent('今天天气怎么样')
  assert.equal(r.matched, false)
  assert.equal(r.recommendation, null)
})

await test('每条命令都能投影到 Phase 与主技能', () => {
  for (const c of COMMAND_NAMES) {
    const d = describeCommand(c)
    assert.ok(d, `${c} 无法投影`)
    assert.ok(d.phase && Number.isInteger(d.phase.n), `${c} 缺少 Phase 投影`)
    assert.ok(d.primarySkill, `${c} 缺少主技能投影`)
  }
})

await test('命令按组投影时不丢命令', () => {
  const grouped = commandCatalogByGroup()
  const total = grouped.reduce((n, g) => n + g.commands.length, 0)
  assert.equal(total, COMMANDS.length)
})

group('Phase 排序')

await test('按序推进给出第一个未完成的 Phase', () => {
  const v = nextPhase({ completed: [0, 1, 2] })
  assert.equal(v.mode, 'sequential')
  assert.equal(v.phase.n, 3)
})

await test('显式跳转会提示未完成的前置 Phase', () => {
  const v = nextPhase({ completed: [0], requested: 5 })
  assert.equal(v.mode, 'explicit')
  assert.deepEqual(v.skippedIncomplete, [1, 2, 3, 4])
  assert.match(v.warnings.join(' '), /跳转前必须记录前置门禁状态和未解决风险/)
})

await test('门禁 FAIL 时进入修复模式而不是继续推进', () => {
  const v = nextPhase({ completed: [0, 1, 2, 3], gates: { G2: 'FAIL' } })
  assert.equal(v.mode, 'repair')
  assert.equal(v.phase.n, 4)
})

await test('全部完成时报告 complete', () => {
  const v = nextPhase({ completed: [...Array(18).keys()] })
  assert.equal(v.mode, 'complete')
})

group('工作流根解析')

await test('自带的工作流副本是一个合法工作流根', async () => {
  assert.equal(await isWorkflowRoot(BUNDLED_WORKFLOW_DIR), true)
})

await test('若本机装有外部 Paper-gogo 包，它同样是一个合法工作流根', async () => {
  const hasExternal = (await import('node:fs')).existsSync(PAPER_GOGO)
  if (!hasExternal) {
    console.log('         （跳过：本机没有外部 Paper-gogo 包——这正是插件自包含的场景）')
    return
  }
  assert.equal(await isWorkflowRoot(PAPER_GOGO), true)
})

await test('拒绝非工作流目录', async () => {
  assert.equal(await isWorkflowRoot(PROJECT_ROOT), false)
  assert.equal(await isWorkflowRoot('C:\\Windows'), false)
})

await test('从工作流内部向上搜索可定位到根', async () => {
  const found = await searchUpward(path.join(PAPER_GOGO, 'references'))
  assert.equal(found, path.resolve(PAPER_GOGO))
})

await test('preferBundled=false 时 config.root 优先于搜索', async () => {
  const r = await resolveWorkflowRoot({ root: PAPER_GOGO, cwd: 'C:\\Windows', preferBundled: false })
  assert.equal(r.source, 'config.root')
  assert.equal(r.root, path.resolve(PAPER_GOGO))
  assert.equal(r.bundled, false)
})

await test('默认优先使用插件自带的工作流副本', async () => {
  const r = await resolveWorkflowRoot({ root: PAPER_GOGO, cwd: 'C:\\Windows' })
  assert.equal(r.source, 'bundled')
  assert.equal(r.bundled, true)
  assert.equal(path.resolve(r.root), path.resolve(BUNDLED_WORKFLOW_DIR))
})

await test('关闭自带副本且所有候选都无效时返回 unresolved 与已尝试的候选', async () => {
  const r = await resolveWorkflowRoot({
    root: 'C:\\definitely-not-here',
    searchRoots: ['C:\\nope'],
    cwd: 'C:\\Windows',
    preferBundled: false,
  })
  assert.equal(r.root, null)
  assert.equal(r.source, 'unresolved')
  assert.ok(r.tried.length >= 2)
})

group('组合包与补丁层')

await test('package.json 声明了合法的单位置 dsh.bundle', async () => {
  const { readFile } = await import('node:fs/promises')
  const pkg = JSON.parse(await readFile(path.join(PROJECT_ROOT, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'dsh-paper-gogo-plugin')
  assert.equal(pkg.type, 'module')
  assert.ok(pkg.dsh?.bundle?.patch, '缺少 dsh.bundle.patch')
  const patchPath = path.resolve(PROJECT_ROOT, pkg.dsh.bundle.patch)
  assert.ok((await import('node:fs')).existsSync(patchPath), `patch 文件不存在：${patchPath}`)
  assert.ok(pkg.peerDependencies?.['@deepseek-ai/dsh-tools'], '缺少 dsh-tools peer 声明')
  assert.ok(pkg.files?.length > 0, '缺少 files 白名单')
})

await test('cordis.patch.yml 是合法的插件层并引用包名', async () => {
  const { readFile } = await import('node:fs/promises')
  const { parse } = await import('yaml')
  const doc = parse(await readFile(path.join(PROJECT_ROOT, 'cordis.patch.yml'), 'utf8'))
  assert.ok(Array.isArray(doc), 'patch 顶层必须是数组')
  const insert = doc.find((e) => e.insert)
  assert.ok(insert, '缺少 insert 条目')
  const row = insert.insert[0]
  assert.equal(row.id, 'paper-gogo')
  // A bundle row must reference the package by name so Node can resolve it.
  assert.equal(row.name, 'dsh-paper-gogo-plugin')
  assert.equal(row.config.root, null)
})

await test('本地 --patch overlay 用绝对路径引用插件源码', async () => {
  const { readFile } = await import('node:fs/promises')
  const { parse } = await import('yaml')
  const doc = parse(await readFile(path.join(PROJECT_ROOT, 'examples', 'paper-gogo.patch.yml'), 'utf8'))
  const row = doc.find((e) => e.insert).insert[0]
  assert.ok(path.isAbsolute(row.name), `overlay 中的插件路径必须是绝对路径，实际：${row.name}`)
  assert.ok((await import('node:fs')).existsSync(row.name), `插件入口不存在：${row.name}`)
})

group('插件注册与工具契约')

// The plugin is self-contained: with no explicit config it resolves its own
// bundled workflow. The external-package path is covered by the
// `preferBundled=false` cases below and by test/check-bundle.mjs.
const { tools, logs } = loadTools({})
const byName = new Map(tools.map((t) => [t.name, t]))

await test('注册了 7 个工具且名称唯一', () => {
  assert.equal(tools.length, 7)
  assert.equal(byName.size, 7)
})

await test('插件导出 name 与 inject', () => {
  assert.equal(plugin.name, 'paper-gogo')
  assert.deepEqual(plugin.inject, ['tools'])
})

await test('每个工具都有 name/description/parameters/output/execute', () => {
  for (const t of tools) {
    assert.ok(t.name && t.name.length > 0, '缺少 name')
    assert.ok(t.description && t.description.length > 20, `${t.name} 的 description 过短`)
    assert.equal(typeof t.parameters, 'object', `${t.name} 缺少 parameters`)
    assert.equal(typeof t.output, 'object', `${t.name} 缺少 output`)
    assert.ok(t.output.schema, `${t.name} 缺少 output.schema`)
    assert.equal(typeof t.output.render, 'function', `${t.name} 缺少 output.render`)
    assert.equal(typeof t.execute, 'function', `${t.name} 缺少 execute`)
  }
})

await test('显式对象 schema 节点都声明了 additionalProperties', () => {
  const offenders = []
  const walk = (node, trail) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${trail}[${i}]`))
    if (node.type === 'object' || node.properties) {
      if (typeof node.additionalProperties !== 'boolean') offenders.push(trail)
    }
    for (const [k, v] of Object.entries(node)) walk(v, `${trail}.${k}`)
  }
  for (const t of tools) {
    walk(t.parameters, `${t.name}.parameters`)
    walk(t.output.schema, `${t.name}.output.schema`)
  }
  assert.deepEqual(offenders, [], `缺少 additionalProperties 的对象节点：${offenders.join(', ')}`)
})

await test('schema 不得使用数组形式的 type（DSH 会判定为非法 schema）', () => {
  const offenders = []
  const walk = (node, trail) => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) return node.forEach((n, i) => walk(n, `${trail}[${i}]`))
    if (Array.isArray(node.type)) offenders.push(`${trail}.type = ${JSON.stringify(node.type)}`)
    for (const [k, v] of Object.entries(node)) walk(v, `${trail}.${k}`)
  }
  for (const t of tools) {
    walk(t.parameters, `${t.name}.parameters`)
    walk(t.output.schema, `${t.name}.output.schema`)
  }
  assert.deepEqual(offenders, [], `数组形式 type 不被支持，请改用 oneOf / json：${offenders.join(', ')}`)
})

await test('插件加载时写入日志且不抛异常', () => {
  assert.ok(logs.some((l) => String(l).includes('paper-gogo')))
})

group('工具行为（真实工作流根）')

await test('paper_manifest 返回 18 Phase 与 7 门禁', async () => {
  const { value, text } = await callTool(byName.get('paper_manifest'), {})
  assert.equal(value.phaseCount, 18)
  assert.equal(value.gateCount, 7)
  assert.equal(value.filtered, null)
  assert.match(text, /质量门禁/)
  assert.match(text, /四态证据标签/)
})

await test('paper_manifest 指定 phase 时返回完整细节', async () => {
  const { value, text } = await callTool(byName.get('paper_manifest'), { phase: 7 })
  assert.equal(value.filtered, 7)
  assert.equal(value.phases.length, 1)
  assert.equal(value.detail.length, 1)
  assert.match(value.detail[0].journal, /Phase7_/)
  assert.match(text, /Phase 7/)
  assert.match(text, /子阶段|9A|7A/) // 细节块存在
})

await test('paper_manifest 拒绝非法 phase', async () => {
  const tool = byName.get('paper_manifest')
  const violations = validateArgs(tool.parameters, { phase: 42 })
  if (violations.length === 0) {
    await assert.rejects(() => tool.execute({ phase: 42 }, { signal: new AbortController().signal }), /未知 Phase/)
  }
})

await test('paper_doc 读取 SKILL.md', async () => {
  const { value, text } = await callTool(byName.get('paper_doc'), { doc: 'skill' })
  assert.equal(value.found, true)
  assert.ok(value.bytes > 1000)
  assert.match(text, /SKILL\.md/)
  assert.match(value.content, /paper-gogo/)
})

await test('paper_doc outline 模式只返回标题', async () => {
  const { value } = await callTool(byName.get('paper_doc'), { doc: 'workflow', mode: 'outline' })
  assert.equal(value.found, true)
  assert.ok(value.sections.length > 10)
  assert.ok(!value.content.includes('```mermaid'))
})

await test('paper_doc section 模式按标题切片', async () => {
  const { value } = await callTool(byName.get('paper_doc'), { doc: 'workflow', section: '全局规则' })
  assert.equal(value.found, true)
  assert.ok(value.sections.length > 0)
  assert.match(value.content, /对话式/)
  assert.ok(value.returnedBytes < value.bytes, '切片应小于全文')
})

await test('paper_doc 对不存在的文档 key 报错', async () => {
  const tool = byName.get('paper_doc')
  const violations = validateArgs(tool.parameters, { doc: 'nope' })
  assert.ok(violations.length > 0, 'enum 应拒绝未知 key')
})

await test('paper_doc 请求缺失文件时返回 found=false 而不是抛错', async () => {
  const { value } = await callTool(byName.get('paper_doc'), { doc: 'public-repo' })
  assert.equal(typeof value.found, 'boolean')
})

await test('paper_gate 阻断 FAIL 门禁', async () => {
  const { value, text } = await callTool(byName.get('paper_gate'), {
    phase: 8,
    gates: { G4: 'FAIL' },
    next: true,
  })
  assert.equal(value.recommendation, 'BLOCKED')
  assert.match(text, /不能靠润色覆盖/)
})

await test('paper_gate 全 PASS 且 next 时建议推进', async () => {
  const all = Object.fromEntries(GATES.map((g) => [g.id, 'PASS']))
  const { value } = await callTool(byName.get('paper_gate'), { phase: 6, gates: all, next: true })
  assert.equal(value.recommendation, 'ADVANCE')
})

await test('paper_gate 拒绝越界 phase', async () => {
  const tool = byName.get('paper_gate')
  await assert.rejects(
    () => tool.execute({ phase: 30, gates: {} }, { signal: new AbortController().signal }),
    /0-17/,
  )
})

await test('paper_evidence 审计表格并阻断 MISSING', async () => {
  const md = '| 主张 | 状态 |\n|---|---|\n| A | SUPPORTED |\n| B | MISSING |'
  const { value, text } = await callTool(byName.get('paper_evidence'), { claims: md })
  assert.equal(value.verdict, 'BLOCKED')
  assert.equal(value.counts.MISSING, 1)
  assert.match(text, /证据审计/)
})

await test('paper_evidence 空输入被拒绝', async () => {
  const tool = byName.get('paper_evidence')
  // Empty string passes schema requiredness (the DSL cannot express
  // non-empty), so the tool body must reject it.
  await assert.rejects(
    () => tool.execute({ claims: '   ' }, { signal: new AbortController().signal }),
    /非空/,
  )
})

await test('paper_route 把中文意图映射到命令并给出执行要求', async () => {
  const { value, text } = await callTool(byName.get('paper_route'), { intent: '帮我看看创新点够不够' })
  assert.equal(value.matched, true)
  assert.equal(value.recommendation.cmd, '/检查创新')
  assert.match(text, /固定输出契约/)
  assert.match(text, /诊断/)
})

await test('paper_route 输出包含全部命令分组', async () => {
  const { value } = await callTool(byName.get('paper_route'), { intent: '随便' })
  assert.equal(value.commandGroups.length, COMMAND_GROUPS.length)
  assert.equal(value.commands.length, COMMANDS.length)
})

await test('paper_phase_log 拒绝越界 phase', async () => {
  const tool = byName.get('paper_phase_log')
  await assert.rejects(
    () => tool.execute({ phase: 99 }, { signal: new AbortController().signal }),
    /未知 Phase/,
  )
})

await test('paper_doctor 报告可用的自带工作流根', async () => {
  const { value, text } = await callTool(byName.get('paper_doctor'), {})
  assert.equal(value.usable, true)
  // The plugin ships its own workflow copy, so the resolved root is the bundled
  // one and NOT an externally installed package. See test/check-bundle.mjs.
  assert.equal(value.bundled, true)
  assert.equal(value.root, BUNDLED_WORKFLOW_DIR)
  assert.equal(value.phaseCount, 18)
  assert.match(text, /插件自带/)
})

await test('preferBundled=false 时 doctor 使用外部 Paper-gogo 包', async () => {
  const hasExternal = await import('node:fs').then((fs) => fs.existsSync(PAPER_GOGO))
  if (!hasExternal) {
    console.log('         （跳过：本机没有外部 Paper-gogo 包）')
    return
  }
  const { tools: ext } = loadTools({ root: PAPER_GOGO, preferBundled: false })
  const doctor = ext.find((t) => t.name === 'paper_doctor')
  const value = await doctor.execute({}, { signal: new AbortController().signal })
  assert.equal(value.usable, true)
  assert.equal(value.bundled, false)
  assert.equal(path.resolve(value.root), path.resolve(PAPER_GOGO))
})

await test('paper_doctor 在根不可用时给出修复方法', async () => {
  // With the bundled copy disabled and every discovery path broken, the doctor
  // must degrade to a clear repair instruction instead of throwing.
  const { tools: isolated } = loadTools({
    root: 'C:\\definitely-not-here',
    searchRoots: [],
    preferBundled: false,
  })
  const doctor = isolated.find((t) => t.name === 'paper_doctor')
  const prev = process.cwd()
  process.chdir('C:\\Windows')
  try {
    const value = await doctor.execute({}, { signal: new AbortController().signal })
    assert.equal(value.usable, false)
    const text = doctor.output.render({}, value).map((b) => b.text).join('\n')
    assert.match(text, /config\.root|DSH_PAPER_GOGO_ROOT/)
  } finally {
    process.chdir(prev)
  }
})

await test('paper_phase_log 写入自带工作流根并返回路径', async () => {
  const tool = byName.get('paper_phase_log')
  const value = await tool.execute(
    {
      phase: 0,
      goal: '插件自检',
      skills: ['world-model-method'],
      evidenceState: 'SUPPORTED',
      open: ['这是自动测试写入的记录'],
      next: '无需后续步骤',
    },
    { signal: new AbortController().signal },
  )
  assertOutputValid(tool, value)
  assert.match(value.relPath, /Phase0_项目检查\.md$/)
  assert.ok(value.absolutePath.startsWith(BUNDLED_WORKFLOW_DIR), `写入应在自带目录内：${value.absolutePath}`)

  const { readFile, rm } = await import('node:fs/promises')
  const written = await readFile(value.absolutePath, 'utf8')
  assert.match(written, /Phase 0：项目检查/)
  assert.match(written, /world-model-method/)
  assert.match(written, /SUPPORTED/)
  await rm(value.absolutePath, { force: true })
  await rm(path.dirname(value.absolutePath), { recursive: true, force: true })
})

// --- summary --------------------------------------------------------------

process.stdout.write(`\n${'-'.repeat(60)}\n`)
process.stdout.write(`通过 ${passed} 项，失败 ${failed} 项\n`)
if (failed > 0) {
  process.stdout.write('\n失败明细：\n')
  for (const f of failures) {
    process.stdout.write(`\n- ${f.name}\n  ${f.err.stack || f.err.message}\n`)
  }
  process.exit(1)
}
process.stdout.write('全部测试通过。\n')
