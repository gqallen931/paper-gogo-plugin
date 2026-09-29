/**
 * Gate evaluation, evidence audit, and phase sequencing.
 *
 * All three are pure functions over explicit inputs so they can be unit-tested
 * and so a tool call can be replayed deterministically.
 */

import {
  BLOCKING_GATES,
  EVIDENCE_STATES,
  GATES,
  GATE_RESULTS,
  PHASES,
  PHASE_BY_N,
  gateForPhase,
  stageOf,
} from '../data/phases.js'

const NEGATED = ['fail', 'failed', 'no', 'not-run', 'notrun', '❌', '✗', '否', '未通过', '不通过']

/** Read a field from a loosely-keyed object (artifacts, gates, ...). */
function pick(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return undefined
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k]
    const lower = String(k).toLowerCase()
    for (const actual of Object.keys(obj)) {
      if (actual.toLowerCase() === lower) return obj[actual]
    }
  }
  return undefined
}

/** Coerce a loosely-typed artifact entry to `{ path, note }`. */
function coerceArtifact(a) {
  if (typeof a === 'string') return { path: a, note: null }
  if (a && typeof a === 'object') {
    return {
      path: pick(a, 'path', 'file', 'name') ?? JSON.stringify(a),
      note: pick(a, 'note', 'kind', 'note_note') ?? null,
    }
  }
  return null
}

/**
 * Normalize gate inputs into a `{ G0: 'PASS' | 'FAIL' | 'PASS WITH CONDITIONS' }` map.
 * Accepts `{ G0: 'PASS' }`, `{ g0: 'pass' }`, `{ G0: { result: 'PASS' } }`,
 * `{ G0: true }`, `{ G0: false }`.
 */
export function normalizeGateResults(input) {
  const out = {}
  if (!input || typeof input !== 'object') return out
  for (const gate of GATES) {
    const raw = pick(input, gate.id, gate.id.toLowerCase(), gate.name.toLowerCase())
    if (raw === undefined) continue
    out[gate.id] = normalizeSingleResult(raw)
  }
  return out
}

function normalizeSingleResult(raw) {
  if (typeof raw === 'boolean') return raw ? 'PASS' : 'FAIL'
  if (raw && typeof raw === 'object') {
    const inner = pick(raw, 'result', 'status', 'verdict')
    if (inner !== undefined) return normalizeSingleResult(inner)
    return 'FAIL'
  }
  const s = String(raw).trim().toUpperCase().replace(/[\s_]+/g, ' ')
  if (!s) return 'FAIL'
  if (NEGATED.some((n) => s.toUpperCase() === n.toUpperCase() || s.includes(n.toUpperCase()))) return 'FAIL'
  if (s.includes('CONDITION')) return 'PASS WITH CONDITIONS'
  if (s === 'PASS' || s === 'PASSED' || s === 'OK' || s === '是' || s === '通过') return 'PASS'
  return 'FAIL'
}

/**
 * Evaluate a full phase gate set.
 *
 * @param {object} input
 * @param {number} input.phase            phase number being evaluated
 * @param {object} input.gates            loosely-keyed gate result map
 * @param {boolean} [input.next]          whether the caller intends to advance
 * @param {string[]} [input.artifacts]    produced artifacts
 */
export function evaluateGate({ phase, gates, next = false, artifacts = [] } = {}) {
  if (!Number.isInteger(phase) || phase < 0 || phase > 17) {
    throw new Error(`phase 必须是 0-17 的整数，收到 ${String(phase)}`)
  }
  const p = PHASE_BY_N.get(phase)
  const results = normalizeGateResults(gates)
  const evaluated = GATES.map((g) => ({ ...g, result: results[g.id] ?? 'NOT EVALUATED' }))

  const failed = evaluated.filter((g) => g.result === 'FAIL')
  const conditional = evaluated.filter((g) => g.result === 'PASS WITH CONDITIONS')
  const blockingFailed = failed.filter((g) => BLOCKING_GATES.includes(g.id))
  const notEvaluated = evaluated.filter((g) => g.result === 'NOT EVALUATED')

  // Missing artifacts for the phase's declared outputs is informational: the
  // workflow records outputs in the phase journal, which the caller may supply.
  const declared = p.outputs || []
  const produced = artifacts.map(coerceArtifact).filter(Boolean)
  const missingArtifacts = declared.filter((d) => {
    const stem = d.replace(/\{.*?\}/g, '').replace(/[*?].*$/, '').trim()
    if (!stem) return false
    return !produced.some((a) => a.path && (a.path.includes(stem) || stem.includes(a.path)))
  })

  let recommendation = 'CONTINUE'
  if (blockingFailed.length > 0) recommendation = 'BLOCKED'
  else if (conditional.length > 0) recommendation = 'PASS WITH CONDITIONS'
  else if (notEvaluated.length > 0) recommendation = 'NEEDS_EVALUATION'
  else if (next) recommendation = 'ADVANCE'
  else recommendation = 'CONTINUE'

  const phaseGate = gateForPhase(phase)
  const reasons = []
  if (blockingFailed.length > 0) {
    reasons.push(`门禁 ${blockingFailed.map((g) => g.id).join(', ')} 为 FAIL：失败门禁必须给出修复路径，不能靠润色覆盖。`)
  }
  if (conditional.length > 0) {
    reasons.push(`门禁 ${conditional.map((g) => g.id).join(', ')} 为 PASS WITH CONDITIONS：继续前必须补齐所述条件。`)
  }
  if (notEvaluated.length > 0) {
    reasons.push(`门禁 ${notEvaluated.map((g) => g.id).join(', ')} 尚未评估：评定后才能继续。`)
  }
  if (next && blockingFailed.length === 0 && notEvaluated.length === 0 && conditional.length === 0) {
    reasons.push('全部门禁 PASS，可以进入下一阶段。')
  }

  return {
    phase: { n: p.n, name: p.name, stage: p.stage, stageLabel: (stageOf(p.n) || {}).label || p.stage },
    phaseGate,
    phaseGateDetail: GATES.find((g) => g.id === phaseGate),
    results: evaluated,
    blockingFailed,
    conditional,
    notEvaluated,
    failed,
    artifacts: produced,
    missingArtifacts,
    phaseConstraint: p.gate,
    fallback: p.fallback,
    recommendation,
    reasons,
  }
}

// --- evidence audit -------------------------------------------------------

const STATE_ORDER = ['SUPPORTED', 'INFERRED', 'VERIFY', 'MISSING']

/** Recognize an evidence state token inside arbitrary cell text. */
export function recognizeState(text) {
  const s = String(text || '').toUpperCase()
  for (const st of STATE_ORDER) {
    if (s.includes(st)) return st
  }
  return null
}

/**
 * Split a Markdown table row into cells, tolerating escaped pipes.
 */
function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells = []
  let cur = ''
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i]
    if (ch === '\\' && trimmed[i + 1] === '|') {
      cur += '|'
      i++
      continue
    }
    if (ch === '|') {
      cells.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  cells.push(cur.trim())
  return cells
}

const isSeparator = (cells) => cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c))

/**
 * Extract claims and their evidence states from Markdown.
 *
 * Accepts either a full Markdown table or one-claim-per-line text. A claim
 * without a recognizable state is reported as `UNLABELED` rather than silently
 * assumed SUPPORTED.
 */
export function parseClaims(text) {
  const claims = []
  const lines = String(text || '').split(/\r?\n/)
  let header = null
  let inTable = false

  for (const line of lines) {
    if (!line.includes('|')) {
      inTable = false
      header = null
      continue
    }
    const cells = splitRow(line)
    if (isSeparator(cells)) continue
    if (!inTable) {
      header = cells.map((c) => c.toLowerCase())
      inTable = true
      // A single-row table with no separator is treated as data, not header,
      // when it already carries an evidence state.
      if (recognizeState(line)) {
        pushClaim(claims, cells, line, null)
        header = null
      }
      continue
    }
    pushClaim(claims, cells, line, header)
  }

  if (claims.length === 0) {
    // Fall back to line-based input: "claim :: STATE" or "claim — STATE".
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const st = recognizeState(line)
      if (!st) continue
      const claim = line
        .replace(new RegExp(`\\b${st}\\b`, 'i'), '')
        .replace(/[:：\-—–|]+\s*$/, '')
        .replace(/^\s*[-*]\s*/, '')
        .trim()
      if (claim) claims.push({ claim, state: st, source: 'line' })
    }
  }
  return claims
}

function pushClaim(claims, cells, line, header) {
  const stateIdx = header ? header.findIndex((h) => /evidence|state|证据|状态/.test(h)) : -1
  const state = stateIdx >= 0 ? recognizeState(cells[stateIdx]) : recognizeState(line)
  if (!state) return
  let claimIdx = header ? header.findIndex((h) => /claim|主张|论断/.test(h)) : 0
  if (claimIdx < 0) claimIdx = 0
  const claim = (cells[claimIdx] || '').trim()
  if (!claim) return
  claims.push({ claim, state, source: 'table' })
}

/**
 * Audit an evidence table.
 *
 * @param {object} input
 * @param {string} input.claims  Markdown table or line list carrying states
 * @param {number} [input.phase] phase the audit belongs to
 */
export function auditEvidence({ claims, phase = null } = {}) {
  if (typeof claims !== 'string' || !claims.trim()) {
    throw new Error('claims 必须是非空的 Markdown 表格或“主张 :: 状态”列表')
  }
  const parsed = parseClaims(claims)
  const counts = Object.fromEntries(EVIDENCE_STATES.map((s) => [s.id, 0]))
  counts.UNLABELED = 0

  const rows = parsed.map((c) => {
    const known = EVIDENCE_STATES.some((s) => s.id === c.state)
    if (known) counts[c.state]++
    else counts.UNLABELED++
    return {
      ...c,
      meaning: (EVIDENCE_STATES.find((s) => s.id === c.state) || {}).meaning || '未标注证据状态',
      wording: (EVIDENCE_STATES.find((s) => s.id === c.state) || {}).wording || '必须先补标注，不得默认按 SUPPORTED 处理',
      advanceBlocked: c.state === 'MISSING',
      needsAuthorInput: c.state === 'VERIFY',
    }
  })

  const missing = rows.filter((r) => r.state === 'MISSING')
  const verify = rows.filter((r) => r.state === 'VERIFY')
  const inferred = rows.filter((r) => r.state === 'INFERRED')
  const supported = rows.filter((r) => r.state === 'SUPPORTED')

  const findings = []
  if (missing.length) findings.push(`${missing.length} 条主张标记 MISSING：必须停止相应结论，不得进入正文。`)
  if (verify.length) findings.push(`${verify.length} 条主张标记 VERIFY：需作者或来源核实后才能作为已确认事实。`)
  if (inferred.length) findings.push(`${inferred.length} 条主张标记 INFERRED：正文必须写明为推断。`)
  if (supported.length) findings.push(`${supported.length} 条主张标记 SUPPORTED：允许确定性陈述。`)

  let verdict = 'READY'
  if (missing.length) verdict = 'BLOCKED'
  else if (verify.length) verdict = 'NEEDS_VERIFICATION'
  else if (rows.length === 0) verdict = 'EMPTY'

  return {
    phase,
    total: rows.length,
    counts,
    rows,
    supported,
    inferred,
    verify,
    missing,
    findings,
    verdict,
    rule: 'Stub、模拟值和未运行代码不得进入实验排名、统计结论、论文图表或投稿证据；缺失关键证据时必须停止相应结论并标记 MISSING。',
  }
}

// --- phase sequencing -----------------------------------------------------

/**
 * Compute the next legal phase.
 *
 * @param {object} input
 * @param {number[]} [input.completed]  completed phase numbers
 * @param {object}   [input.gates]      gate results, as in evaluateGate
 * @param {number}   [input.requested]  an explicitly requested phase
 */
export function nextPhase({ completed = [], gates, requested } = {}) {
  const done = new Set(completed.filter((n) => Number.isInteger(n) && n >= 0 && n <= 17))
  const results = normalizeGateResults(gates)
  const failedGates = GATES.filter((g) => results[g.id] === 'FAIL')

  if (Number.isInteger(requested)) {
    if (requested < 0 || requested > 17) throw new Error(`requested 必须是 0-17，收到 ${requested}`)
    const p = PHASE_BY_N.get(requested)
    const skipped = []
    for (let i = 0; i < requested; i++) if (!done.has(i)) skipped.push(i)
    return {
      mode: 'explicit',
      requested,
      phase: p,
      skippedIncomplete: skipped,
      warnings: skipped.length
        ? [`显式跳转到 Phase ${requested}，但 Phase ${skipped.join(', ')} 尚未完成。跳转前必须记录前置门禁状态和未解决风险。`]
        : [],
      gateHint: `Phase ${requested} 的关键门禁为 ${gateForPhase(requested)}。`,
    }
  }

  if (failedGates.length) {
    const target =
      failedGates.some((g) => ['G4'].includes(g.id)) ? 8
      : failedGates.some((g) => ['G3'].includes(g.id)) ? 6
      : failedGates.some((g) => ['G2'].includes(g.id)) ? 4
      : 0
    return {
      mode: 'repair',
      phase: PHASE_BY_N.get(target),
      failedGates,
      warnings: [`门禁 ${failedGates.map((g) => g.id).join(', ')} 为 FAIL，必须先生成修复路径，不能靠润色覆盖。`],
      gateHint: `修复后重新评估 ${failedGates.map((g) => g.id).join(', ')}。`,
    }
  }

  const nextN = [...Array(18).keys()].find((n) => !done.has(n))
  if (nextN === undefined) {
    return { mode: 'complete', phase: null, warnings: [], gateHint: '全部 18 个 Phase 均已完成。' }
  }
  const p = PHASE_BY_N.get(nextN)
  return {
    mode: 'sequential',
    phase: p,
    stage: stageOf(nextN),
    gateHint: `Phase ${nextN} 的关键门禁为 ${gateForPhase(nextN)}。`,
    warnings: [],
    nonSkippable: nextN <= 1 || nextN === 6 || nextN === 8,
  }
}

export { GATES, GATE_RESULTS, EVIDENCE_STATES, PHASES }
