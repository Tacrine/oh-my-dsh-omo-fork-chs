/**
 * The structural and license self-check for this package.
 *
 * Why this tool exists:
 *
 * The published package is assembled from four sources that can drift apart
 * independently: the generated patch, the manifest, the vendored persona files
 * and the three license documents. Each of the other tools in `tools/` checks one
 * edge of that graph (the port rules, the baseline round trip). This one checks
 * the whole thing at once, from the outside, using only what is actually on disk
 * and what git actually tracks — so it catches the failures none of the narrower
 * tools can see: a manifest that stopped exporting `"./package.json"`, a persona
 * anchor pointing at a file that is not there, a license file that went missing,
 * a machine path that leaked into a committed file, a scope mapping that no longer
 * covers every tracked path.
 *
 * Why it reads `git ls-files` instead of walking the directory tree:
 *
 * Three of the assertions are defined over the *tracked* set. The license scope
 * mapping must cover every tracked path and nothing else; the machine-path ban
 * applies to what will actually be published; the `@local/` classes partition the
 * tracked set. Walking the tree would pull in scratch directories and build
 * output, and would silently change meaning as those appear and disappear. When
 * git cannot answer, the tool says so and fails: a skipped mapping check is worse
 * than no check, because it reports success for work it never did.
 *
 * Why the `@local/` assertion is not "the whole tree must be zero":
 *
 * The pre-port package name is legitimately present in three different roles.
 * Shipped content must not carry it at all, because the published package must not
 * name a package that exists in one machine's profile. The committed baseline
 * carries it exactly 11 times, because the baseline *is* the pre-port text — that
 * is the whole point of it. And `NOTICE.md` carries it exactly once, because the
 * SUL requires a prominent notice that the software was modified, and that notice
 * names the pre-port scope it was re-anchored from. A flat "zero everywhere" rule
 * would be permanently red and would therefore be ignored, which is worse than no
 * rule. The five classes below partition the tracked set so that each role is
 * asserted for what it actually is.
 *
 * Corrupted or unreadable input is never reported as a pass. Every assertion names
 * the exact path it examined, and every failure names the path and, where it has
 * one, the line.
 *
 * One assertion needs a documented exception, and it is the machine-path scan
 * (A14). Ten lines of vendored persona prose name absolute paths from the machine
 * the localization work was done on. They are tolerated at exactly those ten
 * enumerated positions and nowhere else, because the personas must stay
 * byte-identical to the source bundle and sanitizing them is therefore not
 * available; byte identity is the harder constraint. The scan still covers every
 * tracked file including this one, still fails on any new occurrence anywhere, and
 * fails if an allowlisted position stops matching, so the exception cannot rot into
 * a blanket exemption. See `MACHINE_PATH_ALLOWLIST` for the list and the reasons.
 *
 * No absolute path appears in this file: the upstream license fingerprint can only
 * arrive through `--upstream-license`, `$OMO_UPSTREAM_LICENSE` or
 * `$OMO_UPSTREAM_LICENSE_SHA256`, and when none is present the check reports
 * `licenseHash: "skipped"` rather than guessing at a location.
 *
 * Usage:
 *   node tools/check-package.mjs [--patch <file>] [--manifest <file>]
 *     [--notice <file>] [--upstream-license <file>] [--quiet]
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** The package identity this repository is expected to publish under. */
const EXPECTED = {
  name: '@tacrine_f/oh-my-dsh-omo-fork-chs',
  version: '0.1.0',
  license: 'SEE LICENSE IN NOTICE.md',
}

/** The persona file names, in the order the frozen byte table lists them. */
const PERSONA_TABLE = [
  ['atlas.md', 40874],
  ['explore.md', 4720],
  ['hephaestus.md', 23405],
  ['librarian.md', 11517],
  ['metis.md', 10415],
  ['momus.md', 8444],
  ['multimodal-looker.md', 3595],
  ['oracle.md', 7684],
  ['prometheus.md', 41324],
  ['sisyphus-junior.md', 4015],
  ['sisyphus.md', 28719],
]

/** Every entry `files[]` must cover, and the bare name it must never contain. */
const REQUIRED_FILES = [
  'plan-aware-persona.mjs',
  'index.js',
  'personas/',
  'cordis.patch.yml',
  'baseline/',
  'test/',
  'tools/',
  'README.md',
  'README.zh.md',
  'CHANGELOG.md',
  'LICENSE-MIT.md',
  'LICENSE-SUL-1.0.md',
  'NOTICE.md',
]

/** The three license documents, and the bare name that must never exist beside them. */
const LICENSE_DOCUMENTS = ['LICENSE-MIT.md', 'LICENSE-SUL-1.0.md', 'NOTICE.md']

/** Strings `NOTICE.md` must carry; each one is a claim the license relies on. */
const NOTICE_STRINGS = [
  '## Modifications',
  'modified',
  'oh-my-openagent',
  'code-yeongyu',
  '3c711483856207ef530c09d062fa9077c225debb',
  'SUL-1.0',
  'LICENSE-SUL-1.0.md',
  'free of charge',
  'non-commercial',
  'not affiliated',
  '<!-- mit-scope -->',
  '<!-- sul-scope -->',
  'quoted fragments',
  'case-sensitive',
]

/** The scope blocks' markers, in the order they are declared. */
const SCOPE_MARKERS = [
  ['sul', '<!-- sul-scope -->'],
  ['mit', '<!-- mit-scope -->'],
]

/**
 * The second machine-path marker: the harness home directory name this repository
 * must never mention. Built from parts on purpose, so that this file does not
 * itself contain the literal it forbids — the scan below covers every tracked
 * file, including this one, so a literal here would make the tool fail on itself
 * the moment it is committed.
 */
const HARNESS_HOME_MARKER = '/' + 'DSH' + '-X/'

/**
 * The machine-path pattern: a drive letter, a colon and a separator, with a
 * lookbehind that rejects a preceding word character or the punctuation that
 * appears inside URLs. The lookbehind is load-bearing rather than stylistic: the
 * naive form without it reports the scheme separator of every `https://` URL as a
 * drive letter, and this repository's committed files contain several URLs. It is
 * kept as a regex literal rather than a string so that the file does not carry a
 * quoted example of the shape it forbids.
 */
const MACHINE_PATH = /(?<![A-Za-z0-9+.\-])[A-Za-z]:[\\/]/

/**
 * The only tracked positions where a machine path is tolerated, one entry per
 * known line, and the reason it is there.
 *
 * These are ten lines of vendored persona prose that name absolute paths from the
 * machine the localization work was done on. They are tolerated for one reason:
 * the personas must stay byte-identical to the source bundle, and Todo 5, the
 * content-fidelity check and the final bundle audit all re-assert that identity,
 * so sanitizing the prose is not available. Byte identity is the harder
 * constraint, so the paths stay and the scan learns about them by name.
 *
 * The list is deliberately enumerated rather than a directory exemption. A blanket
 * exemption over `personas/` would drop this assertion's protection across the
 * largest vendored surface, so a persona could later acquire a new machine path
 * unnoticed. With the list, a new occurrence anywhere still fails, and a stale
 * entry fails too, which is what forces this list to be revisited if the vendored
 * content ever changes.
 *
 * The reasons describe the shape and never reproduce a path, because this file is
 * itself covered by the scan below.
 */
const MACHINE_PATH_ALLOWLIST = [
  { path: 'personas/librarian.md', line: 229, reason: 'illustrative Windows temporary-directory example in a fenced block' },
  { path: 'personas/prometheus.md', line: 282, reason: 'the source deployment recovery helper, quoted in an invocation template' },
  { path: 'personas/prometheus.md', line: 292, reason: 'the source deployment recovery helper, quoted in an invocation template' },
  { path: 'personas/prometheus.md', line: 303, reason: 'the source deployment recovery helper, quoted in an invocation template' },
  { path: 'personas/prometheus.md', line: 319, reason: 'the source deployment recovery helper, quoted in an invocation template' },
  { path: 'personas/prometheus.md', line: 335, reason: 'the source deployment recovery helper, quoted in an invocation template' },
  { path: 'personas/prometheus.md', line: 346, reason: 'the source deployment recovery helper, quoted in an invocation template' },
  { path: 'personas/prometheus.md', line: 362, reason: 'the source deployment recovery helper, quoted in an invocation template' },
  { path: 'personas/prometheus.md', line: 374, reason: 'the source deployment recovery helper, quoted in an invocation template' },
  { path: 'personas/sisyphus.md', line: 52, reason: 'the source deployment recovery helper, named in the assistant-recovery instruction' },
]

/** The number of tolerated positions; asserted so the list cannot grow silently. */
const MACHINE_PATH_ALLOWLIST_SIZE = 10

/** Does this line carry a machine path, by either marker? */
const lineHasMachinePath = (line) => MACHINE_PATH.test(line) || line.includes(HARNESS_HOME_MARKER)

/**
 * The `@local/` classes, in priority order. A tracked path is assigned to the
 * first class whose `matches` accepts it, so the classes partition the tracked set
 * by construction: every path lands in exactly one, and no path can land in two.
 *
 * `expect` is the required count, or `null` for "report the count, assert nothing".
 */
const LOCAL_CLASSES = [
  {
    id: 'shipped-content',
    description: 'published content that must never name the pre-port package',
    expect: 0,
    matches: (path) =>
      path === 'cordis.patch.yml' ||
      path === 'package.json' ||
      path === 'plan-aware-persona.mjs' ||
      path === 'index.js' ||
      path.startsWith('personas/') ||
      path === 'README.md' ||
      path === 'README.zh.md' ||
      path === 'CHANGELOG.md' ||
      path === 'LICENSE-MIT.md' ||
      path === 'LICENSE-SUL-1.0.md',
  },
  {
    id: 'baseline',
    description: 'the frozen pre-port baseline, which is the pre-port text and therefore carries every occurrence',
    expect: 11,
    matches: (path) => path === 'baseline/cordis.patch.yml',
  },
  {
    id: 'notice',
    description: 'the modification notice, which names the pre-port scope it was re-anchored from',
    expect: 1,
    matches: (path) => path === 'NOTICE.md',
  },
  {
    id: 'tests',
    description: 'test sources, exempt from a count assertion because they exercise the pre-port name deliberately',
    expect: null,
    matches: (path) => path.startsWith('test/') && path.endsWith('.test.mjs'),
  },
  {
    id: 'catch-all',
    description: 'every remaining tracked file: reported, not asserted',
    expect: null,
    matches: () => true,
  },
]

/** Parse `--flag value` pairs plus the bare `--quiet`; unknown input is a hard error. */
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
    if (!['patch', 'manifest', 'notice', 'upstream-license'].includes(name)) {
      throw new Error(`unknown flag: ${token}`)
    }
    const value = argv[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${token} needs a value`)
    flags[name] = value
    index += 1
  }
  return flags
}

/** Read a file as UTF-8, failing with the path in the message. */
const readText = (path) => {
  try {
    return readFileSync(path, 'utf8')
  } catch (cause) {
    throw new Error(`cannot read ${path}: ${cause.message}`)
  }
}

/** SHA256 of a file's bytes, uppercase hex, failing with the path in the message. */
const fileSha256 = (path) => {
  let buffer
  try {
    buffer = readFileSync(path)
  } catch (cause) {
    throw new Error(`cannot read ${path}: ${cause.message}`)
  }
  return createHash('sha256').update(buffer).digest('hex').toUpperCase()
}

/** Count non-overlapping occurrences of a literal substring. */
const countOf = (text, needle) => text.split(needle).length - 1

/** The tracked path list, or an explicit failure when git cannot provide it. */
function trackedPaths() {
  try {
    return execFileSync('git', ['ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
  } catch (cause) {
    throw new Error(
      `cannot list the tracked files: run inside a git checkout. The scope mapping, the machine-path ` +
        `scan and the @local/ classes are all defined over the tracked set, so this tool will not ` +
        `silently skip them (git said: ${cause.message.trim()})`,
    )
  }
}

/** The entries of one scope block, in declaration order. */
function scopeEntries(notice, marker) {
  const start = notice.indexOf(marker)
  if (start < 0) throw new Error(`NOTICE.md has no ${marker} marker`)
  const fenceStart = notice.indexOf('```', start)
  const fenceEnd = notice.indexOf('```', fenceStart + 3)
  if (fenceStart < 0 || fenceEnd < 0) throw new Error(`NOTICE.md has no fenced block after ${marker}`)
  return notice
    .slice(fenceStart + 3, fenceEnd)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
}

/**
 * The match rule exactly as `NOTICE.md` states it: a trailing-slash entry matches
 * every tracked path that starts with that directory prefix, implemented as a
 * literal string prefix rather than a glob, so a dotfile under `test/` matches;
 * anything else matches exactly one path; matching is case-sensitive.
 */
const entryMatches = (entry, path) => (entry.endsWith('/') ? path.startsWith(entry) : path === entry)

function main() {
  const flags = parseArgs(process.argv.slice(2))
  const quiet = flags.quiet === true

  const ROOT = join(import.meta.dirname, '..')
  const PATCH = flags.patch ?? join(ROOT, 'cordis.patch.yml')
  const MANIFEST = flags.manifest ?? join(ROOT, 'package.json')
  const NOTICE = flags.notice ?? join(ROOT, 'NOTICE.md')
  const PERSONAS_DIR = join(ROOT, 'personas')

  const failures = []
  const checks = []
  const record = (id, path, detail) => checks.push({ id, path, detail })
  const fail = (id, path, message) => {
    failures.push(`${id} ${path}: ${message}`)
    checks.push({ id, path, detail: message, ok: false })
  }

  const patchText = readText(PATCH)
  const manifest = JSON.parse(readText(MANIFEST))
  const noticeText = readText(NOTICE)
  const packageName = manifest.name

  // A1: the manifest identity.
  if (manifest.name !== EXPECTED.name) fail('A1', MANIFEST, `name is ${JSON.stringify(manifest.name)}, expected ${JSON.stringify(EXPECTED.name)}`)
  if (manifest.version !== EXPECTED.version) fail('A1', MANIFEST, `version is ${JSON.stringify(manifest.version)}, expected ${JSON.stringify(EXPECTED.version)}`)
  if (manifest.private !== false) fail('A1', MANIFEST, `private is ${JSON.stringify(manifest.private)}, expected false`)
  record('A1', MANIFEST, `name=${manifest.name} version=${manifest.version} private=${manifest.private}`)

  // A2: the exports that make the package mountable.
  const exports = manifest.exports ?? {}
  for (const key of ['.', './persona', './cordis.patch.yml', './package.json']) {
    if (typeof exports[key] !== 'string') fail('A2', MANIFEST, `exports[${JSON.stringify(key)}] is missing; the nine persona anchors resolve <pkg>/package.json through createRequire and would throw ERR_PACKAGE_PATH_NOT_EXPORTED`)
  }
  record('A2', MANIFEST, `exports keys: ${Object.keys(exports).join(', ')}`)

  // A3: exactly one self-reference row.
  const selfReference = `name: '${packageName}/persona'`
  const selfReferences = countOf(patchText, selfReference)
  if (selfReferences !== 1) fail('A3', PATCH, `found ${selfReferences} occurrences of ${JSON.stringify(selfReference)}, expected exactly 1`)
  record('A3', PATCH, `${selfReferences} self-reference row(s)`)

  // A4: exactly nine persona anchors, each naming a real, non-empty persona.
  const anchorPattern =
    /process\.getBuiltinModule\('node:path'\)\.join\(process\.getBuiltinModule\('node:path'\)\.dirname\(process\.getBuiltinModule\('node:module'\)\.createRequire\(baseUrl\)\.resolve\('([^']+)\/package\.json'\)\), 'personas', '([^']+)'\)/g
  const personaAnchors = [...patchText.matchAll(anchorPattern)].map((match) => ({ package: match[1], file: match[2] }))
  if (personaAnchors.length !== 9) fail('A4', PATCH, `found ${personaAnchors.length} persona anchor expressions, expected exactly 9`)
  for (const anchor of personaAnchors) {
    if (anchor.package !== packageName) fail('A4', PATCH, `persona anchor for ${anchor.file} resolves ${JSON.stringify(anchor.package)}, expected ${JSON.stringify(packageName)}`)
    const personaPath = join(PERSONAS_DIR, anchor.file)
    if (!existsSync(personaPath)) {
      fail('A4', PATCH, `persona anchor names ${anchor.file}, which does not exist at ${personaPath}`)
      continue
    }
    const bytes = readFileSync(personaPath).length
    if (bytes === 0) fail('A4', personaPath, 'persona file is empty')
  }
  record('A4', PATCH, `${personaAnchors.length} anchor(s): ${personaAnchors.map((a) => a.file).join(', ')}`)

  // A5: files[] covers everything the package ships, and never a bare LICENSE.
  const files = Array.isArray(manifest.files) ? manifest.files : []
  for (const entry of REQUIRED_FILES) {
    if (!files.includes(entry)) fail('A5', MANIFEST, `files[] does not cover ${JSON.stringify(entry)}`)
  }
  if (files.includes('LICENSE')) fail('A5', MANIFEST, 'files[] contains a bare "LICENSE", which would make GitHub badge this SUL-1.0-dominant package as MIT')
  record('A5', MANIFEST, `files[] has ${files.length} entries`)

  // A6: the eleven persona files, with the frozen byte counts.
  const personaFiles = readdirSync(PERSONAS_DIR, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.md')).map((entry) => entry.name)
  const personas = {}
  if (personaFiles.length !== PERSONA_TABLE.length) {
    fail('A6', PERSONAS_DIR, `holds ${personaFiles.length} .md files, expected ${PERSONA_TABLE.length}`)
  }
  for (const [name, expectedBytes] of PERSONA_TABLE) {
    const personaPath = join(PERSONAS_DIR, name)
    if (!existsSync(personaPath)) {
      fail('A6', personaPath, 'missing')
      continue
    }
    const bytes = readFileSync(personaPath).length
    personas[name] = bytes
    if (bytes !== expectedBytes) fail('A6', personaPath, `is ${bytes} bytes, expected ${expectedBytes}`)
  }
  for (const name of personaFiles) {
    if (!PERSONA_TABLE.some(([expected]) => expected === name)) fail('A6', join(PERSONAS_DIR, name), 'unexpected persona file')
  }
  record('A6', PERSONAS_DIR, `${personaFiles.length} persona file(s)`)

  // A7: the license pointer in the manifest.
  if (manifest.license !== EXPECTED.license) fail('A7', MANIFEST, `license is ${JSON.stringify(manifest.license)}, expected ${JSON.stringify(EXPECTED.license)}`)
  record('A7', MANIFEST, `license=${manifest.license}`)

  // A8: the three license documents exist and no bare LICENSE does.
  for (const document of LICENSE_DOCUMENTS) {
    const documentPath = join(ROOT, document)
    if (!existsSync(documentPath)) fail('A8', documentPath, 'missing')
  }
  const bareLicense = join(ROOT, 'LICENSE')
  if (existsSync(bareLicense)) fail('A8', bareLicense, 'a bare LICENSE exists; it would make GitHub badge this SUL-1.0-dominant package as MIT')
  record('A8', ROOT, `license documents: ${LICENSE_DOCUMENTS.join(', ')}`)

  // A9: the MIT document is a MIT document and carries its scope line.
  const mitPath = join(ROOT, 'LICENSE-MIT.md')
  const mitText = readText(mitPath)
  if (!mitText.includes('Applies to:')) fail('A9', mitPath, 'does not contain "Applies to:"')
  if (!mitText.includes('Permission is hereby granted')) fail('A9', mitPath, 'does not contain the MIT grant sentence')
  if (mitText.includes('SUL')) fail('A9', mitPath, 'mentions SUL, which does not belong in the MIT document')
  record('A9', mitPath, 'MIT body and scope line present')

  // A10: the upstream fingerprint, from whichever source was supplied.
  const licensePath = join(ROOT, 'LICENSE-SUL-1.0.md')
  const licenseText = readText(licensePath)
  const actualLicenseHash = fileSha256(licensePath)
  const fileSource = flags['upstream-license'] ?? (process.env.OMO_UPSTREAM_LICENSE === '' ? undefined : process.env.OMO_UPSTREAM_LICENSE)
  const fingerprintSource = process.env.OMO_UPSTREAM_LICENSE_SHA256 === '' ? undefined : process.env.OMO_UPSTREAM_LICENSE_SHA256

  let licenseHash = 'skipped'
  let licenseHashSource = 'skipped'
  const fileHash = fileSource === undefined ? undefined : fileSha256(fileSource)
  let fingerprintHash
  if (fingerprintSource !== undefined) {
    if (!/^[0-9a-fA-F]{64}$/.test(fingerprintSource)) {
      throw new Error(
        `$OMO_UPSTREAM_LICENSE_SHA256 is not a 64-character hex fingerprint: ${JSON.stringify(fingerprintSource)}. ` +
          'A malformed fingerprint is a hard error, never a silent skip, because skipping it would report success for a check that never ran.',
      )
    }
    fingerprintHash = fingerprintSource.toUpperCase()
  }

  if (fileHash !== undefined && fingerprintHash !== undefined) {
    if (fileHash !== fingerprintHash) {
      fail('A10', fileSource, `the file hashes to ${fileHash} but $OMO_UPSTREAM_LICENSE_SHA256 is ${fingerprintHash}; both sources are present and must agree`)
    }
    if (actualLicenseHash !== fileHash) {
      fail('A10', licensePath, `hashes to ${actualLicenseHash}, expected ${fileHash} (from ${fileSource})`)
    }
    licenseHash = actualLicenseHash === fileHash && fileHash === fingerprintHash ? 'ok' : 'mismatch'
    licenseHashSource = 'file'
  } else if (fileHash !== undefined) {
    if (actualLicenseHash !== fileHash) {
      fail('A10', licensePath, `hashes to ${actualLicenseHash}, expected ${fileHash} (from ${fileSource})`)
      licenseHash = 'mismatch'
    } else {
      licenseHash = 'ok'
    }
    licenseHashSource = 'file'
  } else if (fingerprintHash !== undefined) {
    if (actualLicenseHash !== fingerprintHash) {
      fail('A10', licensePath, `hashes to ${actualLicenseHash}, expected ${fingerprintHash} (from $OMO_UPSTREAM_LICENSE_SHA256)`)
      licenseHash = 'mismatch'
    } else {
      licenseHash = 'ok'
    }
    licenseHashSource = 'fingerprint'
  }
  record('A10', licensePath, `licenseHash=${licenseHash} licenseHashSource=${licenseHashSource} actual=${actualLicenseHash}`)

  // A11: the upstream terms must not claim MIT. Case-sensitive on purpose: the
  // word "Limitations" contains a lowercase "mit".
  if (licenseText.includes('MIT')) fail('A11', licensePath, 'contains the uppercase substring "MIT"; the upstream terms are SUL-1.0, not MIT')
  record('A11', licensePath, 'no uppercase "MIT" substring')

  // A12: the modification notice carries every claim the license relies on.
  const missingNoticeStrings = NOTICE_STRINGS.filter((needle) => !noticeText.includes(needle))
  if (missingNoticeStrings.length !== 0) fail('A12', NOTICE, `missing: ${missingNoticeStrings.join(', ')}`)
  record('A12', NOTICE, `${NOTICE_STRINGS.length - missingNoticeStrings.length}/${NOTICE_STRINGS.length} required strings present`)

  // A13: the scope mapping covers every tracked path, exactly once.
  const tracked = trackedPaths()
  const scopeBlocks = SCOPE_MARKERS.map(([id, marker]) => ({ id, marker, entries: scopeEntries(noticeText, marker) }))
  const licenseTexts = ['LICENSE-MIT.md', 'LICENSE-SUL-1.0.md']
  for (const path of tracked) {
    if (licenseTexts.includes(path)) continue
    const matched = scopeBlocks.filter((block) => block.entries.some((entry) => entryMatches(entry, path)))
    if (matched.length !== 1) {
      fail(
        'A13',
        path,
        matched.length === 0
          ? 'matches no scope block in NOTICE.md'
          : `matches ${matched.length} scope blocks (${matched.map((block) => block.id).join(', ')}), expected exactly one`,
      )
    }
  }
  record('A13', NOTICE, `${tracked.length} tracked path(s) classified against ${scopeBlocks.length} block(s)`)

  // A14: no machine path in any tracked file, including this one, except at the
  // enumerated tolerated positions. Three things are asserted, so the gate is
  // visible rather than vacuous: the allowlist has exactly the expected size, every
  // allowlist entry actually matches at its stated path and line (a stale entry
  // fails), and no other match exists anywhere in the tracked set.
  if (MACHINE_PATH_ALLOWLIST.length !== MACHINE_PATH_ALLOWLIST_SIZE) {
    fail('A14', join(ROOT, 'tools', 'check-package.mjs'), `the tolerated-position list has ${MACHINE_PATH_ALLOWLIST.length} entries, expected ${MACHINE_PATH_ALLOWLIST_SIZE}`)
  }
  const tolerated = new Set(MACHINE_PATH_ALLOWLIST.map((entry) => `${entry.path}:${entry.line}`))
  const toleratedSeen = new Set()
  let machinePathMatches = 0
  for (const path of tracked) {
    const lines = readText(path).split('\n')
    lines.forEach((line, index) => {
      if (!lineHasMachinePath(line)) return
      machinePathMatches += 1
      const key = `${path}:${index + 1}`
      if (tolerated.has(key)) {
        toleratedSeen.add(key)
        return
      }
      fail('A14', path, `line ${index + 1} carries a machine path: ${line.trim()}`)
    })
  }
  for (const entry of MACHINE_PATH_ALLOWLIST) {
    const key = `${entry.path}:${entry.line}`
    if (!toleratedSeen.has(key)) {
      fail('A14', join(ROOT, entry.path), `the tolerated-position list entry for line ${entry.line} (${entry.reason}) no longer matches; the list is stale and must be revisited`)
    }
  }
  record('A14', ROOT, `${tracked.length} tracked file(s) scanned, ${machinePathMatches} machine-path match(es), ${MACHINE_PATH_ALLOWLIST.length} tolerated position(s), ${MACHINE_PATH_ALLOWLIST.length - toleratedSeen.size} stale entr(ies)`)
  record('A14-allowlist', join(ROOT, 'tools', 'check-package.mjs'), `size=${MACHINE_PATH_ALLOWLIST.length} matched=${toleratedSeen.size} tolerated=${[...tolerated].join(', ')}`)

  // A15: the @local/ classes partition the tracked set. Assignment is first-match
  // over a priority-ordered list, so a path cannot land in two classes and cannot
  // land in none.
  const localCounts = {}
  for (const path of tracked) {
    const klass = LOCAL_CLASSES.find((candidate) => candidate.matches(path))
    if (klass === undefined) {
      fail('A15', path, 'belongs to no @local/ class, which means the class list no longer covers the tracked set')
      continue
    }
    const count = countOf(readText(path), '@local/')
    if (localCounts[klass.id] === undefined) localCounts[klass.id] = {}
    localCounts[klass.id][path] = count
    if (klass.expect !== null && count !== klass.expect) {
      fail('A15', path, `class ${klass.id} expects ${klass.expect} "@local/" occurrence(s) (${klass.description}), found ${count}`)
    }
  }
  const portPatchPath = 'tools/port-patch.mjs'
  const portPatchCount = localCounts['catch-all']?.[portPatchPath]
  if (portPatchCount === undefined) fail('A15', join(ROOT, portPatchPath), 'is not in the catch-all class')
  else if (portPatchCount < 1) fail('A15', join(ROOT, portPatchPath), `carries ${portPatchCount} "@local/" occurrence(s); the port tool must name the pre-port package at least once`)
  record('A15', ROOT, `${tracked.length} tracked path(s) partitioned into ${LOCAL_CLASSES.length} classes`)

  // A16: the patch's shape, counted as substrings because the rows are indented.
  const patchLines = patchText.split('\n').length - (patchText.endsWith('\n') ? 1 : 0)
  if (patchLines !== 540) fail('A16', PATCH, `has ${patchLines} lines, expected 540`)
  const idRows = countOf(patchText, '- id:')
  if (idRows !== 40) fail('A16', PATCH, `has ${idRows} "- id:" occurrences, expected 40 (counted as a substring: the rows are indented, so an anchored pattern reports 0)`)
  record('A16', PATCH, `${patchLines} line(s), ${idRows} "- id:" occurrence(s)`)

  if (failures.length !== 0) {
    process.stderr.write(`check-package: ${failures.length} assertion failure(s):\n  - ${failures.join('\n  - ')}\n`)
    process.exitCode = 1
    return
  }

  const report = {
    verdict: 'OK',
    checks,
    personaAnchors,
    selfReferences,
    personas,
    license: manifest.license,
    licenseHash,
    licenseHashSource,
    localCounts,
  }
  if (!quiet) process.stdout.write(JSON.stringify(report, null, 2) + '\n')
}

/**
 * Run only when this module is the process entry point.
 *
 * Without this guard, importing the module — which the unit tests do, to reach
 * `parseArgs` — would also run the whole check and print its report during the
 * test run. The tool's behaviour when it is actually executed is unchanged; only
 * the import path is quietened.
 */
const isEntryPoint = () => process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href

if (isEntryPoint()) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`check-package: ${error.message}\n`)
    process.exitCode = 1
  }
}
