/**
 * The prompt-variable guard, asserted from both sides.
 *
 * `dsh` interpolates exactly two prompt variables for a persona section — `provider` and
 * `model`, registered by the agent loop. Any other `{{name}}` in a persona section is a hard
 * failure at prompt assembly, and it is a failure a config dump cannot show: the dump composes
 * the tree without interpolating, so it reports success on a preset that cannot boot a session.
 *
 * That is the bug this file exists to keep out. The shipped 0.2.2 patch put `{{cwd}}` into the
 * persona suffix and a session died with
 * `unknown prompt variable "{{cwd}}" in section "deployment:persona-suffix"`, while every
 * structural check stayed green.
 *
 * The guard is a pure function so it can be exercised on arbitrary text, and each assertion
 * below is paired with a case that makes it fail, because a scan over zero matches would
 * otherwise pass for the wrong reason. Fixtures are built by substitution into the real patch
 * rather than written as snippets, so this file cannot drift away from the text it guards.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

/**
 * The one definition of the `{{name}}` syntax. Whitespace inside the braces is tolerated on
 * both sides, because the runtime trims a variable name before looking it up.
 */
const VARIABLE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g

/** The prompt variables `dsh` actually registers for a persona section. */
export const REGISTERED_PROMPT_VARIABLES = new Set(['provider', 'model'])

/**
 * Every variable name in a text, in the order it appears, duplicates included. The caller needs
 * the raw list to prove a scan found something at all.
 *
 * @param text - the text to scan.
 * @returns the variable names, in order of appearance.
 */
export function promptVariables(text) {
  const names = []
  for (const match of text.matchAll(VARIABLE)) names.push(match[1])
  return names
}

/**
 * The variable names in a text that no registry entry covers, deduplicated and in order of
 * first appearance. An empty array is the only acceptable answer for a shipped preset.
 *
 * @param text - the text to scan.
 * @param allowed - the names the runtime registers.
 * @returns the unregistered names, in order of first appearance.
 */
export function unknownPromptVariables(text, allowed) {
  const unknown = new Set()
  for (const match of text.matchAll(VARIABLE)) {
    if (!allowed.has(match[1])) unknown.add(match[1])
  }
  return [...unknown]
}

/** The two shipped preset texts this guard covers, plus a label for each. */
const PATCHES = [
  { label: 'cordis.patch.yml', url: new URL('../cordis.patch.yml', import.meta.url) },
  { label: 'baseline/cordis.patch.yml', url: new URL('../baseline/cordis.patch.yml', import.meta.url) },
]

test('both shipped preset texts name only registered prompt variables', () => {
  for (const patch of PATCHES) {
    const text = readFileSync(patch.url, 'utf8')

    // Positive control: a scan that matched nothing would satisfy the assertion below without
    // proving anything, so require that this text does name the variables it is allowed to name.
    const names = promptVariables(text)
    assert.ok(
      names.length > 0,
      `${patch.label}: found no {{variable}} at all, so the assertion below would be vacuous`,
    )
    for (const name of names) {
      assert.ok(
        REGISTERED_PROMPT_VARIABLES.has(name),
        `${patch.label}: names {{${name}}}, which is not a registered prompt variable`,
      )
    }

    assert.deepEqual(
      unknownPromptVariables(text, REGISTERED_PROMPT_VARIABLES),
      [],
      `${patch.label}: every prompt variable must be one the runtime registers`,
    )
  }
})

test('the live persona suffix names no variable, so the working directory is plain prose', () => {
  const text = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const suffixLines = text.split('\n').filter((line) => line.trim().startsWith('suffix:'))

  // The row must exist; a missing suffix row would make this test pass over nothing.
  assert.ok(suffixLines.length > 0, 'cordis.patch.yml carries no `suffix:` row to check')

  for (const line of suffixLines) {
    assert.deepEqual(
      promptVariables(line),
      [],
      `a persona suffix must not interpolate anything: ${line.trim()}`,
    )
  }
})

// ── The cases that must make the guard fail ────────────────────────────────────────────────
//
// Each starts from the real patch text and applies the smallest edit that reintroduces the
// shipped bug, so the red side is exercised against the shape that actually broke, not against
// a hand-written snippet.

test('renaming a registered variable to an unregistered one is reported', () => {
  const text = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.ok(text.includes('{{model}}'), 'the fixture needs a {{model}} occurrence to rename')

  const broken = text.replaceAll('{{model}}', '{{cwd}}')

  assert.deepEqual(
    unknownPromptVariables(broken, REGISTERED_PROMPT_VARIABLES),
    ['cwd'],
    'a rename to {{cwd}} must be reported, exactly as the 0.2.2 release was',
  )
})

test('injecting a variable into a suffix row is reported', () => {
  const text = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const lines = text.split('\n')
  const index = lines.findIndex((line) => line.trim().startsWith('suffix:'))
  assert.notEqual(index, -1, 'the fixture needs a `suffix:` row to inject into')

  lines[index] = `${lines[index]} {{cwd}}`
  const broken = lines.join('\n')

  assert.deepEqual(
    unknownPromptVariables(broken, REGISTERED_PROMPT_VARIABLES),
    ['cwd'],
    'a variable in the suffix value is the exact shipped failure and must be reported',
  )
})

test('a padded variable name is read the same way the runtime reads it', () => {
  assert.deepEqual(unknownPromptVariables('{{ provider }}', new Set(['provider', 'model'])), [])
  assert.deepEqual(unknownPromptVariables('{{  model  }}', new Set(['provider', 'model'])), [])
  assert.deepEqual(unknownPromptVariables('{{ cwd }}', new Set(['provider', 'model'])), ['cwd'])
})

test('repeated unregistered names are reported once, in order of first appearance', () => {
  const text = 'a {{cwd}} b {{team}} c {{cwd}} d {{team}} e {{model}}'
  assert.deepEqual(unknownPromptVariables(text, new Set(['provider', 'model'])), ['cwd', 'team'])
})

test('a name is matched on whole identifiers, not on a prefix of a longer name', () => {
  // `modelFoo` is not `model`; treating a prefix as registered would hide a typo.
  assert.deepEqual(unknownPromptVariables('{{modelFoo}}', new Set(['provider', 'model'])), ['modelFoo'])
})