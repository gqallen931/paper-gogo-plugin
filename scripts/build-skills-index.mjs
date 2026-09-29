/**
 * Regenerate `workflow/SKILLS_INDEX.md` from the skills actually bundled.
 *
 * The index is generated rather than hand-written so it cannot drift from the
 * vendored content.
 *
 * `node scripts/build-skills-index.mjs`
 */

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '..')
const WORKFLOW = path.join(PROJECT_ROOT, 'workflow')

/**
 * Read one scalar field from a frontmatter block, handling plain values,
 * quoted values, and YAML block scalars (`>-`, `|`, `|-`, `>+`).
 */
function readField(block, key) {
  const lines = block.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(new RegExp(`^${key}:\\s*(.*)$`))
    if (!m) continue
    const inline = m[1].trim()

    // Block scalar: fold (or keep) the following more-indented lines.
    if (/^[|>][+-]?$/.test(inline)) {
      const fold = inline.startsWith('>')
      const body = []
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === '') {
          body.push('')
          continue
        }
        if (!/^\s/.test(lines[j])) break // dedented: block ended
        body.push(lines[j].trim())
      }
      const text = body.join(fold ? ' ' : '\n').replace(/\s+/g, ' ').trim()
      return text || null
    }

    return inline.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ') || null
  }
  return null
}

/** Read `name` and `description` from a SKILL.md YAML frontmatter block. */
async function readFrontmatter(file) {
  let raw
  try {
    raw = await readFile(file, 'utf8')
  } catch {
    return { name: null, description: null }
  }
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const block = match ? match[1] : ''
  return {
    name: readField(block, 'name'),
    description: readField(block, 'description'),
  }
}

/**
 * Find every directory containing a SKILL.md under `root`.
 *
 * Descends through collections: `extras/academic-research-skills/academic-paper/`
 * counts as a skill, while the collection directory above it does not. A
 * directory that has a SKILL.md is still descended into, so a collection root
 * cannot shadow the skills it contains; only leaf skills are reported.
 */
async function collectSkills(root) {
  const out = []
  async function walk(dir, depth) {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    const hasSkill = entries.some((e) => e.isFile() && e.name === 'SKILL.md')
    if (hasSkill && depth > 0) out.push(dir)

    const subdirs = entries.filter(
      (e) => e.isDirectory() && !['node_modules', '__pycache__', '.git'].includes(e.name),
    )
    // A skill with a SKILL.md and no skill-bearing subdirectories is a leaf;
    // anything else (a collection, or a skill that bundles more skills) is walked.
    for (const e of subdirs) await walk(path.join(dir, e.name), depth + 1)
  }
  await walk(root, 0)
  return out.sort()
}

const SKILL_GROUPS = [
  'nature-skills',
  'code-understanding',
  'architecture-engineering',
  'world-model-method',
  'paper-framework-figure-studio-pro',
  'karpathy-guidelines',
  'python-expert',
]

const skillsRoot = path.join(WORKFLOW, 'skills')
const extrasRoot = path.join(WORKFLOW, 'extras')

async function describe(dir) {
  const rel = path.relative(WORKFLOW, dir).split(path.sep).join('/')
  const fm = await readFrontmatter(path.join(dir, 'SKILL.md'))
  return { rel, name: fm.name ?? path.basename(dir), description: fm.description }
}

/**
 * One walk of the skills root is the single source of truth for both the index
 * body and the summary. Walking per group instead would drop a group that is
 * itself a skill (karpathy-guidelines, python-expert, world-model-method,
 * paper-framework-figure-studio-pro): relative to its own group directory such
 * a skill sits at depth 0.
 */
const allWorkflowSkills = await collectSkills(skillsRoot)
const workflowSkillsByGroup = new Map()
for (const dir of allWorkflowSkills) {
  const group = path.relative(skillsRoot, dir).split(path.sep)[0]
  if (!workflowSkillsByGroup.has(group)) workflowSkillsByGroup.set(group, [])
  workflowSkillsByGroup.get(group).push(dir)
}

const extras = await collectSkills(extrasRoot)
const total = allWorkflowSkills.length + extras.length

const lines = []
lines.push('# 内置技能清单')
lines.push('')
lines.push('本文件由 `scripts/build-skills-index.mjs` 自动生成，请勿手改。它列出插件 `workflow/` 目录中实际内置的技能。')
lines.push('')
lines.push('Paper-gogo 的规则是：**只有解压为目录且存在可读取 `SKILL.md` 的技能才能被路由调用**。下面每一项都满足该条件。')
lines.push('')

lines.push('## 工作流技能（`workflow/skills/`）')
lines.push('')
for (const group of SKILL_GROUPS) {
  const found = workflowSkillsByGroup.get(group) ?? []
  if (found.length === 0) continue
  lines.push(`### ${group}（${found.length} 个）`)
  lines.push('')
  lines.push('| 技能 | 说明 |')
  lines.push('|---|---|')
  for (const d of found) {
    const info = await describe(d)
    lines.push(`| \`${info.name}\` | ${info.description ?? '（未声明 description）'} |`)
  }
  lines.push('')
}

if (extras.length > 0) {
  /*
   * The index is consumed from two places with different layouts:
   *   - plugin:  <plugin>/workflow/SKILLS_INDEX.md  -> extras live at extras/
   *   - package: <package>/SKILLS_INDEX.md          -> extras are copied to extra-skills/
   * The basename alone cannot distinguish them, so the layout is passed
   * explicitly: --layout=plugin (default) or --layout=package.
   */
  const layoutArg = process.argv.find((a) => a.startsWith('--layout='))
  const layout = layoutArg ? layoutArg.split('=')[1] : 'plugin'
  const extrasPrefix = layout === 'package' ? 'extra-skills' : 'extras'

  lines.push('## 附加技能合集（`' + extrasPrefix + '/`）')
  lines.push('')
  lines.push(
    `这些是补充的第三方技能合集。**许可证与工作流技能不同**，见 [${extrasPrefix}/THIRD_PARTY_NOTICES.extras.md](${extrasPrefix}/THIRD_PARTY_NOTICES.extras.md)。`,
  )
  lines.push('')
  lines.push('| 技能 | 所属合集 | 说明 |')
  lines.push('|---|---|---|')
  for (const d of extras) {
    const info = await describe(d)
    const parts = info.rel.split('/')
    const collection = parts[1] ?? 'extras'
    lines.push(`| \`${info.name}\` | \`${collection}\` | ${info.description ?? '（未声明 description）'} |`)
  }
  lines.push('')
}

lines.push('## 汇总')
lines.push('')
lines.push(`- 内置技能总数：**${total}**`)
lines.push(`- 工作流技能组：${SKILL_GROUPS.length}`)
lines.push(`- 附加合集：${[...new Set(extras.map((d) => path.relative(WORKFLOW, d).split(path.sep)[1]))].join('、') || '无'}`)
lines.push('')
lines.push('## 未内置的内容')
lines.push('')
lines.push('- 图片/PDF 等媒体资产已从内置副本中剥离以控制体积。依赖内置图片的技能（如 `paper-comic`、`paper-deck`）保真度会下降。')
lines.push('- 与工作流无关的技能合集（动画、股票分析、代码图工具、无人值守自动化等）未纳入。')
lines.push('')

const outPath = path.join(WORKFLOW, 'SKILLS_INDEX.md')
await writeFile(outPath, lines.join('\n'), 'utf8')

// Self-consistency guard: the summary must equal what was actually written.
const counted = allWorkflowSkills.length + extras.length
if (counted !== total) {
  throw new Error(`技能计数自相矛盾：汇总为 ${total}，实际为 ${counted}`)
}

process.stdout.write(`已生成 ${path.relative(PROJECT_ROOT, outPath)}：${total} 个技能\n`)
for (const [group, n] of [...workflowSkillsByGroup.entries()].map(([g, v]) => [g, v.length])) {
  process.stdout.write(`  ${group}: ${n}\n`)
}
process.stdout.write(`  extras: ${extras.length}\n`)
