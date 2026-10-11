/**
 * Prove that the published `cordis.patch.yml` still equals what the three
 * documented rewrites compute from its source, and — when a runtime is available
 * — that it still composes to the same entry list.
 *
 * Why two levels of checking, and why the text level is the verdict:
 *
 * `npm run check` has to pass in a clean clone with zero installed dependencies,
 * so the deep comparison can only be opportunistic. The text-level check always
 * runs: it takes the source patch, applies the same three rewrites
 * `tools/port-patch.mjs` applies (both import them from
 * `tools/lib/rewrites.mjs`, so the two cannot drift), and compares the result
 * line by line against the published patch. It then asserts that exactly 11 sites
 * were rewritten and that no `@local/` occurrence survives.
 *
 * That check is self-consistent by construction — the expected text is derived by
 * the same rules that produced the artifact — so it cannot prove the rules
 * themselves are right. Todo 8 therefore records a second, independent piece of
 * evidence: `git diff --no-index -U0` between the source patch and the product
 * must yield exactly 11 hunks, each one removal and one addition. Neither piece
 * is sufficient alone and neither is treated as such.
 *
 * The YAML level, when it runs, is the stronger check: both documents are parsed
 * with the real entry-list dialect and compared structurally, with every `__jsExpr`
 * string normalised to a fixed placeholder first, so a rewritten expression is
 * compared for shape rather than for text. It also asserts the declaration's
 * identity (`id`, `order`, `name`) and that the plugin list length matches the
 * source's.
 *
 * Corrupted input is never reported as a difference. A file that is empty after
 * whitespace removal, or whose bytes are almost all zero, is a corruption: the
 * tool says so, names the file, and exits non-zero without emitting a verdict.
 *
 * Every flag has a derived default, and no absolute path appears in this file.
 *
 * Usage:
 *   node tools/verify-patch.mjs [--patch <file>] [--src <dir>] [--legacy <file>] \
 *     [--package <name>] [--runtime <node_modules>] [--dump <file>] [--quiet]
 */

import { readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import {
  applyRewrites,
  productProblems,
  packageNameFromManifest,
  readTextWithHealth,
  assertTextIsHealthy,
} from './lib/rewrites.mjs'

/** The declaration this verifier expects to find in the patch. */
const EXPECTED_DECLARATION = { id: 'preset-omo-fork-chs', name: 'Oh My DSH Chs - OMO Fork', order: 11 }

/** The number of rewrite sites the three rules must touch. */
const EXPECTED_SITES = 11

/** The placeholder every `__jsExpr` value is normalised to before comparing. */
const JS_EXPR_PLACEHOLDER = '<js-expr>'

/**
 * Parse `--flag value` pairs; unknown flags, missing values and bare tokens are
 * hard errors. Exported because the unit tests exercise it directly.
 *
 * @param argv - the argument list, without the `node` and script entries.
 */
export const parseArgs = (argv) => {
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`)
    const name = token.slice(2)
    if (name === 'quiet') {
      flags.quiet = true
      continue
    }
    if (!['patch', 'src', 'legacy', 'package', 'runtime', 'dump'].includes(name)) {
      throw new Error(`unknown flag: ${token}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${token} needs a value`)
    flags[name] = value
    index += 1
  }
  return flags
}

/**
 * Resolve the runtime `node_modules` directory from `--runtime` then
 * `$DSH_RUNTIME`, and nothing else. There is no machine path in this file and no
 * filesystem search: a runtime that was not asked for is a runtime this tool does
 * not guess at.
 *
 * @param explicit - the `--runtime` value, when given.
 * @returns the absolute runtime path, or `undefined` when none was supplied.
 */
export function resolveRuntime(explicit) {
  const candidate = explicit ?? (process.env.DSH_RUNTIME === '' ? undefined : process.env.DSH_RUNTIME)
  if (candidate === undefined) return undefined
  if (!isAbsolute(candidate)) {
    throw new Error(
      `--runtime must be an absolute path (got "${candidate}"): the runtime modules are imported ` +
        'through a file:/// URL, which cannot be built from a relative path. Pass the absolute ' +
        'path of the node_modules directory that holds js-yaml and @deepseek-ai/cordis-plugin-include.',
    )
  }
  return candidate
}

/**
 * Load the two runtime modules. Both must come from the same runtime, because the
 * `!!js` scalars only arrive as `{__jsExpr}` nodes when the entry-list dialect is
 * supplied by the matching `@deepseek-ai/cordis-plugin-include`.
 *
 * @param runtime - the absolute runtime `node_modules` directory.
 */
async function loadRuntimeModules(runtime) {
  try {
    const yaml = (await import(`file:///${runtime}/js-yaml/dist/js-yaml.mjs`)).default
    const { entryListSchema } = await import(`file:///${runtime}/@deepseek-ai/cordis-plugin-include/lib/index.js`)
    return { yaml, entryListSchema }
  } catch (cause) {
    throw new Error(
      `cannot import js-yaml / @deepseek-ai/cordis-plugin-include from ${runtime}: ${cause.message}. ` +
        'Pass --runtime <absolute node_modules> that contains both modules.',
    )
  }
}

/** Deep-clone a parsed document, replacing every `__jsExpr` value with the placeholder. */
function normalizeJsExpr(node, counter) {
  if (Array.isArray(node)) return node.map((child) => normalizeJsExpr(child, counter))
  if (node === null || typeof node !== 'object') return node
  if (typeof node.__jsExpr === 'string') {
    counter.count += 1
    return { ...node, __jsExpr: JS_EXPR_PLACEHOLDER }
  }
  return Object.fromEntries(Object.entries(node).map(([key, value]) => [key, normalizeJsExpr(value, counter)]))
}

/** Collect every structural difference between two values, reported by path. */
function diff(left, right, path = '$') {
  const out = []
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return [`${path}: array/non-array mismatch`]
    if (left.length !== right.length) out.push(`${path}: length ${left.length} != ${right.length}`)
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
      out.push(...diff(left[index], right[index], `${path}[${index}]`))
    }
    return out
  }
  if (left !== null && right !== null && typeof left === 'object' && typeof right === 'object') {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
      if (!Object.hasOwn(left, key)) out.push(`${path}.${key}: missing in the expected document`)
      else if (!Object.hasOwn(right, key)) out.push(`${path}.${key}: missing in the published patch`)
      else out.push(...diff(left[key], right[key], `${path}.${key}`))
    }
    return out
  }
  if (left !== right) out.push(`${path}: ${JSON.stringify(left)} != ${JSON.stringify(right)}`)
  return out
}

/** Read a `--dump-config` capture as its YAML document alone. */
function readDumpDocument(path) {
  const lines = readFileSync(path, 'utf8').split(/\r?\n/)
  const start = lines.findIndex((line) => line.startsWith('# ==') || line.startsWith('- id:'))
  if (start < 0) throw new Error(`no YAML document found in ${path}`)
  return lines.slice(start).join('\n')
}

async function main() {
  const flags = parseArgs(process.argv.slice(2))
  const quiet = flags.quiet === true

  const PATCH = flags.patch ?? join(import.meta.dirname, '..', 'cordis.patch.yml')
  const RUNTIME = resolveRuntime(flags.runtime)

  const patchHealth = readTextWithHealth(PATCH)
  assertTextIsHealthy(PATCH, patchHealth)

  /**
   * Where the expected text comes from: `--src` names a directory holding the
   * source patch, `--legacy` names the file directly, and `--legacy` wins when
   * both are given so the more specific flag decides.
   */
  let legacySource
  if (flags.legacy !== undefined) legacySource = flags.legacy
  else if (flags.src !== undefined) legacySource = join(flags.src, 'cordis.patch.yml')
  if (legacySource === undefined) {
    throw new Error(
      'no source to derive the expected text from: pass --legacy <source patch> (or --src <dir>). ' +
        'The default source is this repository\'s baseline/cordis.patch.yml, which does not exist yet; ' +
        'pass the bundle patch or the baseline explicitly until it does.',
    )
  }

  const legacyHealth = readTextWithHealth(legacySource)
  assertTextIsHealthy(legacySource, legacyHealth)

  const PACKAGE = flags.package ?? packageNameFromManifest()

  const expected = applyRewrites(legacyHealth.text, PACKAGE)
  const differences = []

  for (const problem of productProblems(expected.text, PACKAGE, expected.counts)) differences.push(problem)
  if (expected.sites.length !== EXPECTED_SITES) {
    differences.push(`expected exactly ${EXPECTED_SITES} rewrite sites, found ${expected.sites.length}`)
  }

  const expectedLines = expected.text.split('\n')
  const patchLines = patchHealth.text.split('\n')
  if (expectedLines.length !== patchLines.length) {
    differences.push(`line count differs: expected ${expectedLines.length}, published patch ${patchLines.length}`)
  }
  for (let index = 0; index < Math.min(expectedLines.length, patchLines.length); index += 1) {
    if (expectedLines[index] !== patchLines[index]) {
      differences.push(
        `line ${index + 1}: expected ${JSON.stringify(expectedLines[index])} but the published patch has ` +
          JSON.stringify(patchLines[index]),
      )
    }
  }

  let yamlCompare = 'skipped'
  if (RUNTIME !== undefined) {
    const { yaml, entryListSchema } = await loadRuntimeModules(RUNTIME)
    const expectedDoc = yaml.load(expected.text, { schema: entryListSchema })
    const patchDoc = yaml.load(flags.dump === undefined ? patchHealth.text : readDumpDocument(flags.dump), { schema: entryListSchema })

    const expectedCounter = { count: 0 }
    const patchCounter = { count: 0 }
    const normalizedExpected = normalizeJsExpr(expectedDoc, expectedCounter)
    const normalizedPatch = normalizeJsExpr(patchDoc, patchCounter)

    const declaration = normalizedPatch?.find((entry) => entry.insert !== undefined)?.insert?.[0]
    if (declaration === undefined) {
      differences.push('yaml: no declaration row found in the published patch')
    } else {
      if (declaration.id !== EXPECTED_DECLARATION.id) differences.push(`yaml: declaration id is ${declaration.id}, expected ${EXPECTED_DECLARATION.id}`)
      if (declaration.name !== '@deepseek-ai/dsh-agent-preset') differences.push(`yaml: declaration plugin is ${declaration.name}`)
      if (declaration.config?.id !== undefined && declaration.config.id !== 'omo-fork-chs') {
        differences.push(`yaml: config.id is ${declaration.config.id}, expected omo-fork-chs`)
      }
      if (declaration.config?.name !== EXPECTED_DECLARATION.name) {
        differences.push(`yaml: config.name is ${JSON.stringify(declaration.config?.name)}, expected ${JSON.stringify(EXPECTED_DECLARATION.name)}`)
      }
      if (declaration.config?.order !== EXPECTED_DECLARATION.order) {
        differences.push(`yaml: config.order is ${declaration.config?.order}, expected ${EXPECTED_DECLARATION.order}`)
      }
      const expectedPlugins = normalizedExpected?.find((entry) => entry.insert !== undefined)?.insert?.[0]?.config?.plugins
      if (Array.isArray(expectedPlugins) && Array.isArray(declaration.config?.plugins)) {
        if (expectedPlugins.length !== declaration.config.plugins.length) {
          differences.push(`yaml: config.plugins.length is ${declaration.config.plugins.length}, source has ${expectedPlugins.length}`)
        }
      } else {
        differences.push('yaml: could not read the plugin list from one of the documents')
      }
    }

    if (expectedCounter.count !== patchCounter.count) {
      differences.push(`yaml: __jsExpr node count differs: source has ${expectedCounter.count}, published patch has ${patchCounter.count}`)
    }
    differences.push(...diff(normalizedExpected, normalizedPatch, '$'))
    yamlCompare = 'ok'
  }

  const verdict = differences.length === 0 ? 'IDENTICAL' : 'DIFFERS'
  const report = {
    verdict,
    rewrites: expected.counts,
    sites: expected.sites,
    yamlCompare,
    legacySource,
    differences,
  }

  if (!quiet) process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  if (verdict === 'DIFFERS') {
    if (quiet) process.stderr.write(`verify-patch: DIFFERS (${differences.length} difference(s))\n`)
    process.exitCode = 1
  }
}

try {
  await main()
} catch (error) {
  // Fail loud but clean: the message names the flag or file at fault, and a raw
  // stack trace would only bury it.
  process.stderr.write(`verify-patch: ${error.message}\n`)
  process.exitCode = 1
}
