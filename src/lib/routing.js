/**
 * Command routing: map free-form user intent onto the Paper-gogo command
 * system, and project each command onto its workflow phase and primary skill.
 */

import { COMMANDS, COMMAND_BY_CMD, COMMAND_KEYWORDS, COMMAND_GROUPS } from '../data/commands.js'
import { PHASES, PHASE_BY_N, SKILL_GROUPS } from '../data/phases.js'

/** Which workflow phase each command primarily operates on. */
const COMMAND_PHASE = {
  '/建立档案': 0,
  '/目标期刊': 0,
  '/提炼问题': 1,
  '/检查创新': 4,
  '/领域偏置': 4,
  '/评分': 4,
  '/审稿人诊断': 11,
  '/修改实验': 7,
  '/设计消融': 7,
  '/分析难例': 7,
  '/证据审计': 8,
  '/检查公式': 12,
  '/修改标题': 10,
  '/修改摘要': 10,
  '/修改引言': 10,
  '/修改相关工作': 10,
  '/修改方法': 10,
  '/修改结果': 10,
  '/修改讨论': 10,
  '/修改局限': 10,
  '/修改结论': 10,
  '/逐段修改': 10,
  '/学术润色': 15,
  '/压缩': 15,
  '/中译英': 15,
  '/英译中': 15,
  '/模拟拒稿': 16,
  '/投稿前检查': 14,
  '/回复审稿人': 17,
  '/生成汇报PPT': 3,
  '/补充引用': 12,
  '/数据可用性': 12,
  '/生成结果图': 9,
  '/生成图文摘要': 9,
  '/生成框架图': 13,
  '/代码实现': 6,
  '/诊断实验错误': 7,
}

/** Which bundled skill group owns each command. */
const COMMAND_SKILL_GROUP = {
  '/建立档案': 'world-model-method',
  '/目标期刊': 'world-model-method',
  '/提炼问题': 'architecture-engineering',
  '/检查创新': 'world-model-method',
  '/领域偏置': 'world-model-method',
  '/评分': 'world-model-method',
  '/审稿人诊断': 'nature-skills',
  '/修改实验': 'world-model-method',
  '/设计消融': 'world-model-method',
  '/分析难例': 'nature-skills',
  '/证据审计': 'world-model-method',
  '/检查公式': 'nature-skills',
  '/修改标题': 'nature-skills',
  '/修改摘要': 'nature-skills',
  '/修改引言': 'nature-skills',
  '/修改相关工作': 'nature-skills',
  '/修改方法': 'nature-skills',
  '/修改结果': 'nature-skills',
  '/修改讨论': 'nature-skills',
  '/修改局限': 'nature-skills',
  '/修改结论': 'nature-skills',
  '/逐段修改': 'nature-skills',
  '/学术润色': 'nature-skills',
  '/压缩': 'nature-skills',
  '/中译英': 'nature-skills',
  '/英译中': 'nature-skills',
  '/模拟拒稿': 'nature-skills',
  '/投稿前检查': 'world-model-method',
  '/回复审稿人': 'nature-skills',
  '/生成汇报PPT': 'nature-skills',
  '/补充引用': 'nature-skills',
  '/数据可用性': 'nature-skills',
  '/生成结果图': 'nature-skills',
  '/生成图文摘要': 'nature-skills',
  '/生成框架图': 'paper-framework-figure-studio-pro',
  '/代码实现': 'architecture-engineering',
  '/诊断实验错误': 'code-understanding',
}

/** Normalize a free-form string for keyword matching. */
function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, '')
}

/**
 * Score one command against a free-form intent.
 * Exact command mention wins outright; otherwise keyword overlap scores.
 */
export function scoreCommand(intent, cmd) {
  const text = normalize(intent)
  const name = normalize(cmd)
  if (!text) return 0
  if (text.includes(name)) return 1000

  const keywords = COMMAND_KEYWORDS[cmd] || []
  let score = 0
  const matched = []
  for (const kw of keywords) {
    const k = normalize(kw)
    if (k && text.includes(k)) {
      score += Math.max(1, k.length)
      matched.push(kw)
    }
  }
  return { score, matched }
}

/**
 * Route a free-form intent to commands.
 * Returns the ranked candidates plus the resolved phase/skill context.
 */
export function routeIntent(intent, { limit = 3 } = {}) {
  const scored = []
  for (const c of COMMANDS) {
    const r = scoreCommand(intent, c.cmd)
    const score = typeof r === 'number' ? r : r.score
    const matched = typeof r === 'number' ? [] : r.matched
    if (score > 0) scored.push({ cmd: c.cmd, score, matched })
  }
  scored.sort((a, b) => b.score - a.score || a.cmd.localeCompare(b.cmd))

  const top = scored.slice(0, limit)
  const best = top[0] || null
  return {
    intent,
    matched: scored.length > 0,
    candidates: top,
    recommendation: best ? describeCommand(best.cmd) : null,
  }
}

/** Full routing context for one command. */
export function describeCommand(cmd) {
  const entry = COMMAND_BY_CMD.get(cmd)
  if (!entry) return null
  const phaseN = COMMAND_PHASE[cmd]
  const phase = phaseN === undefined ? null : PHASE_BY_N.get(phaseN)
  const group = COMMAND_SKILL_GROUP[cmd] || null
  return {
    cmd,
    group: entry.group,
    groupLabel: (COMMAND_GROUPS.find((g) => g.id === entry.group) || {}).label || entry.group,
    purpose: entry.purpose,
    run: entry.run,
    phase: phase ? { n: phase.n, name: phase.name, stage: phase.stage } : null,
    primarySkill: group,
    skillUse: group ? (SKILL_GROUPS.find((s) => s.id === group) || {}).use || null : null,
  }
}

/** Every command with its phase and skill projection. */
export function commandCatalog() {
  return COMMANDS.map((c) => describeCommand(c.cmd))
}

/** Every command grouped for display. */
export function commandCatalogByGroup() {
  return COMMAND_GROUPS.map((g) => ({
    group: g.id,
    label: g.label,
    commands: commandCatalog().filter((c) => c.group === g.id),
  }))
}

/**
 * Which phases are relevant to a set of commands (used to suggest scope).
 */
export function phasesForCommands(cmds) {
  const set = new Set()
  for (const c of cmds) {
    const n = COMMAND_PHASE[c]
    if (n !== undefined) set.add(n)
  }
  return [...set].sort((a, b) => a - b).map((n) => PHASE_BY_N.get(n))
}

/** Phase-primary-skill lookup, kept here so routing has one home. */
export function primarySkillForPhase(n) {
  const p = PHASE_BY_N.get(n)
  return p ? p.primary : null
}

export { PHASES, PHASE_BY_N }
