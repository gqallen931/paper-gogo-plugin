/**
 * dsh-paper-gogo-plugin
 *
 * Exposes the Paper-gogo evidence-first paper workflow as DeepSeek Harness
 * tools. The plugin owns no workflow content: it reads the installed Paper-gogo
 * package and turns its phases, gates and evidence rules into structured,
 * enforceable tool results.
 *
 * Runtime dependencies: none. This module is plain ESM so it can be loaded
 * directly by a `--patch` overlay without a build step.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import {
  EVIDENCE_STATES,
  EXECUTION_MARKERS,
  GATES,
  GATE_RESULTS,
  PHASES,
  PHASE_BY_N,
  PRECEDENCE,
  SKILL_GROUPS,
  STAGES,
  gateForPhase,
  journalFileName,
  stageOf,
} from './data/phases.js'
import { COMMAND_GROUPS, COMMANDS, OUTPUT_CONTRACT } from './data/commands.js'
import {
  auditEvidence,
  evaluateGate,
} from './lib/gates.js'
import {
  commandCatalog,
  commandCatalogByGroup,
  describeCommand,
  routeIntent,
} from './lib/routing.js'
import { inspectRoot, readRootFileOptional, resolveWorkflowRoot } from './lib/root.js'
import {
  renderDoctor,
  renderDoc,
  renderEvidence,
  renderGate,
  renderLog,
  renderManifest,
  renderRoute,
} from './lib/render.js'

export const name = 'paper-gogo'
export const inject = ['tools']

/** Workflow documents the `paper_doc` tool can load, relative to the root. */
const DOCS = {
  skill: { path: 'SKILL.md', title: 'SKILL.md — 入口、边界与门禁' },
  workflow: { path: 'paper-workflow-v6.md', title: 'paper-workflow-v6.md — 18 Phase 工作流' },
  'workflow-v5': { path: 'paper-workflow-v5.md', title: 'paper-workflow-v5.md — 历史基线' },
  commands: { path: 'references/command-system.md', title: 'references/command-system.md — 命令系统' },
  routing: { path: 'references/phase-skill-routing.md', title: 'references/phase-skill-routing.md — 执行路由' },
  checklist: { path: 'references/reviewer-checklist.md', title: 'references/reviewer-checklist.md — 审稿检查表' },
  manifest: { path: 'PACKAGE_MANIFEST.md', title: 'PACKAGE_MANIFEST.md — 包清单与完整性哈希' },
  readme: { path: 'README.md', title: 'README.md — 项目说明' },
  'third-party': { path: 'THIRD_PARTY_NOTICES.md', title: 'THIRD_PARTY_NOTICES.md — 第三方许可证' },
  'public-repo': { path: 'PUBLIC_REPO_SETUP.md', title: 'PUBLIC_REPO_SETUP.md — 公开发布配置' },
  'skills-index': { path: 'SKILLS_INDEX.md', title: 'SKILLS_INDEX.md — 内置技能清单' },
  'extras-license': { path: 'extras/THIRD_PARTY_NOTICES.extras.md', title: '附加技能合集许可证' },
}

/** Extract the heading outline of a Markdown document. */
function outlineOf(text) {
  return text
    .split(/\r?\n/)
    .map((l) => l.match(/^(#{1,4})\s+(.*)$/))
    .filter(Boolean)
    .map((m) => ({ level: m[1].length, title: m[2].trim() }))
}

/**
 * Slice a Markdown document by a heading query. Returns the matched section
 * plus everything up to the next heading of the same or higher level.
 */
function sliceSections(text, query) {
  if (!query) return { content: text, matched: null }
  const lines = text.split(/\r?\n/)
  const hits = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(#{1,4})\s+(.*)$/)
    if (m && m[2].toLowerCase().includes(query.toLowerCase())) {
      hits.push({ index: i, level: m[1].length, title: m[2].trim() })
    }
  }
  if (hits.length === 0) return { content: '', matched: [] }
  const parts = []
  for (const hit of hits) {
    let end = lines.length
    for (let j = hit.index + 1; j < lines.length; j++) {
      const m = lines[j].match(/^(#{1,4})\s+/)
      if (m && m[1].length <= hit.level) {
        end = j
        break
      }
    }
    parts.push(lines.slice(hit.index, end).join('\n').trimEnd())
  }
  return { content: parts.join('\n\n'), matched: hits.map((h) => h.title) }
}

/** Build the structured manifest payload. */
function manifestValue(phaseFilter) {
  if (phaseFilter !== undefined && phaseFilter !== null) {
    const p = PHASE_BY_N.get(phaseFilter)
    if (!p) throw new Error(`未知 Phase：${phaseFilter}`
      + `（合法范围 0-17）`)
    const stage = stageOf(p.n)
    return {
      phaseCount: PHASES.length,
      stageCount: STAGES.length,
      gateCount: GATES.length,
      filtered: p.n,
      stages: STAGES.map((s) => ({ ...s })),
      phases: [{
        n: p.n,
        name: p.name,
        stage: p.stage,
        stageLabel: stage ? stage.label : p.stage,
        goal: p.goal,
        primary: p.primary,
        phaseGate: gateForPhase(p.n),
      }],
      gates: GATES.map((g) => ({ ...g })),
      gateResults: [...GATE_RESULTS],
      evidenceStates: EVIDENCE_STATES.map((e) => ({ ...e })),
      markers: EXECUTION_MARKERS.map((m) => ({ ...m })),
      precedence: [...PRECEDENCE],
      skillGroups: SKILL_GROUPS.map((s) => ({ ...s })),
      detail: [{
        n: p.n,
        name: p.name,
        goal: p.goal,
        stageLabel: stage ? stage.label : p.stage,
        primary: p.primary,
        aux: p.aux || [],
        outputs: p.outputs || [],
        gate: p.gate,
        fallback: p.fallback,
        phaseGate: gateForPhase(p.n),
        journal: path.posix.join('docs/项目工作阶段记录', journalFileName(p)),
        extra: p.detail || null,
      }],
    }
  }

  return {
    phaseCount: PHASES.length,
    stageCount: STAGES.length,
    gateCount: GATES.length,
    filtered: null,
    stages: STAGES.map((s) => ({ ...s })),
    phases: PHASES.map((p) => {
      const stage = stageOf(p.n)
      return {
        n: p.n,
        name: p.name,
        stage: p.stage,
        stageLabel: stage ? stage.label : p.stage,
        goal: p.goal,
        primary: p.primary,
        phaseGate: gateForPhase(p.n),
      }
    }),
    gates: GATES.map((g) => ({ ...g })),
    gateResults: [...GATE_RESULTS],
    evidenceStates: EVIDENCE_STATES.map((e) => ({ ...e })),
    markers: EXECUTION_MARKERS.map((m) => ({ ...m })),
    precedence: [...PRECEDENCE],
    skillGroups: SKILL_GROUPS.map((s) => ({ ...s })),
    detail: null,
  }
}

/** Shared output envelope helpers. */
const textOut = (schema, render) => ({ schema, render: (_args, value) => [{ type: 'text', text: render(value) }] })

const OBJ = (properties, additionalProperties = false) => ({ type: 'object', properties, additionalProperties })

/**
 * Nullable value schema.
 *
 * The schema DSL rejects array-form `type` (`type: ['integer','null']`) — the
 * registry treats it as an unsupported schema and fails the canonical value
 * with "must be a lossless JSON value". Nullability is expressed with `oneOf`,
 * which requires at least two branches.
 */
const NULLABLE = (spec) => ({ oneOf: [spec, { type: 'null' }] })

/**
 * Register every tool. Called by the Cordis loader with the plugin config.
 */
export function apply(ctx, config) {
  const cfg = {
    root: null,
    searchRoots: [],
    journalDir: 'docs/项目工作阶段记录',
    // Ship-first: the plugin carries its own copy of the workflow so a fresh
    // install works with no external Paper-gogo package. Set false to prefer an
    // externally installed package at `root` / DSH_PAPER_GOGO_ROOT.
    preferBundled: true,
    ...(config && typeof config === 'object' ? config : {}),
  }

  // `logger` is a Cordis service that a deployment may or may not mount.
  // Call it defensively: a missing logger must never fail plugin activation.
  try {
    const logger = ctx.logger ?? (typeof ctx.get === 'function' ? ctx.get('logger') : undefined)
    logger?.info?.('[paper-gogo] plugin loaded: registering 7 tools')
  } catch {
    /* logging is best-effort only */
  }

  ctx.tools.register(defineManifest())
  ctx.tools.register(defineDoc(cfg))
  ctx.tools.register(defineGate())
  ctx.tools.register(defineEvidence())
  ctx.tools.register(defineRoute())
  ctx.tools.register(definePhaseLog(cfg))
  ctx.tools.register(defineDoctor(cfg))
}

// --- tool: paper_manifest -------------------------------------------------

function defineManifest() {
  return {
    name: 'paper_manifest',
    description:
      'Return the Paper-gogo research-paper workflow manifest: the 4 stages, all 18 Phases with their goals and primary skills, the 7 quality gates (G0-G6), the four-state evidence vocabulary, execution markers and the instruction precedence chain. Pass `phase` to get one Phase in full detail (deliverables, gate constraint, fallback, journal path). Use this before doing any paper-workflow work so the phase names, gates and evidence vocabulary are correct.',
    parameters: {
      phase: {
        type: 'integer',
        description: 'Optional Phase number 0-17. When given, returns that Phase in full detail instead of the compact overview.',
      },
    },
    output: textOut(
      {
        type: 'object',
        additionalProperties: true,
        properties: {
          phaseCount: { type: 'integer' },
          stageCount: { type: 'integer' },
          gateCount: { type: 'integer' },
          filtered: NULLABLE({ type: 'integer' }),
        },
      },
      renderManifest,
    ),
    async execute(args) {
      return manifestValue(args.phase)
    },
  }
}

// --- tool: paper_doc ------------------------------------------------------

function defineDoc(cfg) {
  const keys = Object.keys(DOCS)
  return {
    name: 'paper_doc',
    description:
      'Read an authoritative document from the installed Paper-gogo workflow package: the entry SKILL.md, the 18-Phase workflow, the command system, the phase-to-skill execution routing, the reviewer checklist, or the package/license documents. Use `section` to load only one heading-matched slice (much cheaper than the whole 45 KB workflow), and `mode: "outline"` to list headings first.',
    parameters: {
      doc: {
        type: 'string',
        enum: keys,
        required: true,
        description: `Which document to read. One of: ${keys.join(', ')}.`,
      },
      section: {
        type: 'string',
        description: 'Case-insensitive substring matched against headings. Returns only the matching sections.',
      },
      mode: {
        type: 'string',
        enum: ['full', 'outline'],
        description: 'full (default) returns content; outline returns only the heading list.',
      },
      offset: {
        type: 'integer',
        description: 'Character offset to start from. Use with limit to page through a long document.',
      },
      limit: {
        type: 'integer',
        description: 'Maximum characters to return. Defaults to 40000.',
      },
    },
    output: textOut(
      {
        type: 'object',
        additionalProperties: true,
        properties: {
          key: { type: 'string' },
          path: { type: 'string' },
          found: { type: 'boolean' },
          truncated: { type: 'boolean' },
        },
      },
      renderDoc,
    ),
    async execute(args) {
      const meta = DOCS[args.doc]
      if (!meta) {
        throw new Error(`未知文档 key：${args.doc}。可用：${Object.keys(DOCS).join(', ')}`)
      }
      const { root, source } = await resolveWorkflowRoot({
        root: cfg.root,
        searchRoots: cfg.searchRoots,
        preferBundled: cfg.preferBundled,
      })
      const available = Object.entries(DOCS).map(([key, d]) => ({ key, path: d.path }))
      if (!root) {
        return {
          found: false,
          requested: args.doc,
          available,
          key: args.doc,
          path: meta.path,
          title: meta.title,
          absolutePath: null,
          bytes: 0,
          returnedBytes: 0,
          truncated: false,
          sections: [],
          content: `无法解析 Paper-gogo 工作流根（来源：${source}）。`,
        }
      }

      const text = await readRootFileOptional(root, meta.path)
      const absolutePath = path.join(root, meta.path)
      if (text === null) {
        return {
          found: false,
          requested: args.doc,
          available,
          key: args.doc,
          path: meta.path,
          title: meta.title,
          absolutePath,
          bytes: 0,
          returnedBytes: 0,
          truncated: false,
          sections: [],
          content: `文件不存在：${absolutePath}`,
        }
      }

      if (args.mode === 'outline') {
        const outline = outlineOf(text)
        const body = outline.map((h) => `${'  '.repeat(h.level - 1)}- ${h.title}`).join('\n')
        return {
          found: true,
          key: args.doc,
          path: meta.path,
          title: `${meta.title}（大纲）`,
          absolutePath,
          bytes: Buffer.byteLength(text, 'utf8'),
          returnedBytes: Buffer.byteLength(body, 'utf8'),
          truncated: false,
          sections: outline.map((h) => h.title),
          content: body,
        }
      }

      let content = text
      let matched = null
      if (args.section) {
        const sliced = sliceSections(text, args.section)
        content = sliced.content
        matched = sliced.matched
      }

      const offset = Number.isInteger(args.offset) && args.offset > 0 ? args.offset : 0
      const limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 40000
      const slicedContent = content.slice(offset, offset + limit)
      const truncated = content.length > offset + limit

      return {
        found: true,
        key: args.doc,
        path: meta.path,
        title: meta.title,
        absolutePath,
        bytes: Buffer.byteLength(text, 'utf8'),
        returnedBytes: Buffer.byteLength(slicedContent, 'utf8'),
        truncated,
        sections: matched || [],
        content: slicedContent || '（该 section 未匹配到任何标题，或 offset 超出文档长度。）',
      }
    },
  }
}

// --- tool: paper_gate -----------------------------------------------------

function defineGate() {
  return {
    name: 'paper_gate',
    description:
      'Evaluate the Paper-gogo quality gates (G0-G6) for one Phase and decide whether the workflow may advance. Supply the gate results you have established; the tool normalizes loose input (booleans, "pass"/"fail", {result}, Chinese values), reports which gates are unevaluated, and refuses to advance when a gate is FAIL. A failed gate must produce a repair plan; prose polishing cannot override it.',
    parameters: {
      phase: {
        type: 'integer',
        required: true,
        description: 'Phase number 0-17 being evaluated.',
      },
      gates: {
        type: 'object',
        additionalProperties: true,
        properties: {},
        description:
          'Gate results keyed by gate id, e.g. {"G0":"PASS","G4":"FAIL"}. Values may be a string result, a boolean, or {result}. Omitted gates are reported as NOT EVALUATED.',
      },
      next: {
        type: 'boolean',
        description: 'Set true when you intend to advance to the next Phase, so the tool can confirm or refuse the advance.',
      },
      artifacts: {
        type: 'array',
        items: { type: 'string' },
        description: 'Artifacts produced by this Phase, used to check the declared deliverables were actually produced.',
      },
    },
    output: textOut(
      {
        type: 'object',
        additionalProperties: true,
        properties: {
          recommendation: { type: 'string' },
          phase: { type: 'object', additionalProperties: true, properties: { n: { type: 'integer' } } },
        },
      },
      renderGate,
    ),
    async execute(args) {
      return evaluateGate({
        phase: args.phase,
        gates: args.gates,
        next: args.next === true,
        artifacts: Array.isArray(args.artifacts) ? args.artifacts : [],
      })
    },
  }
}

// --- tool: paper_evidence -------------------------------------------------

function defineEvidence() {
  return {
    name: 'paper_evidence',
    description:
      'Audit claims against the Paper-gogo four-state evidence vocabulary (SUPPORTED / INFERRED / VERIFY / MISSING). Pass a Markdown table (columns including a claim column and an evidence-state column) or "claim :: STATE" lines. The tool counts each state, flags claims that carry no state as UNLABELED rather than assuming they are supported, and blocks advancement when any claim is MISSING. Use this before writing Results or Discussion prose so no conclusion outruns its evidence.',
    parameters: {
      claims: {
        type: 'string',
        required: true,
        description: 'Markdown table or "claim :: STATE" lines to audit.',
      },
      phase: {
        type: 'integer',
        description: 'Optional Phase number this audit belongs to.',
      },
    },
    output: textOut(
      {
        type: 'object',
        additionalProperties: true,
        properties: {
          verdict: { type: 'string' },
          total: { type: 'integer' },
        },
      },
      renderEvidence,
    ),
    async execute(args) {
      return auditEvidence({ claims: args.claims, phase: args.phase ?? null })
    },
  }
}

// --- tool: paper_route ----------------------------------------------------

function defineRoute() {
  return {
    name: 'paper_route',
    description:
      'Route a free-form user request (Chinese or English) to the correct Paper-gogo slash command, and return that command\'s exact execution requirement, the workflow Phase it belongs to, its primary bundled skill group, and the fixed five-part output contract. Use this when the user describes a paper task without naming a command, so you execute the right command instead of inventing one.',
    parameters: {
      intent: {
        type: 'string',
        required: true,
        description: 'The user request in their own words.',
      },
      limit: {
        type: 'integer',
        description: 'How many candidate commands to return. Defaults to 3.',
      },
    },
    output: textOut(
      {
        type: 'object',
        additionalProperties: true,
        properties: {
          matched: { type: 'boolean' },
          recommendation: NULLABLE({ type: 'object', additionalProperties: true, properties: {} }),
        },
      },
      renderRoute,
    ),
    async execute(args) {
      const limit = Number.isInteger(args.limit) && args.limit > 0 ? args.limit : 3
      const routed = routeIntent(args.intent, { limit })
      return {
        ...routed,
        commandGroups: COMMAND_GROUPS.map((g) => ({ ...g })),
        commands: commandCatalog(),
        outputContract: [...OUTPUT_CONTRACT],
      }
    },
  }
}

// --- tool: paper_phase_log ------------------------------------------------

function definePhaseLog(cfg) {
  return {
    name: 'paper_phase_log',
    description:
      'Write the mandatory Paper-gogo Phase work record. The workflow requires every Phase to end with a persisted record containing the invoked skill, inputs, outputs, evidence state, unresolved items and the next legal Phase. This tool writes that Markdown record under the workflow root and returns the exact path.',
    parameters: {
      phase: {
        type: 'integer',
        required: true,
        description: 'Phase number 0-17 being recorded.',
      },
      goal: { type: 'string', description: 'What this Phase established.' },
      skills: {
        type: 'array',
        items: { type: 'string' },
        description: 'Skills actually invoked. Do not list a skill that did not run.',
      },
      inputs: { type: 'string', description: 'Inputs used (files, data, user decisions).' },
      outputs: { type: 'string', description: 'Artifacts produced.' },
      evidenceState: {
        type: 'string',
        enum: EVIDENCE_STATES.map((e) => e.id),
        description: 'Overall evidence state of this Phase outcome.',
      },
      open: {
        type: 'array',
        items: { type: 'string' },
        description: 'Unresolved items and risks carried forward.',
      },
      next: { type: 'string', description: 'The next legal step.' },
      overwrite: {
        type: 'boolean',
        description: 'Replace an existing record. Defaults to false, which appends with a new revision heading.',
      },
    },
    output: textOut(
      {
        type: 'object',
        additionalProperties: true,
        properties: {
          relPath: { type: 'string' },
          absolutePath: { type: 'string' },
          bytes: { type: 'integer' },
        },
      },
      renderLog,
    ),
    async execute(args) {
      const phase = PHASE_BY_N.get(args.phase)
      if (!phase) throw new Error(`未知 Phase：${args.phase}`)

      const { root, source } = await resolveWorkflowRoot({
        root: cfg.root,
        searchRoots: cfg.searchRoots,
        preferBundled: cfg.preferBundled,
      })
      if (!root) {
        throw new Error(
          `无法解析 Paper-gogo 工作流根（来源：${source}），因此不能写入阶段记录。`
          + ' 请为该插件的 paper-gogo 行设置 config.root，或设置环境变量 DSH_PAPER_GOGO_ROOT。',
        )
      }

      const base = cfg.journalDir || 'docs/项目工作阶段记录'
      const dir = path.isAbsolute(base) ? base : path.join(root, base)
      const file = journalFileName(phase)
      const absolutePath = path.join(dir, file)
      const relPath = path.relative(root, absolutePath).split(path.sep).join('/')

      // Containment guard: the workflow forbids scattering artifacts outside
      // the conventional directories, and this tool must not write anywhere
      // but inside the resolved root.
      const normalizedRoot = path.resolve(root)
      const normalizedTarget = path.resolve(absolutePath)
      if (!normalizedTarget.startsWith(normalizedRoot + path.sep)) {
        throw new Error(`阶段记录路径必须位于工作流根内：${normalizedTarget} 不在 ${normalizedRoot} 之下`)
      }

      const skills = Array.isArray(args.skills) ? args.skills : []
      const open = Array.isArray(args.open) ? args.open : []
      const nextHint = args.next || '（未提供）'

      const sections = [
        `# Phase ${phase.n}：${phase.name}`,
        '',
        `- 阶段：${(stageOf(phase.n) || {}).label || phase.stage}`,
        `- 记录时间：${new Date().toISOString()}`,
        `- 主技能：\`${phase.primary}\``,
        `- 门禁归属：${gateForPhase(phase.n)}`,
        '',
        '## 目标',
        '',
        args.goal || phase.goal,
        '',
        '## 调用技能',
        '',
        skills.length ? skills.map((s) => `- \`${s}\``).join('\n') : `- （未提供）主技能应为 \`${phase.primary}\``,
        '',
        '## 输入',
        '',
        args.inputs || '（未提供）',
        '',
        '## 产出',
        '',
        args.outputs || (phase.outputs || []).map((o) => `- \`${o}\``).join('\n'),
        '',
        '## 证据状态',
        '',
        args.evidenceState ? `\`${args.evidenceState}\`` : '（未提供）',
        '',
        '## 未决项与风险',
        '',
        open.length ? open.map((o) => `- ${o}`).join('\n') : '- （无）',
        '',
        '## 本 Phase 门禁与约束',
        '',
        phase.gate,
        '',
        '## 回退',
        '',
        phase.fallback,
        '',
        '## 下一合法步骤',
        '',
        nextHint,
        '',
      ]
      const body = sections.join('\n')

      await mkdir(dir, { recursive: true })
      let finalBody = body
      if (!args.overwrite) {
        const existing = await readRootFileOptional(root, relPath)
        if (existing) {
          finalBody = `${existing.trimEnd()}\n\n---\n\n## 修订记录 ${new Date().toISOString()}\n\n${body}`
        }
      }
      await writeFile(absolutePath, finalBody, 'utf8')

      return {
        phase: { n: phase.n, name: phase.name },
        relPath,
        absolutePath,
        bytes: Buffer.byteLength(finalBody, 'utf8'),
        mustBeUnderRoot: true,
        skills,
        evidenceState: args.evidenceState || null,
        artifacts: (phase.outputs || []).map((p) => ({ path: p })),
        open,
        nextPhaseHint: nextHint,
      }
    },
  }
}

// --- tool: paper_doctor ---------------------------------------------------

function defineDoctor(cfg) {
  return {
    name: 'paper_doctor',
    description:
      'Diagnose the Paper-gogo plugin installation: report which workflow root was resolved and how, which required and optional files are present, and the DSH session settings the plugin sees. Use this first when any other paper_* tool reports a missing file or an unresolved root.',
    parameters: {},
    output: textOut(
      {
        type: 'object',
        additionalProperties: true,
        properties: {
          usable: { type: 'boolean' },
          root: NULLABLE({ type: 'string' }),
          source: { type: 'string' },
        },
      },
      renderDoctor,
    ),
    async execute() {
      const resolved = await resolveWorkflowRoot({
        root: cfg.root,
        searchRoots: cfg.searchRoots,
        preferBundled: cfg.preferBundled,
      })
      const inspection = resolved.root
        ? await inspectRoot(resolved.root)
        : { usable: false, required: [], optional: [], skillHead: null }
      return {
        usable: Boolean(resolved.root) && inspection.usable,
        root: resolved.root,
        source: resolved.source,
        bundled: Boolean(resolved.bundled),
        tried: resolved.tried || [],
        required: inspection.required,
        optional: inspection.optional,
        skillHead: inspection.skillHead,
        config: {
          configuredRoot: cfg.root,
          searchRoots: cfg.searchRoots,
          journalDir: cfg.journalDir,
          preferBundled: cfg.preferBundled,
        },
        environment: {
          cwd: process.cwd(),
          dshPaperGogoRoot: process.env.DSH_PAPER_GOGO_ROOT || null,
          nodeVersion: process.version,
        },
        commands: commandCatalogByGroup(),
        phaseCount: PHASES.length,
      }
    },
  }
}

export { DOCS, manifestValue, outlineOf, sliceSections }
export { PHASES, PHASE_BY_N, GATES, GATE_RESULTS, STAGES, SKILL_GROUPS, EVIDENCE_STATES, EXECUTION_MARKERS }
