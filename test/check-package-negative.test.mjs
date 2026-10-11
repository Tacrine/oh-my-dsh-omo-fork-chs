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
 * The fixtures are written under `test/.tmp/`, which is ignored, and removed
 * afterwards. Nothing here touches a tracked file.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const TOOL = join(ROOT, 'tools', 'check-package.mjs')
// A subdirectory of its own, so that test files running in parallel processes
// cannot delete each other's fixtures.
const TMP = join(import.meta.dirname, '.tmp', 'check-package')

/** SHA256 of a file's bytes, so a fixture can prove it differs from its source. */
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')

/**
 * Run the check against the given extra flags.
 * @returns `{ status, stderr }`, with the status taken from the process itself.
 */
function runCheck(extraFlags) {
  const args = [TOOL, ...extraFlags]
  try {
    const stdout = execFileSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    return { status: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? String(error.message) }
  }
}

test.before(() => {
  mkdirSync(TMP, { recursive: true })
})

test.after(() => {
  rmSync(TMP, { recursive: true, force: true })
  // Remove the shared parent too when it is empty, so `test/.tmp/` is left with
  // nothing in it. Whichever test file finishes last wins the race; the other's
  // attempt fails harmlessly because the directory is not empty yet.
  try {
    rmdirSync(join(import.meta.dirname, '.tmp'))
  } catch {
    // Still populated by a sibling test file, which will remove it in turn.
  }
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

test('the unbroken tree passes, so the negative cases above are not vacuous', () => {
  const result = runCheck([])
  assert.equal(result.status, 0, `the real tree must pass, got stderr: ${result.stderr}`)
  const report = JSON.parse(result.stdout)
  assert.equal(report.verdict, 'OK')
  assert.equal(report.licenseHash, 'skipped')
  assert.equal(report.selfReferences, 1)
  assert.equal(report.personaAnchors.length, 9)
})
