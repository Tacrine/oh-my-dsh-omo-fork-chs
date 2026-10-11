/**
 * Derive the frozen pre-port baseline from the published patch, and check that
 * the committed baseline still matches what the derivation produces.
 *
 * Why a committed baseline exists at all:
 *
 * The bundle this fork vendors from lives in a machine-local directory, and on
 * this machine the legacy preset directory the English fork verified against is
 * corrupted (every file except its manifest is an all-NUL write). A verification
 * chain that depends on either location cannot run in a clean clone, let alone in
 * CI. This tool therefore reverses the three port rewrites to recover the
 * pre-port patch, and that result is committed as `baseline/cordis.patch.yml`.
 * The round trip (`port-patch --src baseline` reproduces the published patch) is
 * then checkable anywhere, with no machine-local input.
 *
 * Why the baseline is byte-identical to the source rather than merely equivalent:
 * equivalence would be unverifiable without the source. Byte identity is a
 * property a clean clone can test with one hash, and it is what makes the round
 * trip a proof rather than a plausibility argument. That is also why nothing may
 * be added to the baseline file: a provenance header would break both the hash
 * assertion and the round trip. Provenance lives in `baseline/README.md`.
 *
 * What the reverse derivation does and does not prove:
 *
 * It proves the port is *reproducible*: the published patch and the committed
 * baseline are related by exactly the three documented rewrites, and re-applying
 * those rewrites to the baseline reproduces the published patch byte for byte.
 * It does NOT prove the content is correct. If the source patch itself were
 * wrong, the derivation would faithfully reproduce that wrongness. The prior
 * evidence for content correctness is the chs port work's own verification set,
 * which reported `FAITHFUL` for the bundle and `CLEAN` for the deport; those
 * checkers are machine-local and are not shipped with this package. See
 * `baseline/README.md`.
 *
 * The inverse rules live in `tools/lib/rewrites.mjs`, next to the forward rules
 * they invert, and that module re-applies the forward rules to this tool's output
 * as a self-check — so a transcription slip in the inverse patterns throws here
 * rather than silently committing a wrong baseline.
 *
 * `--check` compares the committed baseline against a freshly derived copy and
 * prints the differing lines, so a drift is diagnosable rather than merely
 * reported.
 *
 * No absolute path appears in this file.
 *
 * Usage:
 *   node tools/derive-baseline.mjs [--patch <file>] [--out <dir>] [--check]
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  applyInverseRewrites,
  baselineProblems,
  packageNameFromManifest,
  readTextWithHealth,
  assertTextIsHealthy,
} from './lib/rewrites.mjs'

/** Parse `--flag value` pairs plus the bare `--check`; unknown input is a hard error. */
export const parseArgs = (argv) => {
  const flags = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`)
    const name = token.slice(2)
    if (name === 'check') {
      flags.check = true
      continue
    }
    if (!['patch', 'out', 'package'].includes(name)) throw new Error(`unknown flag: ${token}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${token} needs a value`)
    flags[name] = value
    index += 1
  }
  return flags
}

/**
 * The first index at which two line arrays differ, or -1 when they are equal.
 * @param left - the expected lines.
 * @param right - the actual lines.
 */
const firstDifference = (left, right) => {
  const limit = Math.max(left.length, right.length)
  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) return index
  }
  return -1
}

function main() {
  const flags = parseArgs(process.argv.slice(2))

  const ROOT = join(import.meta.dirname, '..')
  const PATCH = flags.patch ?? join(ROOT, 'cordis.patch.yml')
  const OUT_DIR = flags.out ?? join(ROOT, 'baseline')
  const BASELINE = join(OUT_DIR, 'cordis.patch.yml')
  const PACKAGE = flags.package ?? packageNameFromManifest(ROOT)

  const product = readTextWithHealth(PATCH)
  assertTextIsHealthy(PATCH, product)

  const derived = applyInverseRewrites(product.text, PACKAGE)
  const problems = baselineProblems(derived.text, derived.counts)
  if (problems.length !== 0) {
    throw new Error(`the derived baseline is not the pre-port patch:\n  - ${problems.join('\n  - ')}`)
  }

  if (flags.check === true) {
    if (!existsSync(BASELINE)) {
      throw new Error(`no baseline to check at ${BASELINE}: run without --check to derive it first`)
    }
    const committed = readTextWithHealth(BASELINE)
    assertTextIsHealthy(BASELINE, committed)
    if (committed.text === derived.text) {
      process.stdout.write(`baseline matches the derivation: ${BASELINE} (${committed.bytes} bytes)\n`)
      return
    }
    const expectedLines = derived.text.split('\n')
    const actualLines = committed.text.split('\n')
    const at = firstDifference(expectedLines, actualLines)
    process.stderr.write(
      `baseline drift at ${BASELINE}: the committed file differs from the derivation starting at line ${at + 1}\n` +
        `  derived  : ${JSON.stringify(expectedLines[at])}\n` +
        `  committed: ${JSON.stringify(actualLines[at])}\n` +
        `  derived ${expectedLines.length} lines, committed ${actualLines.length} lines\n`,
    )
    process.exitCode = 1
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(BASELINE, derived.text, 'utf8')

  process.stdout.write(
    `wrote ${BASELINE}: name-inversions=${derived.counts.name} persona-inversions=${derived.counts.persona} ` +
      `comment-inversions=${derived.counts.comment} package=${PACKAGE}\n`,
  )
}

/**
 * Run only when this module is the process entry point.
 *
 * Without this guard, importing the module — which the unit tests do, to reach
 * `parseArgs` — would also run the tool against the test runner's own argument
 * list, print an error and set a non-zero exit code. The tool's behaviour when it
 * is actually executed is unchanged; only the import path is quietened.
 */
const isEntryPoint = () => process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isEntryPoint()) {
  try {
    main()
  } catch (error) {
    // Fail loud but clean: the message names the flag or file at fault, and a raw
    // stack trace would only bury it.
    process.stderr.write(`derive-baseline: ${error.message}\n`)
    process.exitCode = 1
  }
}
