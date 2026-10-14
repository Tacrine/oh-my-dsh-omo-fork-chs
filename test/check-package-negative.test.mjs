/**
 * The package check's negative paths, run as a real process.
 *
 * These cases exist because the check's value is entirely in what it refuses. A
 * structural assertion that can only ever pass is decoration, so each case here
 * hands the tool a deliberately broken copy and asserts three things: that the
 * process really exited non-zero, that the message names the expected assertion,
 * and that the fixture actually differs from the file it was copied from. The last
 * one matters because a tamper that silently changed nothing would make the case
 * pass for the wrong reason.
 *
 * The fixtures are written **outside the repository**, under the system temporary
 * directory, and removed afterwards. Nothing here touches a tracked file, and
 * nothing here sits inside a directory that `files[]` lists either: the package
 * check now refuses to let an untracked file live under one of those, because
 * `npm pack` ships the contents of a listed directory and does not consult
 * `.gitignore`. Keeping the fixtures in `test/.tmp/` would have made the check's
 * own tree assertion fire on the test suite's scaffolding.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const TOOL = join(ROOT, 'tools', 'check-package.mjs')
// A directory of this file's own, created by `mkdtempSync` so that no other test
// file can delete it. `node --test` runs each file in its own process,
// concurrently, so a *shared* parent that both files removed in `after()` coupled
// two running processes: whichever finished first could remove a directory the
// other was still writing fixtures into, and the sibling's next `writeFileSync`
// then raised ENOENT. A private directory makes that interleaving impossible
// rather than merely unlikely.
const TMP = mkdtempSync(join(tmpdir(), 'omo-chs-qa-check-package-'))

/**
 * A private directory for the one case that needs a whole **checkout** rather than a
 * single tampered file, also created by `mkdtempSync` and removed in `after()`.
 *
 * It is separate from `TMP` because the fixture inside it is a full clone with its
 * own `.git`, and `rmSync` on the parent is the entire cleanup for both.
 */
const CLONE_DIRECTORY = mkdtempSync(join(tmpdir(), 'omo-chs-qa-check-package-clone-'))

/** SHA256 of a file's bytes, so a fixture can prove it differs from its source. */
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

/**
 * Run the check against the given extra flags.
 *
 * `env` is optional and defaults to the ambient environment. Pass it whenever a
 * case depends on the upstream-licence variables, so that the ambient
 * environment cannot decide whether the case passes: CI sets the fingerprint at
 * job level, and a case that assumed it was unset would fail there while passing
 * locally.
 *
 * `cwd` is optional and defaults to `ROOT`, so every case that inspects the real
 * repository is unaffected. Pass it when the tool to run lives somewhere else:
 * the tool derives its own root from its own location, but `trackedPaths` and
 * `isDirectory` resolve against the **process working directory**, so a tool run
 * from the wrong directory inspects the wrong tree and can report a false pass.
 * When `cwd` is given, the caller is responsible for pointing `tool` at the copy.
 *
 * @returns `{ status, stdout, stderr }`, with the status taken from the process itself.
 */
function runCheck(extraFlags, env, { cwd = ROOT, tool = TOOL } = {}) {
  const args = [tool, ...extraFlags]
  const options = { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  if (env !== undefined) options.env = env
  try {
    const stdout = execFileSync(process.execPath, args, options)
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    return { status: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? String(error.message) }
  }
}

/** The ambient environment with both upstream-licence variables removed. */
function envWithoutUpstreamLicense() {
  const env = { ...process.env }
  delete env.OMO_UPSTREAM_LICENSE
  delete env.OMO_UPSTREAM_LICENSE_SHA256
  return env
}

test.before(() => {
  mkdirSync(TMP, { recursive: true })
})

test.after(() => {
  // The directories are this file's own, so removing them is the whole cleanup:
  // there is no shared parent to hand back and nothing outside these paths to touch.
  rmSync(TMP, { recursive: true, force: true })
  rmSync(CLONE_DIRECTORY, { recursive: true, force: true })
})

test('a patch whose anchor names a missing persona file fails, naming that file', () => {
  const source = join(ROOT, 'cordis.patch.yml')
  const fixture = join(TMP, 'cordis.patch.yml')
  const text = readFileSync(source, 'utf8')
  const tampered = text.replace("'personas', 'explore.md'", "'personas', 'explore-x.md'")
  assert.notEqual(tampered, text, 'the fixture must actually differ from the real patch')
  writeFileSync(fixture, tampered)

  const result = runCheck(['--patch', fixture])
  assert.notEqual(result.status, 0, 'the check must exit non-zero')
  assert.match(result.stderr, /A4/)
  assert.match(result.stderr, /explore-x\.md/)
  assert.match(result.stderr, /does not exist/)
})

test('a manifest that dropped the "./package.json" export fails, naming that export', () => {
  const source = join(ROOT, 'package.json')
  const fixture = join(TMP, 'package.json')
  const manifest = JSON.parse(readFileSync(source, 'utf8'))
  const before = sha256(source)
  delete manifest.exports['./package.json']
  writeFileSync(fixture, JSON.stringify(manifest, null, 2) + '\n')
  assert.notEqual(sha256(fixture), before, 'the fixture must actually differ from the real manifest')

  const result = runCheck(['--manifest', fixture])
  assert.notEqual(result.status, 0, 'the check must exit non-zero')
  assert.match(result.stderr, /A2/)
  assert.match(result.stderr, /exports\["\.\/package\.json"\]/)
  assert.match(result.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED/)
})

test('a manifest carrying a bare LICENSE in files[] fails', () => {
  const source = join(ROOT, 'package.json')
  const fixture = join(TMP, 'package-license.json')
  const manifest = JSON.parse(readFileSync(source, 'utf8'))
  const before = sha256(source)
  manifest.files = [...manifest.files, 'LICENSE']
  writeFileSync(fixture, JSON.stringify(manifest, null, 2) + '\n')
  assert.notEqual(sha256(fixture), before, 'the fixture must actually differ from the real manifest')

  const result = runCheck(['--manifest', fixture])
  assert.notEqual(result.status, 0, 'the check must exit non-zero')
  assert.match(result.stderr, /A5/)
  assert.match(result.stderr, /bare "LICENSE"/)
})

test('a manifest whose name drifted fails', () => {
  const source = join(ROOT, 'package.json')
  const fixture = join(TMP, 'package-name.json')
  const manifest = JSON.parse(readFileSync(source, 'utf8'))
  const before = sha256(source)
  manifest.name = 'some-other-name'
  writeFileSync(fixture, JSON.stringify(manifest, null, 2) + '\n')
  assert.notEqual(sha256(fixture), before, 'the fixture must actually differ from the real manifest')

  const result = runCheck(['--manifest', fixture])
  assert.notEqual(result.status, 0, 'the check must exit non-zero')
  assert.match(result.stderr, /A1/)
  assert.match(result.stderr, /some-other-name/)
})

test('a NOTICE.md that lost a required claim fails', () => {
  const source = join(ROOT, 'NOTICE.md')
  const fixture = join(TMP, 'NOTICE.md')
  const text = readFileSync(source, 'utf8')
  // `replaceAll`, not `replace`: the notice mentions the section name in its own
  // cross-reference as well as in the heading, so a single replacement would leave
  // the required string in place and the case would pass for the wrong reason.
  const tampered = text.replaceAll('## Modifications', '## Changes')
  assert.notEqual(tampered, text, 'the fixture must actually differ from the real notice')
  assert.equal(tampered.includes('## Modifications'), false, 'the fixture must lose every occurrence, or the case proves nothing')
  writeFileSync(fixture, tampered)

  const result = runCheck(['--notice', fixture])
  assert.notEqual(result.status, 0, 'the check must exit non-zero')
  assert.match(result.stderr, /A12/)
  assert.match(result.stderr, /## Modifications/)
})

test('a fingerprint that is not 64 hex characters is a hard error, never a skip', () => {
  const args = [TOOL]
  let status = 0
  let stderr = ''
  try {
    execFileSync(process.execPath, args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, OMO_UPSTREAM_LICENSE_SHA256: 'not-a-fingerprint' },
    })
  } catch (error) {
    status = error.status ?? 1
    stderr = error.stderr ?? ''
  }
  assert.notEqual(status, 0, 'a malformed fingerprint must not be skipped silently')
  assert.match(stderr, /64-character hex fingerprint/)
})

test('a files[] directory that no longer exists fails, naming that directory', () => {
  // This is the one case that needs a whole checkout rather than a tampered file,
  // because A19 asks whether a `files[]` entry resolves to anything in the tracked
  // set and on disk. The fixture is a real `git clone` into a private temp
  // directory, and the clone **keeps `.git`**: a copy made without it, by
  // `git archive` for instance, makes the tool exit 1 for an unrelated reason
  // (`cannot list the untracked files under personas/: run inside a git checkout`),
  // so a case asserting only "non-zero exit" could pass while A19 stayed inert.
  // That is also why the assertions below pin the message text and the directory
  // name rather than the exit code alone.
  const clone = join(CLONE_DIRECTORY, 'repo')
  execFileSync('git', ['clone', '--quiet', ROOT, clone], { stdio: 'ignore' })

  // The clone's tool is the file under test. It is copied rather than taken from the
  // clone's own checkout because a clone carries only committed content, and the
  // working-tree tool may be newer than the last commit. Copying the committed file
  // would make this case pass while the working-tree change was inert.
  const cloneTool = join(clone, 'tools', 'check-package.mjs')
  writeFileSync(cloneTool, readFileSync(TOOL))

  // `git rm -r` rather than a bare `rm -r`: it removes the directory from the index
  // as well as the working tree, which is the state A19 exists to catch. With the
  // index still listing the files, A14's machine-path scan reads them by name and
  // throws ENOENT, and that throw preempts the report — so A19 would never be
  // reached and this case would be measuring A14 instead.
  execFileSync('git', ['rm', '-r', '--quiet', 'test'], { cwd: clone, stdio: 'ignore' })

  // The fixture must actually be in the state the case is about, or the assertions
  // below would pass for the wrong reason.
  assert.equal(existsSync(join(clone, 'test')), false, 'the fixture must have lost the directory')
  const manifest = JSON.parse(readFileSync(join(clone, 'package.json'), 'utf8'))
  assert.ok(manifest.files.includes('test/'), 'the fixture must keep the files[] entry, or there is nothing to resolve')

  // `cwd` is the clone, and the tool is the clone's copy: the tool derives its own
  // root from its own location, but `trackedPaths` and `isDirectory` resolve against
  // the **process working directory**. Running the real tool from the real repository
  // would inspect the real tree — which is intact — and report a false pass.
  const result = runCheck([], undefined, { cwd: clone, tool: cloneTool })
  assert.notEqual(result.status, 0, 'the check must exit non-zero')
  assert.match(result.stderr, /A19/)
  assert.match(result.stderr, /"test\/"/)
  assert.match(result.stderr, /no tracked path present on disk/)

  // Coverage, stated so the gap is not mistaken for completeness. This exercises the
  // classification branch that reads `REQUIRED_FILES`/`DIRECTORY_ENTRIES` for a
  // directory the manifest spells with a slash. The third clause — `isDirectory` on
  // the path — is **unreachable through the gate as it stands**: it can only fire
  // when the directory is present, and when it is present the slash clauses already
  // classify every entry the manifest carries. It stays defensive code, and no
  // fixture here claims to cover it.
})

test('the unbroken tree passes, so the negative cases above are not vacuous', () => {
  // The upstream-licence variables are removed explicitly rather than inherited:
  // with a fingerprint in the environment the tool reports `licenseHash: "ok"`,
  // which is correct behaviour, so an inherited value would make this case pass
  // or fail for a reason that has nothing to do with the tree being unbroken.
  const clean = runCheck([], envWithoutUpstreamLicense())
  assert.equal(clean.status, 0, `the real tree must pass, got stderr: ${clean.stderr}`)
  const report = JSON.parse(clean.stdout)
  assert.equal(report.verdict, 'OK')
  assert.equal(report.licenseHash, 'skipped')
  assert.equal(report.selfReferences, 1)
  assert.equal(report.personaAnchors.length, 9)

  // The same tree and the same command, one environment variable different: the
  // only thing that changes is which route the upstream-fingerprint check took,
  // which is what makes `skipped` above a real observation rather than a
  // constant, and what proves the job-level fingerprint CI sets is exercised.
  const fingerprinted = runCheck([], { ...envWithoutUpstreamLicense(), OMO_UPSTREAM_LICENSE_SHA256: 'B61AC928F152D13517328263E6BEE9175B928F9AB696A2D2CA2B6CFD961DDC32' })
  assert.equal(fingerprinted.status, 0, `the fingerprint route must pass, got stderr: ${fingerprinted.stderr}`)
  const fingerprintedReport = JSON.parse(fingerprinted.stdout)
  assert.equal(fingerprintedReport.verdict, 'OK')
  assert.equal(fingerprintedReport.licenseHash, 'ok')
  assert.equal(fingerprintedReport.licenseHashSource, 'fingerprint')
})
