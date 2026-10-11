/**
 * Port the chs bundle's machine-local patch into the publishable patch.
 *
 * Why this is a tool and not a hand edit:
 *
 * The bundle that this fork vendors from is a working deployment artifact. Its
 * `cordis.patch.yml` names a package that exists only in one machine's profile
 * (`@local/dsh-preset-omo-fork-chs`) in three places: the persona plugin's
 * self-reference row, the nine anchored subagent rows that read their persona
 * documents through a profile-relative `./node_modules/...` URL, and one line of
 * header prose. Publishing that file verbatim would ship a patch that cannot
 * mount anywhere else, and hand-editing it would make the next regeneration a
 * manual merge.
 *
 * This tool applies exactly those three rewrites — the rules live in
 * `tools/lib/rewrites.mjs`, shared with the verifier so the two can never drift —
 * and then asserts the product: no `@local/` left, no profile-relative
 * `'./node_modules/` left, exactly one self-reference, exactly nine rewritten
 * anchors. A partial conversion is a hard error, never a silent half-patch.
 *
 * What it deliberately does not do:
 *
 *   - It does not strip `agentOptions`. The chs patch has no such key; the token
 *     appears only inside comments on lines 7 and 16. A strip step here would be
 *     dead code pretending to be a safeguard.
 *   - It does not touch the declaration header (`id`, `config.id`, `config.name`,
 *     `order`). Those are content, not packaging.
 *   - It does not write `cordis.local.patch.yml`. That file belongs to the English
 *     fork's deployment, and this fork has no deployment-local rows to keep.
 *   - It writes no provenance comment into the product. Provenance belongs in
 *     `baseline/README.md`, so that the produced patch stays a pure function of
 *     its source and can be byte-compared against the committed one.
 *
 * `--src` has no default on purpose: this file carries no absolute path, and a
 * silent default would let the tool port the wrong bundle without saying so.
 *
 * Usage:
 *   node tools/port-patch.mjs --src <bundle dir> [--out <dir>] [--package <name>]
 *
 * `--src` is either the chs bundle directory
 * (`<DSH_HOME>/tools/omo-fork-chs-bundle`) or this repository's `baseline/`
 * directory, which holds the frozen copy of the same patch.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { applyRewrites, productProblems, packageNameFromManifest, readTextWithHealth, assertTextIsHealthy } from './lib/rewrites.mjs'

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
    if (!['src', 'out', 'package'].includes(name)) throw new Error(`unknown flag: ${token}`)
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${token} needs a value`)
    flags[name] = value
    index += 1
  }
  return flags
}

const USAGE = [
  'usage: node tools/port-patch.mjs --src <bundle dir> [--out <dir>] [--package <name>]',
  '',
  '  --src      the directory holding cordis.patch.yml to port. Required, with no',
  '             default: pass the chs bundle directory, or pass the repository\'s',
  '             baseline directory to re-port the frozen copy.',
  '  --out      the directory to write cordis.patch.yml into. Defaults to the',
  '             repository root.',
  '  --package  the published package name. Defaults to this repository\'s manifest.',
].join('\n')

function main() {
  const flags = parseArgs(process.argv.slice(2))

  if (flags.src === undefined) {
    throw new Error(`--src is required and has no default.\n\n${USAGE}`)
  }

  const OUT = flags.out ?? join(import.meta.dirname, '..')
  const PACKAGE = flags.package ?? packageNameFromManifest()

  const sourcePath = join(flags.src, 'cordis.patch.yml')
  const source = readTextWithHealth(sourcePath)
  assertTextIsHealthy(sourcePath, source)

  const { text, counts, sites } = applyRewrites(source.text, PACKAGE)

  const problems = productProblems(text, PACKAGE, counts)
  if (problems.length !== 0) {
    throw new Error(`the ported patch is not publishable:\n  - ${problems.join('\n  - ')}`)
  }

  mkdirSync(OUT, { recursive: true })
  const outPath = join(OUT, 'cordis.patch.yml')
  writeFileSync(outPath, text, 'utf8')

  process.stdout.write(
    `wrote ${outPath}: name-rewrites=${counts.name} persona-rewrites=${counts.persona} ` +
      `comment-rewrites=${counts.comment} sites=${sites.length} package=${PACKAGE}\n`,
  )
}

/**
 * Run only when this module is the process entry point.
 *
 * Without this guard, importing the module — which the unit tests do, to reach
 * `parseArgs` — would also run the tool against the test runner's own argument
 * list, print a usage error and set a non-zero exit code. The tool's behaviour
 * when it is actually executed is unchanged; only the import path is quietened.
 */
const isEntryPoint = () => process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isEntryPoint()) {
  try {
    main()
  } catch (error) {
    // Fail loud but clean: the message names the flag or file at fault, and a raw
    // stack trace would only bury it.
    process.stderr.write(`port-patch: ${error.message}\n`)
    process.exitCode = 1
  }
}
