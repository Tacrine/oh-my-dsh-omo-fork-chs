/**
 * The zero-byte guard.
 *
 * The verifier refuses to compare against a file whose bytes are all zero, because
 * such a file is a corruption rather than a difference and reporting it as a
 * mismatch would send a reader looking for a content bug that is not there. That
 * guard exists because a real machine-local preset directory on the machine this
 * fork was prepared on is corrupted in exactly that way, which is why this
 * repository's verification chain does not depend on that directory at all.
 *
 * The fixture is synthesized here rather than pointed at that directory, so the
 * test names no machine path and stays meaningful on any machine. It is written
 * **outside the repository**, under the system temporary directory, and removed by
 * the test itself: a fixture inside a directory that `files[]` lists would be
 * shipped by `npm pack`, which is exactly what the package check now refuses.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const TOOL = join(ROOT, 'tools', 'verify-patch.mjs')
// A directory of this file's own, created by `mkdtempSync` so that no other test
// file can delete it. `node --test` runs each file in its own process,
// concurrently, so a *shared* parent that both files removed in `after()` coupled
// two running processes: whichever finished first could remove a directory the
// other was still writing fixtures into, and the sibling's next `writeFileSync`
// then raised ENOENT. A private directory makes that interleaving impossible
// rather than merely unlikely.
const TMP = mkdtempSync(join(tmpdir(), 'omo-chs-qa-zero-byte-'))
const FIXTURE = join(TMP, 'all-nul.patch.yml')

/** Run the verifier with `--legacy` pointed at the given file. */
function runVerify(legacyPath) {
  try {
    const stdout = execFileSync(process.execPath, [TOOL, '--legacy', legacyPath], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { status: 0, stdout, stderr: '' }
  } catch (error) {
    return { status: error.status ?? 1, stdout: error.stdout ?? '', stderr: error.stderr ?? String(error.message) }
  }
}

test.after(() => {
  // The directory is this file's own, so removing it is the whole cleanup: there is
  // no shared parent to hand back and nothing outside this path to touch.
  rmSync(TMP, { recursive: true, force: true })
})

test('an all-NUL input is reported as corruption, with a non-zero exit', () => {
  mkdirSync(TMP, { recursive: true })
  try {
    // 4096 bytes, every one of them zero: a plausible size, no content.
    writeFileSync(FIXTURE, Buffer.alloc(4096, 0))
    assert.ok(existsSync(FIXTURE), 'the fixture must exist before the run')

    const result = runVerify(FIXTURE)

    assert.notEqual(result.status, 0, 'the verifier must exit non-zero on a corrupted input')
    assert.match(result.stderr, /is corrupted/)
    assert.match(result.stderr, /non-zero/)
    assert.match(result.stderr, /all-nul\.patch\.yml/, 'the message must name the offending file')
    assert.doesNotMatch(result.stdout, /DIFFERS/, 'a corruption must never be reported as a content difference')
  } finally {
    rmSync(FIXTURE, { force: true })
  }
})

test('an empty input is reported as empty, with a non-zero exit', () => {
  const empty = join(TMP, 'empty.patch.yml')
  mkdirSync(TMP, { recursive: true })
  try {
    writeFileSync(empty, '')
    const result = runVerify(empty)
    assert.notEqual(result.status, 0, 'the verifier must exit non-zero on an empty input')
    assert.match(result.stderr, /is empty/)
  } finally {
    rmSync(empty, { force: true })
  }
})

test('the fixture directory is left empty afterwards', () => {
  const leftovers = existsSync(TMP) ? readdirSync(TMP) : []
  assert.deepEqual(leftovers, [], 'the zero-byte guard test must clean up after itself')
})
