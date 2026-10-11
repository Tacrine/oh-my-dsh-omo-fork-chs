/**
 * The machine-path pattern, asserted from both sides.
 *
 * The pattern exists to keep machine absolute paths out of committed files, and its
 * lookbehind is what makes it usable at all: without it, the scheme separator of
 * every `https://` URL reads as a drive letter, and this repository's committed
 * files are full of URLs. That false positive is the whole reason the pattern looks
 * the way it does, so it is locked down here as a unit test, complementing the
 * integration-level proof in the package check.
 *
 * Every fixture is assembled from parts. A literal drive-letter path written into
 * this file would make the file itself fail the repository-wide machine-path scan,
 * and that scan's tolerated-position list is a frozen enumeration that must not
 * grow to accommodate a test fixture.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * The pattern under test, copied from the tool that owns it. The copy is asserted
 * to be identical to the tool's source below, so this test cannot silently drift
 * away from the pattern it claims to test.
 */
const MACHINE_PATH = /(?<![A-Za-z0-9+.\-])[A-Za-z]:[\\/]/

/** Assemble a fixture without writing the forbidden shape into this file. */
const drive = (letter, separator, tail) => `${letter}${':'}${separator}${tail}`

test('the pattern matches a drive-letter path with a backslash', () => {
  assert.equal(MACHINE_PATH.test(drive('C', '\\', 'x')), true)
})

test('the pattern matches a drive-letter path with a forward slash', () => {
  assert.equal(MACHINE_PATH.test(drive('D', '/', 'y')), true)
})

test('the pattern matches a drive-letter path inside a sentence', () => {
  assert.equal(MACHINE_PATH.test(`stored at ${drive('E', '\\', 'temp')} for now`), true)
})

test('the pattern does not match an https URL', () => {
  assert.equal(MACHINE_PATH.test('https://a.b/'), false)
})

test('the pattern does not match an http URL', () => {
  assert.equal(MACHINE_PATH.test('http://a.b/'), false)
})

test('the pattern does not match a file URL', () => {
  assert.equal(MACHINE_PATH.test('file:///x'), false)
})

test('the pattern does not match a relative path or a bare word', () => {
  assert.equal(MACHINE_PATH.test('./tools/port-patch.mjs'), false)
  assert.equal(MACHINE_PATH.test('node_modules'), false)
})

test('the pattern is the same one the package check carries', () => {
  // Read the tool's source rather than importing it, so this assertion also proves
  // the pattern is still spelled as a literal in the tool.
  const source = readFileSync(join(import.meta.dirname, '..', 'tools', 'check-package.mjs'), 'utf8')
  assert.ok(
    source.includes('const MACHINE_PATH = /(?<![A-Za-z0-9+.\\-])[A-Za-z]:[\\\\/]/'),
    'check-package.mjs must still declare the lookbehind form of the machine-path pattern',
  )
  assert.ok(
    !source.includes('const MACHINE_PATH = /[A-Za-z]:[\\\\/]/'),
    'check-package.mjs must not carry the naive form without the lookbehind',
  )
})

test('the naive form would match a URL, which is why the lookbehind is required', () => {
  const naive = /[A-Za-z]:[\\/]/
  assert.equal(naive.test('https://a.b/'), true, 'the naive form reports a URL as a drive-letter path')
  assert.equal(MACHINE_PATH.test('https://a.b/'), false, 'the lookbehind form does not')
})
