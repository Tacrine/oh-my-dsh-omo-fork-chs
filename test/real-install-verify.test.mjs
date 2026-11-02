/**
 * A real install, in an isolated home, from the configured source.
 *
 * Why this test exists:
 *
 * Every other test in this directory checks this repository as source text. None
 * of them proves the thing users actually install works. A parent that resolves
 * the published bundle can fail in ways the source cannot: a `files[]` entry that
 * ships a file at a different path, a persona anchor that points at a package
 * directory npm did not create, a preset row that never reaches the composed
 * config tree because the bundle was not registered as a profile bundle.
 *
 * What is asserted, and what is deliberately NOT asserted:
 *
 * `--dump-config` composes the config tree **without booting or evaluating
 * `!!js`**, so it performs no prompt interpolation. A dump therefore renders an
 * unregistered prompt variable exactly as it was written, and "the dump contains
 * no unknown prompt variable" would be **true no matter what the bundle ships**.
 * That is why the load-bearing assertion is not made against the dump: it is made
 * against the **installed artifact** — the `cordis.patch.yml` this run actually
 * put under the isolated profile's `node_modules`. The dump still checks the
 * things it can honestly answer: that the preset is registered, its order, its
 * nine subagent presets, and the presence of the nine persona anchors.
 *
 * The anchor check is a **substring count, not a proof that the file was read**:
 * it shows the composed tree names each persona, not that the anchor expression
 * resolves at mount time. Mounting happens in the GUI and is out of scope here;
 * the `file:` self-check case below covers the same ground for the installed
 * tree, and the negative case proves the count is not vacuous.
 *
 * Isolation:
 *
 * Each source gets its own `mkdtempSync` home so that nothing touches the
 * caller's real `DSH_HOME`, and so two sources cannot collide in a shared pnpm
 * store lock. The home is removed in `finally`, on success and on failure alike.
 *
 * Sources:
 *
 * `OMO_VERIFY_SOURCES` is a comma list, default `file`. The grammar is pinned to
 * exactly six accepted tokens — `file`, `file:`, `github`, `github#<ref>`,
 * `npm`, `npm@<version>` — and **anything else throws at load time**, before any
 * test is registered. A tolerant parser would let a typo turn the whole suite
 * into zero executed cases, which is the one failure mode a verification suite
 * must never have: it reads as green.
 *
 * The prompt-variable guard is **replicated here rather than imported**. The
 * sibling `prompt-variable-guard.test.mjs` is added by a separate change; making
 * this file import it would couple two test files' load order and break this
 * file whenever that one is absent. The semantics are identical, and the
 * acceptance for both is the same: return the names, in first-seen order, that
 * the text uses and the allowed set does not.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** This repository, one level up from `test/`. */
const ROOT = join(import.meta.dirname, '..')

/** The published package identity every assertion below is written against. */
const PACKAGE_NAME = '@tacrine_f/oh-my-dsh-omo-fork-chs'

/** The GitHub `owner/repo` the `github` sources install from. */
const GITHUB_SLUG = 'Tacrine/oh-my-dsh-omo-fork-chs'

/** The throwaway profile name; it exists only inside each isolated home. */
const PROFILE = 'verify'

/** The preset id the bundle registers, and the order it must keep. */
const PRESET_ID = 'omo-fork-chs'
const PRESET_ORDER = 11

/**
 * The one line the main preset's persona row must carry.
 *
 * This is the whole subject of the bug this suite was written after: the row used
 * to read `Your working directory is {{cwd}}.`, and `cwd` is not a registered
 * prompt variable (`provider` and `model` are the only two), so prompt assembly
 * threw once a session actually ran. The dump could never have caught it — see
 * the docblock above — so the check is made on the installed bytes.
 */
const SUFFIX_LINE = 'suffix: Your working directory is the session workspace.'

/** The nine subagent presets the bundle must register, and their persona files. */
const SUBAGENT_PRESETS = [
  'omo-explore',
  'omo-librarian',
  'omo-oracle',
  'omo-momus',
  'omo-metis',
  'omo-sisyphus-junior',
  'omo-hephaestus',
  'omo-sisyphus',
  'omo-multimodal-looker',
]
const PERSONA_FILES = [
  'explore.md',
  'librarian.md',
  'oracle.md',
  'momus.md',
  'metis.md',
  'sisyphus-junior.md',
  'hephaestus.md',
  'sisyphus.md',
  'multimodal-looker.md',
]

/** The only prompt variables the agent loop registers. */
const ALLOWED_PROMPT_VARIABLES = new Set(['provider', 'model'])

/** The token shape a prompt variable reference takes, tolerant of inner spaces. */
const PROMPT_VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/** A real install runs pnpm, which is slow on a cold cache. */
const INSTALL_TIMEOUT = 300_000

/** Set by the launcher; empty means there is no DSH to install with. */
const DSH_BIN = process.env.DSH_BIN ?? ''

/** Every occurrence of a literal substring. */
const countOf = (text, needle) => text.split(needle).length - 1

/**
 * Every occurrence of a literal, **refusing a prefix match**.
 *
 * A plain substring count is wrong for the composed tree: `agentPreset: omo-sisyphus`
 * is a prefix of `agentPreset: omo-sisyphus-junior`, so the shorter name counted two
 * rows and asserted 2 against an expected 1. That was measured on a real
 * `0.2.2-alpha.2` dump of this bundle, not inferred, and it would have turned every
 * `github`/`npm` run red for a reason that has nothing to do with the install. The
 * lookahead rejects any name character or hyphen continuing the value.
 */
const countLiteralToken = (text, literal) => text.match(new RegExp(`${literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w-])`, 'g'))?.length ?? 0

export { countLiteralToken }

/**
 * The prompt variable names `text` uses that `allowed` does not register, in
 * first-seen order. A name already reported is not repeated, so the result is a
 * set-shaped list and an assertion can compare it with `deepEqual`.
 *
 * Exported so that a fixture can be run through **the same function this file
 * asserts with**. A copy of the rule in a scratch script would only prove the
 * copy bites.
 */
export function unknownPromptVariables(text, allowed) {
  const found = []
  for (const match of text.matchAll(PROMPT_VARIABLE)) {
    if (!allowed.has(match[1]) && !found.includes(match[1])) found.push(match[1])
  }
  return found
}

/**
 * The three artifact-level facts, extracted so that the same function can be
 * pointed at a known-bad file. Extraction and assertion are split on purpose:
 * `assertInstalledPatch` failing says "the install is wrong", while
 * `inspectInstalledPatch` answering `{unknown: ['cwd']}` on a fixture says "the
 * check itself still bites".
 */
function inspectInstalledPatch(text) {
  return {
    unknown: unknownPromptVariables(text, ALLOWED_PROMPT_VARIABLES),
    cwdCount: countOf(text, '{{cwd}}'),
    suffixLines: text
      .split('\n')
      .filter((line) => line.trim().startsWith('suffix:'))
      .map((line) => line.trim()),
  }
}

export { inspectInstalledPatch }

/** Assert the artifact-level facts: no unregistered variable, no `cwd`, one exact suffix line. */
function assertInstalledPatch(text, where) {
  const { unknown, cwdCount, suffixLines } = inspectInstalledPatch(text)
  assert.deepEqual(
    unknown,
    [],
    `${where} references prompt variable(s) the agent loop never registers: ${unknown.join(', ')}. ` +
      `Only ${[...ALLOWED_PROMPT_VARIABLES].join(', ')} are registered, and prompt assembly throws on anything else`,
  )
  assert.equal(cwdCount, 0, `${where} still carries {{cwd}} ${cwdCount} time(s); the working directory is not a prompt variable`)
  assert.deepEqual(
    suffixLines,
    [SUFFIX_LINE],
    `${where} must carry exactly one suffix row, reading ${JSON.stringify(SUFFIX_LINE)}`,
  )
}

/** The version this checkout declares; read through a `URL`, because this file is an ES module. */
function declaredVersion() {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
}

/** `git rev-parse HEAD` for the bare `github` token; a caller-supplied ref wins. */
function gitHead() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/**
 * Turn one `OMO_VERIFY_SOURCES` token into an install spec.
 *
 * `file` and `file:` both mean this checkout, and the spec is the `pathToFileURL`
 * href — which **already starts with `file:`**, so prefixing it again would yield
 * `file:file:///…` and fail at pnpm, not at this check.
 *
 * Every other token must match the two families below exactly; a token outside
 * the grammar throws, which is what keeps a typo from silently verifying nothing.
 */
function resolveSource(token) {
  if (token === 'file' || token === 'file:') {
    return { token, label: 'file', spec: pathToFileURL(resolve(ROOT)).href, kind: 'file' }
  }
  if (token === 'github') {
    const ref = process.env.OMO_VERIFY_REF || process.env.OMO_VERIFY_SHA || gitHead()
    return { token, label: `github#${ref}`, spec: `github:${GITHUB_SLUG}#${ref}`, kind: 'github' }
  }
  if (token.startsWith('github#')) {
    const ref = token.slice('github#'.length).trim()
    if (ref === '') throw new Error(`OMO_VERIFY_SOURCES token ${JSON.stringify(token)} names no ref`)
    return { token, label: token, spec: `github:${GITHUB_SLUG}#${ref}`, kind: 'github' }
  }
  if (token === 'npm') {
    const version = process.env.OMO_VERIFY_VERSION || declaredVersion()
    return { token, label: `${PACKAGE_NAME}@${version}`, spec: `${PACKAGE_NAME}@${version}`, kind: 'npm' }
  }
  if (token.startsWith('npm@')) {
    const version = token.slice('npm@'.length).trim()
    if (version === '') throw new Error(`OMO_VERIFY_SOURCES token ${JSON.stringify(token)} names no version`)
    return { token, label: `${PACKAGE_NAME}@${version}`, spec: `${PACKAGE_NAME}@${version}`, kind: 'npm' }
  }
  throw new Error(
    `OMO_VERIFY_SOURCES carries an unknown token (${JSON.stringify(token)}); the accepted tokens are ` +
      'file, file:, github, github#<ref>, npm and npm@<version>',
  )
}

/**
 * The sources requested for this run. Parsed at load time **deliberately**: a
 * malformed list must fail the whole file, not degrade into zero cases.
 */
const SOURCES = (process.env.OMO_VERIFY_SOURCES ?? 'file')
  .split(',')
  .map((token) => token.trim())
  .map(resolveSource)

/** The environment every child gets: an isolated home and its own pnpm cache. */
function childEnv(home, extra) {
  return { ...process.env, DSH_HOME: home, npm_config_cache: join(home, 'npm-cache'), ...extra }
}

/**
 * Install into the isolated profile. A failure here is a **failure, not a skip**:
 * an install this suite cannot perform leaves the artifact unverified, and a skip
 * would report that as acceptable. The original stderr is quoted so the reader
 * gets the tool's own words.
 */
function installInto(home, source) {
  const extra =
    source.kind === 'github'
      ? { GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'http.sslBackend', GIT_CONFIG_VALUE_0: 'openssl' }
      : {}
  try {
    return execFileSync(process.execPath, [DSH_BIN, 'plugin', '--profile', PROFILE, 'add', '-w', source.spec], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv(home, extra),
      timeout: INSTALL_TIMEOUT,
    })
  } catch (error) {
    assert.fail(
      `installing ${source.label} failed (exit ${error.status ?? '?'}): ` +
        `${(error.stderr ?? '').toString().trim() || error.message}`,
    )
  }
}

/**
 * Compose the profile and return its stdout plus the **byte** count of its stderr.
 *
 * stderr is redirected to a file rather than piped, because `execFileSync` returns
 * only stdout on success: reading the file afterwards is what makes "stderr was
 * empty" an observation instead of an assumption.
 */
function dumpConfig(home, stderrPath) {
  const fd = openSync(stderrPath, 'w')
  try {
    const stdout = execFileSync(process.execPath, [DSH_BIN, '--profile', PROFILE, '--dump-config'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', fd],
      env: childEnv(home, {}),
      timeout: INSTALL_TIMEOUT,
    })
    return { stdout, stderrBytes: readFileSync(stderrPath).length }
  } catch (error) {
    const stderr = existsSync(stderrPath) ? readFileSync(stderrPath, 'utf8').trim() : ''
    assert.fail(`--dump-config failed (exit ${error.status ?? '?'}): ${stderr || error.message}`)
  } finally {
    closeSync(fd)
  }
}

/** The profile directory inside an isolated home. */
const profileDirOf = (home) => join(home, 'profiles', PROFILE)

/** The installed artifact whose bytes carry the load-bearing assertion. */
const installedPatchOf = (home) => join(profileDirOf(home), 'node_modules', PACKAGE_NAME, 'cordis.patch.yml')

/**
 * Register the installed package as a profile bundle.
 *
 * `dsh plugin add` installs the package but does **not** add it to
 * `dsh.profile.bundles`; only that list decides which bundles contribute preset
 * rows to the composed tree. Without this step the dump is green-and-empty, which
 * is exactly what the negative case below proves.
 */
function registerBundle(home, where) {
  const manifestPath = join(profileDirOf(home), 'package.json')
  assert.ok(
    existsSync(manifestPath),
    `${where}: the profile manifest is not where the install layout claims it should be (${manifestPath}). ` +
      `Contents of ${profileDirOf(home)}: ${existsSync(profileDirOf(home)) ? readdirSync(profileDirOf(home)).join(', ') : 'directory absent'}`,
  )
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dsh ??= {}
  manifest.dsh.profile ??= {}
  manifest.dsh.profile.bundles ??= []
  if (!manifest.dsh.profile.bundles.includes(PACKAGE_NAME)) manifest.dsh.profile.bundles.push(PACKAGE_NAME)
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

/**
 * One install, one artifact check, one positive dump and one negative dump, all
 * inside a home this function owns and removes.
 */
async function verifySource(t, source) {
  const home = mkdtempSync(join(tmpdir(), 'omo-chs-verify-'))
  const stderrPath = join(home, 'dump-stderr.log')
  try {
    installInto(home, source)

    // Negative case: installed but not registered, the dump must not name the
    // preset. This is what proves the positive dump assertion below is not
    // vacuous: the only difference between the two dumps is the bundle list.
    const beforeRegistration = dumpConfig(home, stderrPath)
    assert.equal(beforeRegistration.stderrBytes, 0, `${source.label}: the pre-registration dump wrote to stderr`)
    assert.equal(
      countLiteralToken(beforeRegistration.stdout, `id: ${PRESET_ID}`),
      0,
      `${source.label}: an unregistered bundle already contributes "id: ${PRESET_ID}", so the positive ` +
        'dump assertion would pass without the bundle being registered',
    )

    registerBundle(home, source.label)
    const afterRegistration = dumpConfig(home, stderrPath)
    assert.equal(afterRegistration.stderrBytes, 0, `${source.label}: the dump must be silent on stderr`)
    assert.equal(
      countLiteralToken(afterRegistration.stdout, `id: ${PRESET_ID}`),
      1,
      `${source.label}: the composed tree must name the preset exactly once as "id: ${PRESET_ID}"`,
    )
    assert.equal(
      countLiteralToken(afterRegistration.stdout, `order: ${PRESET_ORDER}`),
      1,
      `${source.label}: the preset must keep order ${PRESET_ORDER}`,
    )
    for (const preset of SUBAGENT_PRESETS) {
      assert.equal(
        countLiteralToken(afterRegistration.stdout, `agentPreset: ${preset}`),
        1,
        `${source.label}: the composed tree must route exactly one row to ${preset}`,
      )
    }
    // A substring count, not a read proof: it shows each persona is named in the
    // composed tree, not that its anchor expression resolves at mount time.
    for (const persona of PERSONA_FILES) {
      assert.ok(
        afterRegistration.stdout.includes(`'${persona}'`),
        `${source.label}: the composed tree never names personas/${persona}`,
      )
    }

    // The load-bearing assertion, on the bytes that were actually installed.
    const installedPatch = installedPatchOf(home)
    assert.ok(
      existsSync(installedPatch),
      `${source.label}: the installed artifact is not at ${installedPatch}. That is a layout difference in what ` +
        `the source ships, not a missing file to skip: contents of ` +
        `${join(profileDirOf(home), 'node_modules')}: ` +
        `${existsSync(join(profileDirOf(home), 'node_modules')) ? readdirSync(join(profileDirOf(home), 'node_modules')).join(', ') : 'directory absent'}`,
    )
    assertInstalledPatch(readFileSync(installedPatch, 'utf8'), `${source.label}: ${installedPatch}`)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}

/** There is no install to verify without a DSH to install with; that is the one honest skip. */
const SKIP_REASON = DSH_BIN === '' ? 'DSH_BIN not set: a real install needs a DSH bin.js path' : undefined

test(
  'a real isolated install registers the preset and ships no unregistered prompt variable',
  { skip: SKIP_REASON, timeout: INSTALL_TIMEOUT },
  async (t) => {
    const executed = []
    for (const source of SOURCES) {
      await t.test(`source ${source.label}`, { timeout: INSTALL_TIMEOUT }, async (st) => {
        executed.push(source.token)
        await verifySource(st, source)
      })
    }

    // Guards against the "zero subcases read as green" failure: the list parsed
    // to at least one source, and every requested source actually ran a case.
    assert.ok(SOURCES.length >= 1, 'OMO_VERIFY_SOURCES parsed to zero sources; nothing was verified')
    assert.deepEqual(
      executed,
      SOURCES.map((source) => source.token),
      'every requested source must produce an executed subcase, so that no request is dropped silently',
    )
  },
)