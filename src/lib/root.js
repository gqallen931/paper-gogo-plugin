/**
 * Paper-gogo workflow root discovery.
 *
 * The plugin does not own the workflow content; it reads it from an installed
 * Paper-gogo package. Resolution is explicit-first, then environment, then an
 * upward search from the working directory, then configured candidates.
 */

import { access, readdir, readFile, stat } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/** True when `dir` looks like a Paper-gogo workflow root. */
export const SIGNATURE_FILE = 'SKILL.md'

/**
 * The workflow content bundled inside this plugin.
 *
 * The plugin ships its own copy so it is installable and immediately usable
 * with no external Paper-gogo dependency. An externally installed workflow
 * package can still be preferred with `preferBundled: false`.
 */
export const BUNDLED_WORKFLOW_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'workflow',
)

/** Files/subdirs that must exist for a directory to be a usable workflow root. */
const REQUIRED = ['paper-workflow-v6.md', 'references']

/** Optional extras reported by the doctor tool. */
const OPTIONAL = [
  'paper-workflow-v5.md',
  'PACKAGE_MANIFEST.md',
  'code_assets',
  'nature-skills',
  'code-understanding',
  'architecture-engineering',
  'world-model-method',
  'paper-framework-figure-studio-pro',
  'karpathy-guidelines',
  'python-expert',
]

async function exists(p) {
  try {
    await access(p, constants.F_OK)
    return true
  } catch {
    return false
  }
}

/** Check whether a directory is a usable Paper-gogo root. */
export async function isWorkflowRoot(dir) {
  if (!dir) return false
  for (const rel of [SIGNATURE_FILE, ...REQUIRED]) {
    if (!(await exists(path.join(dir, rel)))) return false
  }
  return true
}

/**
 * Walk from `startDir` upward looking for a directory that is a workflow root,
 * or that contains exactly one immediate child which is.
 */
export async function searchUpward(startDir) {
  let cur = path.resolve(startDir)
  for (;;) {
    if (await isWorkflowRoot(cur)) return cur
    // Also accept a parent that holds the package in a single child directory,
    // e.g. D:\Skills containing only Paper-gogo-v2.
    try {
      const entries = await readdir(cur, { withFileTypes: true })
      for (const e of entries) {
        if (!e.isDirectory()) continue
        const child = path.join(cur, e.name)
        if (await isWorkflowRoot(child)) return child
      }
    } catch {
      /* unreadable: keep walking */
    }
    const parent = path.dirname(cur)
    if (parent === cur) return null
    cur = parent
  }
}

/**
 * Resolve the workflow root.
 *
 * Default order prefers the copy bundled with this plugin, so a fresh install
 * works with no external package:
 *
 *   1. the plugin's bundled `workflow/` directory
 *   2. explicit config.root
 *   3. DSH_PAPER_GOGO_ROOT
 *   4. upward search from `cwd`
 *   5. configured candidates
 *
 * Pass `preferBundled: false` to prefer an externally installed package.
 * Returns `{ root, source }` or `{ root: null, source: 'unresolved', tried }`.
 */
export async function resolveWorkflowRoot({
  root,
  searchRoots = [],
  cwd = process.cwd(),
  preferBundled = true,
  bundledDir = BUNDLED_WORKFLOW_DIR,
} = {}) {
  const tried = []

  if (preferBundled && (await isWorkflowRoot(bundledDir))) {
    return { root: bundledDir, source: 'bundled', bundled: true }
  }

  if (root) {
    if (await isWorkflowRoot(root)) {
      return { root: path.resolve(root), source: 'config.root', bundled: path.resolve(root) === path.resolve(bundledDir) }
    }
    tried.push({ candidate: root, source: 'config.root', reason: 'missing SKILL.md / paper-workflow-v6.md / references' })
  }

  const fromEnv = process.env.DSH_PAPER_GOGO_ROOT || process.env.PAPER_GOGO_ROOT
  if (fromEnv) {
    if (await isWorkflowRoot(fromEnv)) return { root: path.resolve(fromEnv), source: 'env', bundled: false }
    tried.push({ candidate: fromEnv, source: 'env', reason: 'missing required files' })
  }

  const up = await searchUpward(cwd)
  if (up) return { root: up, source: `upward search from ${cwd}`, bundled: false }

  for (const cand of searchRoots) {
    if (!cand) continue
    if (await isWorkflowRoot(cand)) return { root: path.resolve(cand), source: 'config.searchRoots', bundled: false }
    tried.push({ candidate: cand, source: 'config.searchRoots', reason: 'missing required files' })
  }

  return { root: null, source: 'unresolved', tried, bundled: false }
}

/** Read a file relative to the workflow root. Throws with an actionable message. */
export async function readRootFile(root, rel) {
  const full = path.join(root, rel)
  try {
    return await readFile(full, 'utf8')
  } catch (err) {
    const e = new Error(`无法读取工作流文件 ${rel}（${full}）：${err.code || err.message}`)
    e.code = err.code
    throw e
  }
}

/** Read a file if present, else return null. */
export async function readRootFileOptional(root, rel) {
  try {
    return await readFile(path.join(root, rel), 'utf8')
  } catch {
    return null
  }
}

/** Inspect a workflow root and report what is present. */
export async function inspectRoot(root) {
  const required = []
  for (const rel of [SIGNATURE_FILE, ...REQUIRED]) {
    required.push({ rel, present: await exists(path.join(root, rel)) })
  }
  const optional = []
  for (const rel of OPTIONAL) {
    optional.push({ rel, present: await exists(path.join(root, rel)) })
  }

  let skillHead = null
  try {
    const skill = await readFile(path.join(root, SIGNATURE_FILE), 'utf8')
    const nameMatch = skill.match(/^name:\s*(.+)$/m)
    const descMatch = skill.match(/^description:\s*(.+)$/m)
    skillHead = {
      bytes: Buffer.byteLength(skill, 'utf8'),
      name: nameMatch ? nameMatch[1].trim() : null,
      description: descMatch ? descMatch[1].trim() : null,
    }
  } catch {
    /* reported via required[] */
  }

  let stats = null
  try {
    const s = await stat(root)
    stats = { mtime: s.mtime.toISOString() }
  } catch {
    /* ignore */
  }

  const usable = required.every((r) => r.present)
  return { usable, required, optional, skillHead, stats }
}
