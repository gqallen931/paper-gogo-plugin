/**
 * Markdown renderers. These are pure functions from a canonical value to
 * model-facing text, kept separate from the tools so they can be tested
 * directly.
 */

import { COMMAND_GROUPS } from '../data/commands.js'
import { SKILL_GROUPS, STAGES } from '../data/phases.js'

const bullet = (s) => `- ${s}`

/** Render the phase/stage/gate manifest. */
export function renderManifest(v) {
  const out = []
  out.push(`# Paper-gogo 工作流清单`)
  out.push('')
  out.push(`- Phase 数量：${v.phaseCount}`)
  out.push(`- 阶段数量：${v.stageCount}`)
  out.push(`- 门禁数量：${v.gateCount}`)
  out.push(`- 是否按某个 Phase 过滤：${v.filtered ? `是（Phase ${v.filtered}）` : '否'}`)
  out.push('')

  out.push('## 阶段')
  out.push('')
  out.push('| 阶段 | Phase 范围 | 说明 |')
  out.push('|---|---|---|')
  for (const s of v.stages) {
    out.push(`| ${s.label} | ${s.phases[0]}-${s.phases[1]} | ${s.summary} |`)
  }
  out.push('')

  out.push('## Phase')
  out.push('')
  out.push('| Phase | 阶段 | 名称 | 目标 | 主技能 | 关键门禁 |')
  out.push('|---:|---|---|---|---|---|')
  for (const p of v.phases) {
    out.push(`| ${p.n} | ${p.stageLabel} | ${p.name} | ${p.goal} | \`${p.primary}\` | ${p.phaseGate} |`)
  }
  out.push('')

  out.push('## 质量门禁')
  out.push('')
  out.push('| 门禁 | 名称 | 审稿人问题 | 必须产出 |')
  out.push('|---|---|---|---|')
  for (const g of v.gates) {
    out.push(`| ${g.id} | ${g.name} | ${g.question} | ${g.result} |`)
  }
  out.push('')
  out.push(`门禁结果词表：${v.gateResults.map((r) => `\`${r}\``).join(' / ')}。失败门禁必须给出修复路径，不能靠润色覆盖。`)
  out.push('')

  out.push('## 四态证据标签')
  out.push('')
  out.push('| 标签 | 含义 | 允许的措辞强度 |')
  out.push('|---|---|---|')
  for (const e of v.evidenceStates) {
    out.push(`| \`${e.id}\` | ${e.meaning} | ${e.wording} |`)
  }
  out.push('')

  out.push('## 执行标记')
  out.push('')
  out.push('| 标记 | 触发条件 | 后果 |')
  out.push('|---|---|---|')
  for (const m of v.markers) {
    out.push(`| \`${m.id}\` | ${m.trigger} | ${m.effect} |`)
  }
  out.push('')

  out.push('## 指令优先级')
  out.push('')
  v.precedence.forEach((p, i) => out.push(`${i + 1}. ${p}`))
  out.push('')

  if (v.detail && v.detail.length) {
    out.push('## Phase 细节')
    out.push('')
    for (const p of v.detail) {
      out.push(`### Phase ${p.n}：${p.name}`)
      out.push('')
      out.push(bullet(`**目标**：${p.goal}`))
      out.push(bullet(`**阶段**：${p.stageLabel}`))
      out.push(bullet(`**主技能**：\`${p.primary}\``))
      if (p.aux.length) {
        out.push(bullet(`**条件辅助技能**：${p.aux.map((a) => `\`${a.skill}\`（${a.trigger}）`).join('；')}`))
      }
      out.push(bullet(`**产出**：${p.outputs.map((o) => `\`${o}\``).join('、')}`))
      out.push(bullet(`**门禁与约束**：${p.gate}`))
      out.push(bullet(`**回退**：${p.fallback}`))
      out.push(bullet(`**门禁归属**：${p.phaseGate}`))
      if (p.journal) out.push(bullet(`**阶段记录**：\`${p.journal}\``))
      if (p.extra?.subphases) {
        out.push('')
        out.push('**子阶段与优先级**：')
        out.push('')
        out.push('| 子阶段 | 内容 | 优先级 |')
        out.push('|---|---|---|')
        for (const [id, label, priority] of p.extra.subphases) {
          out.push(`| ${id} | ${label} | ${priority} |`)
        }
      }
      if (p.extra?.cache) {
        out.push('')
        out.push(bullet(`**缓存**：${p.extra.cache}`))
      }
      if (p.extra?.checks) {
        out.push('')
        out.push('**审查清单**：')
        out.push('')
        p.extra.checks.forEach((c, i) => out.push(`${i + 1}. ${c}`))
      }
      if (p.extra?.goldenRules) {
        out.push('')
        out.push('**审稿回复黄金法则**：')
        out.push('')
        p.extra.goldenRules.forEach((r, i) => out.push(`${i + 1}. ${r}`))
      }
      out.push('')
    }
  } else {
    out.push('## 下一步')
    out.push('')
    out.push('用 `paper_manifest` 传入具体 `phase` 获取该 Phase 的完整定义（产出、门禁、回退、阶段记录路径）。')
    out.push('')
  }

  return out.join('\n')
}

/** Render a loaded workflow document. */
export function renderDoc(v) {
  if (!v.found) {
    return [
      `# 未找到文档`,
      '',
      `请求的文档：\`${v.requested}\``,
      '',
      '可用文档 key：',
      ...v.available.map((a) => bullet(`\`${a.key}\` → \`${a.path}\``)),
    ].join('\n')
  }
  const head = [
    `# ${v.title}`,
    '',
    bullet(`文档 key：\`${v.key}\``),
    bullet(`相对路径：\`${v.path}\``),
    bullet(`绝对路径：\`${v.absolutePath}\``),
    bullet(`总字节数：${v.bytes}`),
    bullet(`返回字节数：${v.returnedBytes}${v.truncated ? '（已截断）' : ''}`),
  ]
  if (v.sections && v.sections.length) {
    head.push(bullet(`章节：${v.sections.join(' / ')}`))
  }
  head.push('', '---', '', v.content)
  return head.join('\n')
}

/** Render a gate evaluation. */
export function renderGate(v) {
  const out = []
  out.push(`# 门禁评估：Phase ${v.phase.n} ${v.phase.name}`)
  out.push('')
  out.push(bullet(`阶段：${v.phase.stageLabel}`))
  out.push(bullet(`评估结论：**${v.recommendation}**`))
  out.push(bullet(`本 Phase 关键门禁：${v.phaseGate}`))
  out.push('')

  out.push('## 门禁结果')
  out.push('')
  out.push('| 门禁 | 名称 | 结果 | 审稿人问题 |')
  out.push('|---|---|---|---|')
  for (const g of v.results) {
    const mark = g.result === 'PASS' ? 'PASS' : g.result === 'FAIL' ? '**FAIL**' : g.result
    out.push(`| ${g.id} | ${g.name} | ${mark} | ${g.question} |`)
  }
  out.push('')

  if (v.reasons.length) {
    out.push('## 判定依据')
    out.push('')
    for (const r of v.reasons) out.push(bullet(r))
    out.push('')
  }

  if (v.blockingFailed.length) {
    out.push('## 失败门禁的修复要求')
    out.push('')
    out.push('失败门禁必须给出修复路径，不能靠润色覆盖。逐项说明：修复动作、所需证据、重新评估的门禁。')
    out.push('')
  }

  out.push('## 本 Phase 的约束')
  out.push('')
  out.push(bullet(`门禁与约束：${v.phaseConstraint}`))
  out.push(bullet(`回退：${v.fallback}`))
  out.push('')

  if (v.missingArtifacts.length) {
    out.push('## 声明产出但未在 artifacts 中出现的项')
    out.push('')
    for (const m of v.missingArtifacts) out.push(bullet(`\`${m}\``))
    out.push('')
  }

  return out.join('\n')
}

/** Render an evidence audit. */
export function renderEvidence(v) {
  const out = []
  out.push('# 证据审计')
  out.push('')
  if (v.phase !== null && v.phase !== undefined) out.push(bullet(`所属 Phase：${v.phase}`))
  out.push(bullet(`主张总数：${v.total}`))
  out.push(bullet(`审计结论：**${v.verdict}**`))
  out.push('')

  out.push('## 状态统计')
  out.push('')
  out.push('| 状态 | 数量 | 含义 |')
  out.push('|---|---:|---|')
  for (const [k, n] of Object.entries(v.counts)) {
    const meaning = (v.rows.find((r) => r.state === k) || {}).meaning || '未标注证据状态'
    out.push(`| ${k} | ${n} | ${meaning} |`)
  }
  out.push('')

  if (v.findings.length) {
    out.push('## 结论')
    out.push('')
    for (const f of v.findings) out.push(bullet(f))
    if (v.missing.length) out.push(bullet('**不得推进**：存在 MISSING 主张。'))
    out.push('')
  }

  out.push('## 明细')
  out.push('')
  out.push('| 主张 | 状态 | 允许的措辞 |')
  out.push('|---|---|---|')
  for (const r of v.rows) {
    out.push(`| ${r.claim} | \`${r.state}\` | ${r.wording} |`)
  }
  out.push('')

  out.push('## 规则')
  out.push('')
  out.push(v.rule)
  return out.join('\n')
}

/** Render a phase-journal write result. */
export function renderLog(v) {
  const out = []
  out.push(`# 阶段记录已写入`)
  out.push('')
  out.push(bullet(`Phase：${v.phase.n} ${v.phase.name}`))
  out.push(bullet(`文件：\`${v.relPath}\``))
  out.push(bullet(`绝对路径：\`${v.absolutePath}\``))
  out.push(bullet(`字节数：${v.bytes}`))
  out.push(bullet(`相对工作流根：${v.mustBeUnderRoot ? '是（已校验）' : '否（外部路径）'}`))
  out.push('')
  out.push('## 已记录')
  out.push('')
  out.push(bullet(`技能：${v.skills.length ? v.skills.map((s) => `\`${s}\``).join('、') : '（未提供）'}`))
  out.push(bullet(`证据状态：${v.evidenceState ? `\`${v.evidenceState}\`` : '（未提供）'}`))
  out.push(bullet(`产出：${v.artifacts.length ? v.artifacts.map((a) => `\`${a.path}\``).join('、') : '（未提供）'}`))
  out.push(bullet(`未决项：${v.open.length ? v.open.join('；') : '（无）'}`))
  if (v.nextPhaseHint) out.push(bullet(`下一合法步骤：${v.nextPhaseHint}`))
  out.push('')
  out.push('> 全局规则：每个 Phase 结束必须写入工作记录，包含调用技能、输入、产出、证据状态、未决项与下一合法 Phase。')
  return out.join('\n')
}

/** Render intent routing. */
export function renderRoute(v) {
  const out = []
  out.push('# 命令路由')
  out.push('')
  out.push(bullet(`输入意图：${v.intent}`))
  out.push('')
  if (!v.matched) {
    out.push('未匹配到任何命令。默认执行 `/建立档案`：只产出项目档案，不重写论文。')
    out.push('')
    out.push('可用命令按组列出：')
    out.push('')
    for (const g of v.commandGroups) {
      const cmds = v.commands.filter((c) => c.group === g.id)
      out.push(`**${g.label}**：${cmds.map((c) => `\`${c.cmd}\``).join('、')}`)
      out.push('')
    }
    return out.join('\n')
  }

  out.push('## 候选命令')
  out.push('')
  out.push('| 命令 | 匹配分 | 命中关键词 |')
  out.push('|---|---:|---|')
  for (const c of v.candidates) {
    out.push(`| \`${c.cmd}\` | ${c.score} | ${c.matched.join('、') || '—'} |`)
  }
  out.push('')

  const r = v.recommendation
  out.push('## 推荐执行')
  out.push('')
  out.push(bullet(`命令：\`${r.cmd}\``))
  out.push(bullet(`分组：${r.groupLabel}`))
  out.push(bullet(`作用：${r.purpose}`))
  if (r.phase) out.push(bullet(`主要 Phase：${r.phase.n} ${r.phase.name}`))
  if (r.primarySkill) out.push(bullet(`主技能群：\`${r.primarySkill}\`（${r.skillUse || ''}）`))
  out.push('')
  out.push('## 执行要求')
  out.push('')
  out.push(r.run)
  out.push('')
  out.push('## 固定输出契约（修改类命令）')
  out.push('')
  v.outputContract.forEach((s, i) => out.push(`${i + 1}. ${s}`))
  return out.join('\n')
}

/** Render the doctor/inspection report. */
export function renderDoctor(v) {
  const out = []
  out.push('# Paper-gogo 工作流根检查')
  out.push('')
  out.push(bullet(`状态：**${v.usable ? '可用' : '不可用'}**`))
  out.push(bullet(`解析路径：${v.root ? `\`${v.root}\`` : '（未解析到）'}`))
  out.push(bullet(`解析来源：${v.source}`))
  if (v.bundled !== undefined) {
    out.push(bullet(`内容来源：${v.bundled ? '**插件自带**（无需外部 Paper-gogo 包）' : '外部安装的 Paper-gogo 包'}`))
  }
  if (v.skillHead) {
    out.push(bullet(`SKILL.md name：${v.skillHead.name || '（未声明）'}`))
    out.push(bullet(`SKILL.md 字节数：${v.skillHead.bytes}`))
  }
  out.push('')
  out.push('## 必需文件')
  out.push('')
  for (const r of v.required) out.push(bullet(`${r.present ? '存在' : '**缺失**'} — \`${r.rel}\``))
  out.push('')
  out.push('## 可选内容')
  out.push('')
  for (const r of v.optional) out.push(bullet(`${r.present ? '存在' : '缺失'} — \`${r.rel}\``))
  if (v.tried && v.tried.length) {
    out.push('')
    out.push('## 已尝试但失败的候选路径')
    out.push('')
    for (const t of v.tried) out.push(bullet(`\`${t.candidate}\`（来源 ${t.source}）：${t.reason}`))
  }
  if (!v.usable) {
    out.push('')
    out.push('## 修复方法')
    out.push('')
    out.push('在 profile 的 `cordis.patch.yml` 中为该插件的 `paper-gogo` 行设置 `config.root` 为 Paper-gogo 工作流包的绝对路径，或设置环境变量 `DSH_PAPER_GOGO_ROOT`。')
  }
  return out.join('\n')
}

export { COMMAND_GROUPS, SKILL_GROUPS, STAGES }
