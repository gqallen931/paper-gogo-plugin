/**
 * End-to-end verification against the REAL DeepSeek Harness tool runtime.
 *
 * Unlike `run-tests.mjs` (which drives the plugin with a mock context), this
 * script instantiates the actual Cordis `Context` and the actual
 * `ToolRuntime` from `@deepseek-ai/dsh-tools`, loads the plugin into it, and
 * dispatches calls through the real registry pipeline:
 *
 *   arguments validation -> execute() -> output.schema validation ->
 *   output.render() -> ContentBlock[] contents
 *
 * This is the closest offline check to "the model calls the tool in the
 * harness". It cannot prove the plugin loads inside the Electron app (that
 * needs a harness restart), but it does prove the tool contract is honoured by
 * the registry itself, not merely by our own test harness.
 *
 * `node test/verify-against-dsh-tools.mjs`
 */

import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Context, Service } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'

import * as plugin from '../src/plugin.js'
import { BUNDLED_WORKFLOW_DIR } from '../src/lib/root.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(HERE, '..')
const PAPER_GOGO = 'D:\\Skills\\Paper-gogo-v2'

const EXPECTED_TOOLS = [
  'paper_manifest',
  'paper_doc',
  'paper_gate',
  'paper_evidence',
  'paper_route',
  'paper_phase_log',
  'paper_doctor',
]

let passed = 0
let failed = 0
const failures = []

function check(name, fn) {
  try {
    fn()
    passed++
    console.log(`  ok   ${name}`)
  } catch (err) {
    failed++
    failures.push({ name, err })
    console.log(`  FAIL ${name}\n         ${String(err.message).split('\n')[0]}`)
  }
}

/** Minimal stand-in for the systemPrompt service ToolRuntime requires. */
class StubSystemPrompt extends Service {
  constructor(ctx) {
    super(ctx, 'systemPrompt')
  }

  /** ToolRuntime calls this during construction to register its schema section. */
  tools() {
    return () => {}
  }

  section() {
    return () => {}
  }
}

console.log('启动真实 Cordis Context + ToolRuntime\n')

const ctx = new Context()
new StubSystemPrompt(ctx)
const runtime = new ToolRuntime(ctx, { mode: 'native' })

console.log(`ToolRuntime 已挂载：ctx.tools = ${typeof ctx.tools}, register = ${typeof ctx.tools?.register}\n`)

// Load the plugin into the REAL context.
plugin.apply(ctx, { root: PAPER_GOGO })

// --- schema projection ----------------------------------------------------

console.log('注册结果（模型可见的 schema 投影）')

const schemas = ctx.tools.schemas()
check(`注册了 ${EXPECTED_TOOLS.length} 个工具`, () => {
  const names = schemas.map((s) => s.name).sort()
  assert.deepEqual(names, [...EXPECTED_TOOLS].sort())
})

check('每个 schema 都带 name/description/parameters', () => {
  for (const s of schemas) {
    assert.ok(s.name, '缺少 name')
    assert.ok(s.description && s.description.length > 20, `${s.name} description 过短`)
    assert.equal(typeof s.parameters, 'object', `${s.name} 缺少 parameters`)
  }
})

check('schema 投影不泄漏 execute / output 等内部字段', () => {
  for (const s of schemas) {
    assert.equal(s.execute, undefined, `${s.name} 泄漏了 execute`)
    assert.equal(s.output, undefined, `${s.name} 泄漏了 output`)
    assert.equal(s.presentCall, undefined, `${s.name} 泄漏了 presentCall`)
  }
})

check('ctx.tools.get 能按名字解析到定义', () => {
  for (const n of EXPECTED_TOOLS) {
    assert.ok(ctx.tools.get(n), `${n} 无法通过 get 解析`)
  }
})

// --- real dispatch --------------------------------------------------------

console.log('\n通过真实注册表派发调用（含参数校验、规范值校验与渲染）')

let seq = 0
async function dispatch(name, args) {
  const result = await ctx.tools.execute({
    callId: `verify-${++seq}`,
    name,
    arguments: args,
    signal: new AbortController().signal,
  })
  return result
}

function textOf(result) {
  return (result.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
}

const manifest = await dispatch('paper_manifest', {})
check('paper_manifest 派发成功且返回 18 Phase', () => {
  assert.equal(manifest.isError, false, `派发失败：${textOf(manifest)}`)
  assert.equal(manifest.value.phaseCount, 18)
  assert.match(textOf(manifest), /质量门禁/)
})

const manifestP7 = await dispatch('paper_manifest', { phase: 7 })
check('paper_manifest 单 Phase 细节派发成功', () => {
  assert.equal(manifestP7.isError, false, `派发失败：${textOf(manifestP7)}`)
  assert.equal(manifestP7.value.filtered, 7)
  assert.match(textOf(manifestP7), /7A/)
})

const doc = await dispatch('paper_doc', { doc: 'skill' })
check('paper_doc 读取入口 SKILL.md', () => {
  assert.equal(doc.isError, false, `派发失败：${textOf(doc)}`)
  assert.equal(doc.value.found, true)
  assert.match(textOf(doc), /paper-gogo/)
})

const outline = await dispatch('paper_doc', { doc: 'workflow', mode: 'outline' })
check('paper_doc outline 模式派发成功', () => {
  assert.equal(outline.isError, false, `派发失败：${textOf(outline)}`)
  assert.ok(outline.value.sections.length > 10)
})

const gate = await dispatch('paper_gate', {
  phase: 8,
  gates: { G0: 'PASS', G1: 'PASS', G2: 'PASS', G3: 'PASS', G4: 'FAIL', G5: 'PASS', G6: 'PASS' },
  next: true,
})
check('paper_gate 在真实流水线中阻断 FAIL 门禁', () => {
  assert.equal(gate.isError, false, `派发失败：${textOf(gate)}`)
  assert.equal(gate.value.recommendation, 'BLOCKED')
  assert.match(textOf(gate), /不能靠润色覆盖/)
})

const evidence = await dispatch('paper_evidence', {
  claims: '| 主张 | 状态 |\n|---|---|\n| A | SUPPORTED |\n| B | MISSING |',
})
check('paper_evidence 在真实流水线中阻断 MISSING', () => {
  assert.equal(evidence.isError, false, `派发失败：${textOf(evidence)}`)
  assert.equal(evidence.value.verdict, 'BLOCKED')
})

const route = await dispatch('paper_route', { intent: '帮我看看创新点够不够' })
check('paper_route 在真实流水线中完成意图路由', () => {
  assert.equal(route.isError, false, `派发失败：${textOf(route)}`)
  assert.equal(route.value.recommendation.cmd, '/检查创新')
})

const doctor = await dispatch('paper_doctor', {})
check('paper_doctor 在真实流水线中报告可用根', () => {
  assert.equal(doctor.isError, false, `派发失败：${textOf(doctor)}`)
  assert.equal(doctor.value.usable, true)
})

// --- error handling ------------------------------------------------------

console.log('\n错误路径')

const unknown = await dispatch('paper_does_not_exist', {})
check('未注册的工具名返回 isError 而不是抛异常', () => {
  assert.equal(unknown.isError, true)
  const info = unknown.error?.info
  assert.ok(info, '错误应带结构化 info')
  // HarnessError carries `name` = ToolNotFoundError and `code` = UNKNOWN_TOOL.
  assert.equal(info.code, 'UNKNOWN_TOOL', `实际 code: ${JSON.stringify(info)}`)
  assert.match(String(unknown.error.message), /paper_does_not_exist/)
})

const badType = await dispatch('paper_gate', { phase: '不是数字', gates: {} })
check('类型错误的参数被注册表拒绝为 isError', () => {
  assert.equal(badType.isError, true)
})

const missingRequired = await dispatch('paper_doc', {})
check('缺少必填参数被注册表拒绝为 isError', () => {
  assert.equal(missingRequired.isError, true)
})

const badPhase = await dispatch('paper_gate', { phase: 99, gates: {} })
check('业务校验失败（phase 越界）表现为 isError', () => {
  assert.equal(badPhase.isError, true)
  assert.match(textOf(badPhase), /0-17/)
})

const badDoc = await dispatch('paper_doc', { doc: 'not-a-doc' })
check('enum 非法值被注册表拒绝为 isError', () => {
  assert.equal(badDoc.isError, true)
})

// --- phase log against the real registry ---------------------------------

console.log('\n阶段记录写入（真实流水线）')

const logResult = await dispatch('paper_phase_log', {
  phase: 0,
  goal: '真实注册表端到端验证',
  skills: ['world-model-method'],
  evidenceState: 'SUPPORTED',
  open: ['这是自动验证写入，随即删除'],
  next: '无需后续步骤',
})
check('paper_phase_log 通过真实流水线写入记录', () => {
  assert.equal(logResult.isError, false, `派发失败：${textOf(logResult)}`)
  assert.match(logResult.value.relPath, /Phase0_项目检查\.md$/)
  // The plugin is self-contained, so the record lands in its bundled workflow.
  assert.ok(
    logResult.value.absolutePath.startsWith(BUNDLED_WORKFLOW_DIR),
    `写入应在自带目录内：${logResult.value.absolutePath}`,
  )
})
{
  const { readFile, rm } = await import('node:fs/promises')
  const written = await readFile(logResult.value.absolutePath, 'utf8')
  check('记录文件包含技能、证据状态与 Phase 名称', () => {
    assert.match(written, /world-model-method/)
    assert.match(written, /SUPPORTED/)
    assert.match(written, /Phase 0：项目检查/)
  })
  await rm(logResult.value.absolutePath, { force: true })
  console.log('  ok   已清理验证写入的记录文件')
}

// --- summary --------------------------------------------------------------

console.log(`\n${'-'.repeat(64)}`)
console.log(`真实运行时验证：通过 ${passed} 项，失败 ${failed} 项`)
if (failed > 0) {
  console.log('\n失败明细：')
  for (const f of failures) console.log(`\n- ${f.name}\n  ${f.err.stack || f.err.message}`)
  process.exit(1)
}
console.log('插件与真实 ToolRuntime 的契约完全一致。')
