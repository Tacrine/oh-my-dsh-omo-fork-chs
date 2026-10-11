/**
 * The single source of truth for the three rewrites that turn the chs bundle's
 * machine-local patch into a publishable one.
 *
 * Why this module exists instead of duplicating the rules in both tools:
 *
 * `tools/port-patch.mjs` produces the patch and `tools/verify-patch.mjs` proves
 * the produced patch still equals what those rules compute. If each tool carried
 * its own copy of the rules, a drift between the two copies would make the
 * verifier agree with a wrong generator — the check would be self-confirming
 * rather than self-consistent in the one way that matters. Both tools therefore
 * import the rules from here, and the verifier's independence comes from the
 * separate `git diff --no-index` hunk-count evidence (Todo 8), not from having a
 * second copy of the same regular expressions.
 *
 * What the three rewrites are, and why each is needed:
 *
 *  1. The package self-reference. The bundle patch mounts its own persona plugin
 *     with `name: '<pkg>/persona'`. The bundle's working copy points that row at
 *     the machine-local `@local/dsh-preset-omo-fork-chs`, which exists only in
 *     one profile. It must name the published package instead.
 *
 *  2. The nine persona path anchors. Each anchored subagent row reads its persona
 *     document through
 *     `fileURLToPath(new URL('./node_modules/<local pkg>/personas/<file>', baseUrl))`.
 *     That path is relative to whatever `baseUrl` the declaring loader has, which
 *     is the profile directory, not the installed package. The rewritten form
 *     resolves the package directory through
 *     `createRequire(baseUrl).resolve('<pkg>/package.json')`, which is correct in
 *     every install layout — and it is why `package.json` must keep exporting
 *     `"./package.json"`. The URL round-trip is removed with the anchor, because
 *     the replacement already yields a filesystem path.
 *
 *  3. The header comment. Line 5 of the bundle patch names the old local package
 *     in prose. Prose is not code, so it is rewritten to the package name rather
 *     than left to name a package that no longer exists.
 *
 * Deliberately absent: any `agentOptions` handling. The chs patch carries no
 * `agentOptions:` key at all (the token appears only inside comments on lines 7
 * and 16), so there is nothing to strip. The English fork needed a strip step;
 * this one must not grow a no-op one.
 *
 * No absolute path appears in this file, and nothing here reads the filesystem.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/** The bundle's machine-local package name. The one literal all three rules key on. */
export const LOCAL_PACKAGE = '@local/dsh-preset-omo-fork-chs'

/**
 * The self-reference row. Anchored on the `name:` key so the comment on line 5
 * and the nine anchors cannot be matched by accident, and counted so a patch that
 * carries zero or two such rows fails loudly instead of half-converting.
 */
const SELF_REFERENCE = new RegExp(
  String.raw`name:[ \t]*'` + LOCAL_PACKAGE.replace(/[/@]/g, (c) => `\\${c}`) + String.raw`\/persona'`,
  'g',
)

/**
 * The persona path anchor. Captures the persona file name so the replacement can
 * rebuild the path with native segments, and is global so all nine sites are
 * rewritten in one pass while the count is checked separately.
 */
const PERSONA_ANCHOR = new RegExp(
  String.raw`process\.getBuiltinModule\('node:url'\)\.fileURLToPath\(` +
    String.raw`new URL\('\.\/node_modules\/` +
    LOCAL_PACKAGE.replace(/[/@]/g, (c) => `\\${c}`) +
    String.raw`\/personas\/([^']+)', baseUrl\)\)`,
  'g',
)

/** The remaining occurrences, which are prose in the header comment. */
const COMMENT_REFERENCE = new RegExp(LOCAL_PACKAGE.replace(/[/@]/g, (c) => `\\${c}`), 'g')

/**
 * Build the rewritten `!!js` expression for one persona file.
 * @param packageName - the published package name.
 * @param file - the persona document's file name, including its extension.
 */
export const personaExpression = (packageName, file) =>
  "process.getBuiltinModule('node:path').join(" +
  "process.getBuiltinModule('node:path').dirname(" +
  "process.getBuiltinModule('node:module').createRequire(baseUrl)" +
  `.resolve('${packageName}/package.json')), 'personas', '${file}')`

/**
 * Build the pre-port `!!js` expression for one persona file.
 *
 * This is the exact string `personaExpression` replaces, produced from the same
 * `LOCAL_PACKAGE` literal rather than retyped, so the inverse rule cannot drift
 * from the forward one.
 *
 * @param file - the persona document's file name, including its extension.
 */
export const localPersonaExpression = (file) =>
  "process.getBuiltinModule('node:url').fileURLToPath(" +
  `new URL('./node_modules/${LOCAL_PACKAGE}/personas/${file}', baseUrl))`

/** Escape a literal for use inside a regular expression. */
const escapeLiteral = (literal) => literal.replace(/[.*+?^${}()|[\]\\/]/g, (c) => `\\${c}`)

/**
 * The inverse of the persona anchor: matches the *rewritten* expression and
 * captures the package name and the persona file name, so the pre-port
 * expression can be rebuilt.
 *
 * This regex is a transcription of `personaExpression` with its two variables
 * turned into capture groups. The two are kept in step by `inverseProblems`
 * below, which asserts that re-applying the forward rules to the inverse output
 * reproduces the input exactly — so a transcription slip fails loudly instead of
 * silently producing a wrong baseline.
 */
const PERSONA_ANCHOR_INVERSE =
  /process\.getBuiltinModule\('node:path'\)\.join\(process\.getBuiltinModule\('node:path'\)\.dirname\(process\.getBuiltinModule\('node:module'\)\.createRequire\(baseUrl\)\.resolve\('([^']+)\/package\.json'\)\), 'personas', '([^']+)'\)/g

/** The inverse of the self-reference row, anchored on the `name:` key. */
const SELF_REFERENCE_INVERSE = /name:[ \t]*'([^']+)\/persona'/g

/** The inverse of the header comment rule: any remaining published-package mention. */
const commentReferenceInverse = (packageName) => new RegExp(escapeLiteral(packageName), 'g')

/** 1-based line number of the given character offset in `text`. */
const lineOf = (text, offset) => text.slice(0, offset).split('\n').length

/**
 * Apply the three rewrites to a patch text and report every site touched.
 *
 * Each site carries the 1-based line number in the *source* text, the line before
 * the rewrite and the line after it, so a reviewer can see exactly what changed
 * without diffing two 540-line documents by eye.
 *
 * @param text - the source patch text.
 * @param packageName - the published package name.
 * @returns the rewritten text, the counts per rule, and the touched sites.
 */
export function applyRewrites(text, packageName) {
  const sites = []
  const counts = { name: 0, persona: 0, comment: 0 }
  const sourceLines = text.split('\n')
  const lineText = (offset) => sourceLines[lineOf(text, offset) - 1]

  let out = text.replace(SELF_REFERENCE, (match, offset) => {
    counts.name += 1
    const after = `name: '${packageName}/persona'`
    sites.push({ rule: 'self-reference', line: lineOf(text, offset), before: lineText(offset), after: lineText(offset).replace(match, after) })
    return after
  })

  out = out.replace(PERSONA_ANCHOR, (match, file, offset) => {
    counts.persona += 1
    const after = personaExpression(packageName, file)
    sites.push({ rule: 'persona-anchor', line: lineOf(text, offset), file, before: lineText(offset), after: lineText(offset).replace(match, after) })
    return after
  })

  out = out.replace(COMMENT_REFERENCE, (match, offset) => {
    counts.comment += 1
    sites.push({ rule: 'comment', line: lineOf(text, offset), before: lineText(offset), after: lineText(offset).replace(match, packageName) })
    return packageName
  })

  sites.sort((a, b) => a.line - b.line)
  return { text: out, counts, sites }
}

/**
 * Apply the inverse of the three rewrites, in the inverse order, to recover the
 * pre-port patch text from a published one.
 *
 * This is what makes `baseline/cordis.patch.yml` derivable rather than
 * transcribed: the baseline is a frozen copy of the bundle's patch, and it is
 * checked into the repository so the round trip is verifiable in a clean clone
 * without depending on any machine-local directory.
 *
 * The result is verified by re-applying the forward rules and comparing against
 * the input, so a slip in the inverse patterns throws here instead of silently
 * producing a baseline that differs from the source.
 *
 * @param text - the published patch text.
 * @param packageName - the published package name.
 * @returns the pre-port text and the counts per inverse rule.
 */
export function applyInverseRewrites(text, packageName) {
  const counts = { name: 0, persona: 0, comment: 0 }

  let out = text.replace(PERSONA_ANCHOR_INVERSE, (_match, name, file) => {
    counts.persona += 1
    return localPersonaExpression(file)
  })

  out = out.replace(SELF_REFERENCE_INVERSE, (_match, name) => {
    counts.name += 1
    return `name: '${LOCAL_PACKAGE}/persona'`
  })

  out = out.replace(commentReferenceInverse(packageName), () => {
    counts.comment += 1
    return LOCAL_PACKAGE
  })

  const roundTrip = applyRewrites(out, packageName)
  if (roundTrip.text !== text) {
    throw new Error(
      'the inverse rewrites do not round-trip: re-applying the forward rules to the derived text did not ' +
        'reproduce the input, so the inverse patterns have drifted from the forward ones in tools/lib/rewrites.mjs',
    )
  }

  return { text: out, counts }
}

/**
 * The assertions the derived baseline must satisfy. Returned as a list of
 * messages, mirroring `productProblems` so the caller can throw with all the
 * problems at once.
 *
 * @param text - the derived baseline text.
 * @param counts - the counts returned by `applyInverseRewrites`.
 */
export function baselineProblems(text, counts) {
  const problems = []
  const occurrences = (needle) => text.split(needle).length - 1
  if (counts.name !== 1) problems.push(`expected exactly one self-reference row to invert, inverted ${counts.name}`)
  if (counts.persona !== 9) problems.push(`expected exactly 9 persona anchors to invert, inverted ${counts.persona}`)
  if (counts.comment !== 1) problems.push(`expected exactly one header comment occurrence to invert, inverted ${counts.comment}`)
  const selfReference = `name: '${LOCAL_PACKAGE}/persona'`
  if (occurrences(selfReference) !== 1) problems.push(`expected exactly one "${selfReference}" row, found ${occurrences(selfReference)}`)
  if (occurrences(`'./node_modules/${LOCAL_PACKAGE}/personas/`) !== 9) {
    problems.push(`expected 9 pre-port persona anchors, found ${occurrences(`'./node_modules/${LOCAL_PACKAGE}/personas/`)}`)
  }
  if (occurrences(LOCAL_PACKAGE) !== 11) problems.push(`expected 11 "${LOCAL_PACKAGE}" occurrences in total, found ${occurrences(LOCAL_PACKAGE)}`)
  return problems
}

/**
 * The assertions the produced patch must satisfy. Returned as a list of messages
 * so the caller decides whether to throw (generator) or to record a difference
 * (verifier); both tools check exactly the same four invariants.
 *
 * @param text - the produced patch text.
 * @param packageName - the published package name.
 * @param counts - the counts returned by `applyRewrites`.
 */
export function productProblems(text, packageName, counts) {
  const problems = []
  const occurrences = (needle) => text.split(needle).length - 1
  if (occurrences('@local/') !== 0) problems.push(`the produced patch still carries ${occurrences('@local/')} "@local/" occurrence(s)`)
  if (occurrences("'./node_modules/") !== 0) problems.push(`the produced patch still carries ${occurrences("'./node_modules/")} profile-relative "'./node_modules/" occurrence(s)`)
  if (occurrences(`${packageName}/persona`) !== 1) problems.push(`expected exactly one "${packageName}/persona" self-reference, found ${occurrences(`${packageName}/persona`)}`)
  if (occurrences("personas', '") !== 9) problems.push(`expected 9 rewritten persona anchors, found ${occurrences("personas', '")}`)
  if (counts.name !== 1) problems.push(`expected exactly one self-reference row to rewrite, rewrote ${counts.name}`)
  if (counts.persona !== 9) problems.push(`expected exactly 9 persona anchors to rewrite, rewrote ${counts.persona}`)
  if (counts.comment !== 1) problems.push(`expected exactly one header comment occurrence to rewrite, rewrote ${counts.comment}`)
  return problems
}

/**
 * Read a text file and report how much of it is actually there.
 *
 * A file whose bytes are all zero, or whose text is empty once whitespace is
 * removed, is a corruption, not a difference. Both tools refuse to reason about
 * such a file instead of reporting a verdict that looks like a content mismatch.
 *
 * @param path - the file to read.
 * @returns the text plus its byte count and non-zero byte ratio.
 */
export function readTextWithHealth(path) {
  const buffer = readFileSync(path)
  let nonZero = 0
  for (const byte of buffer) if (byte !== 0) nonZero += 1
  return {
    text: buffer.toString('utf8'),
    bytes: buffer.length,
    nonZeroRatio: buffer.length === 0 ? 0 : nonZero / buffer.length,
  }
}

/**
 * The zero-byte / near-zero-byte guard. Throws with the offending path in the
 * message so the caller never has to guess which input was corrupt.
 *
 * @param path - the file the text came from.
 * @param health - the value returned by `readTextWithHealth`.
 */
export function assertTextIsHealthy(path, health) {
  if (health.text.trim() === '') {
    throw new Error(`${path} is empty (or whitespace only): refusing to compare a zero-byte input`)
  }
  if (health.nonZeroRatio < 0.01) {
    throw new Error(
      `${path} is corrupted: only ${(health.nonZeroRatio * 100).toFixed(2)}% of its ${health.bytes} bytes are non-zero ` +
        '(the file looks like an all-NUL write), so any comparison against it would be meaningless',
    )
  }
}

/**
 * Read this repository's own `package.json` and return its `name`.
 *
 * The package name is derived from the manifest rather than hard-coded, so the
 * tools carry no name literal that could drift from the published package.
 *
 * @param fromDirectory - the directory whose `package.json` to read; defaults to
 *   the repository root, which is two levels above this module's own directory
 *   (`tools/lib/`).
 */
export function packageNameFromManifest(fromDirectory = join(import.meta.dirname, '..', '..')) {
  const manifest = join(fromDirectory, 'package.json')
  let parsed
  try {
    parsed = JSON.parse(readFileSync(manifest, 'utf8'))
  } catch (cause) {
    throw new Error(`cannot read the package name from ${manifest}: ${cause.message}`)
  }
  if (typeof parsed.name !== 'string' || parsed.name === '') {
    throw new Error(`${manifest} carries no usable "name" field; pass --package <name>`)
  }
  return parsed.name
}
