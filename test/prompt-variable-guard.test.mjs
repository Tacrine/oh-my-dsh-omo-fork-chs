/**
 * The prompt-variable guard, asserted from both sides.
 *
 * `dsh` interpolates exactly two prompt variables for a persona section — `provider` and
 * `model`, registered by the agent loop — and it validates the *written* text before it looks
 * anything up. Two different failures come out of that, and a guard that knows about only one of
 * them reports the wrong thing:
 *
 *   - `unknown prompt variable "{{name}}"` — the name is well formed but nothing registered it.
 *     This is the shipped 0.2.2 bug: the persona suffix carried `{{cwd}}`, and a session died at
 *     prompt assembly while every structural gate stayed green.
 *   - `malformed prompt variable reference "{{name}}"` — the text between the braces is not a
 *     variable name at all, so the name is never looked up.
 *
 * The grammar here is the runtime's own (`dsh-system-prompt`): `VARIABLE_NAME` is
 * `/^[a-z][a-z0-9_]*$/`, a group is `/^\{\{([^{}]*)\}\}/`, and the name is the inner text taken
 * **without trimming**. Two consequences are easy to get backwards, so they are pinned as tests:
 *
 *   - `{{ provider }}` is **malformed**, not registered — the spaces are part of the name.
 *   - `{{1abc}}`, `{{a.b}}`, `{{a-b}}` and `{{CWD}}` are malformed, not merely unregistered; a
 *     name outside the grammar never reaches the registry.
 *
 * A config dump cannot see any of this: it composes the tree without interpolating, so it reports
 * success on a preset that cannot boot a session.
 *
 * Every assertion below is paired with a case that fails, because a scan over zero matches would
 * otherwise pass for the wrong reason. Fixtures are built by substitution into the real patch, so
 * this file cannot drift away from the text it guards.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

/** The runtime's variable-name grammar, copied from `dsh-system-prompt`. */
const VARIABLE_NAME = /^[a-z][a-z0-9_]*$/

/** One complete reference group at the scan position; the inner text is captured untrimmed. */
const REFERENCE_AT = /^\{\{([^{}]*)\}\}/

/** The prompt variables `dsh` actually registers for a persona section. */
export const REGISTERED_PROMPT_VARIABLES = new Set(['provider', 'model'])

/**
 * Walk the text exactly the way the runtime walks it.
 *
 * Not one flat regular expression on purpose: the runtime steps through `{{` positions and decides
 * per position whether a complete `{{name}}` group starts there, so an unbalanced or nested `{{`
 * is a *malformed reference*, not text to skip.
 *
 * @param text - the text to scan.
 * @param visit - called with the inner text of every complete group, untrimmed.
 */
function scanReferences(text, visit) {
  let last = 0
  for (let open = text.indexOf('{{'); open >= 0; open = text.indexOf('{{', last)) {
    const group = REFERENCE_AT.exec(text.slice(open))

    if (group === null) {
      // No complete group starts here. A lone `{{` is harmless text, but the runtime throws as
      // soon as a closing `}}` exists further on: the author meant a reference and wrote one that
      // cannot be parsed as such.
      if (text.indexOf('}}', open + 2) >= 0) {
        visit({ literal: false, snippet: text.slice(open, open + 16), name: null })
      }
      last = open + 2
      continue
    }

    // The runtime takes the inner text as written: `group.slice(2, -2)`, no trimming.
    visit({ literal: true, snippet: group[0], name: group[0].slice(2, -2) })
    last = open + group[0].length
  }
}

/**
 * Every well-formed variable name in the text, in order, duplicates included. The caller needs the
 * raw list to prove a scan found something at all.
 *
 * Malformed references contribute nothing here by definition — their inner text is not a name.
 *
 * @param text - the text to scan.
 * @returns the well-formed names, in order of appearance.
 */
export function promptVariables(text) {
  const names = []
  scanReferences(text, ({ literal, name }) => {
    if (literal && VARIABLE_NAME.test(name)) names.push(name)
  })
  return names
}

/**
 * Scan a text and separate the two failure classes the runtime distinguishes.
 *
 * @param text - the text to scan.
 * @param allowed - the names the runtime registers.
 * @returns the malformed references and the well-formed but unregistered names, each deduplicated
 *   in order of first appearance. Both must be empty for a shipped preset.
 */
export function inspectPromptVariables(text, allowed) {
  const malformed = []
  const unknown = []
  const seenMalformed = new Set()
  const seenUnknown = new Set()

  scanReferences(text, ({ literal, snippet, name }) => {
    if (!literal) {
      if (!seenMalformed.has(snippet)) {
        seenMalformed.add(snippet)
        malformed.push(snippet)
      }
      return
    }
    if (!VARIABLE_NAME.test(name)) {
      if (!seenMalformed.has(name)) {
        seenMalformed.add(name)
        malformed.push(name)
      }
      return
    }
    if (!allowed.has(name) && !seenUnknown.has(name)) {
      seenUnknown.add(name)
      unknown.push(name)
    }
  })

  return { malformed, unknown }
}

/**
 * The unregistered names only. Kept as its own export because it is the class the 0.2.2 release
 * got wrong, and a caller may care about that one without caring about the grammar.
 *
 * @param text - the text to scan.
 * @param allowed - the names the runtime registers.
 * @returns the well-formed but unregistered names, in order of first appearance.
 */
export function unknownPromptVariables(text, allowed) {
  return inspectPromptVariables(text, allowed).unknown
}

/** The two shipped preset texts this guard covers. */
const PATCHES = [
  { label: 'cordis.patch.yml', url: new URL('../cordis.patch.yml', import.meta.url) },
  {
    label: 'baseline/cordis.patch.yml',
    url: new URL('../baseline/cordis.patch.yml', import.meta.url),
  },
]

test('both shipped preset texts are clean on both failure classes', () => {
  for (const patch of PATCHES) {
    const text = readFileSync(patch.url, 'utf8')

    // Positive control: a scan that matched nothing would satisfy the assertion below without
    // proving anything, so require that this text does name the variables it is allowed to name.
    const names = promptVariables(text)
    assert.ok(
      names.length > 0,
      `${patch.label}: found no well-formed {{variable}} at all, so the assertion below would be vacuous`,
    )

    const { malformed, unknown } = inspectPromptVariables(text, REGISTERED_PROMPT_VARIABLES)
    assert.deepEqual(malformed, [], `${patch.label}: malformed prompt variable references`)
    assert.deepEqual(unknown, [], `${patch.label}: unregistered prompt variables`)

    for (const name of names) {
      assert.ok(
        REGISTERED_PROMPT_VARIABLES.has(name),
        `${patch.label}: names {{${name}}}, which is not a registered prompt variable`,
      )
    }
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
// shipped bug, so the red side is exercised against the shape that actually broke.

test('renaming a registered variable to an unregistered one is reported as unknown', () => {
  const text = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.ok(text.includes('{{model}}'), 'the fixture needs a {{model}} occurrence to rename')

  const { malformed, unknown } = inspectPromptVariables(
    text.replaceAll('{{model}}', '{{cwd}}'),
    REGISTERED_PROMPT_VARIABLES,
  )
  assert.deepEqual(malformed, [])
  assert.deepEqual(
    unknown,
    ['cwd'],
    'a rename to {{cwd}} must be reported, exactly as the 0.2.2 release was',
  )
})

test('injecting a variable into a suffix row is reported as unknown', () => {
  const text = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const lines = text.split('\n')
  const index = lines.findIndex((line) => line.trim().startsWith('suffix:'))
  assert.notEqual(index, -1, 'the fixture needs a `suffix:` row to inject into')

  lines[index] = `${lines[index]} {{cwd}}`

  assert.deepEqual(
    unknownPromptVariables(lines.join('\n'), REGISTERED_PROMPT_VARIABLES),
    ['cwd'],
    'a variable in the suffix value is the exact shipped failure and must be reported',
  )
})

// ── The grammar: what the runtime calls malformed ──────────────────────────────────────────

test('a padded name is malformed, because the runtime does not trim it', () => {
  // `{{ provider }}` looks innocuous and is a hard failure at prompt assembly: the name is
  // " provider ", spaces included, so it never matches the grammar and is never looked up.
  for (const text of ['{{ provider }}', '{{provider }}', '{{ provider}}', '{{\tmodel\t}}']) {
    const { malformed, unknown } = inspectPromptVariables(text, REGISTERED_PROMPT_VARIABLES)
    assert.equal(malformed.length, 1, `expected one malformed reference in ${JSON.stringify(text)}`)
    assert.deepEqual(unknown, [], 'a malformed name must not be reported as merely unregistered')
  }
})

test('names outside the lowercase grammar are malformed, not unregistered', () => {
  for (const name of ['1abc', 'a.b', 'a-b', 'CWD', 'a b', 'a$b', 'ünïcode']) {
    const { malformed, unknown } = inspectPromptVariables(`{{${name}}}`, REGISTERED_PROMPT_VARIABLES)
    assert.deepEqual(malformed, [name], `{{${name}}} must be malformed`)
    assert.deepEqual(unknown, [], `{{${name}}} must not be reported as unregistered`)
  }
})

test('a nested or unbalanced brace group is malformed', () => {
  // The runtime reports "references are complete simple {{name}} groups" rather than skipping it,
  // so the guard must not treat it as plain text either.
  for (const text of ['{{{x}}}', '{{{{model}}}}', '{{a{{b}}']) {
    const { malformed } = inspectPromptVariables(text, REGISTERED_PROMPT_VARIABLES)
    assert.ok(malformed.length > 0, `expected a malformed report for ${JSON.stringify(text)}`)
  }
})

test('a reference split across lines is malformed, not ignored', () => {
  const { malformed, unknown } = inspectPromptVariables('{{\ncwd\n}}', REGISTERED_PROMPT_VARIABLES)
  assert.equal(malformed.length, 1)
  assert.deepEqual(unknown, [])
})

test('a lone {{ with no closing braces is text, not a failure', () => {
  // The runtime emits the literal and moves on: nothing to assemble, nothing to fix.
  const { malformed, unknown } = inspectPromptVariables(
    'costs {{ less than it looks',
    REGISTERED_PROMPT_VARIABLES,
  )
  assert.deepEqual(malformed, [])
  assert.deepEqual(unknown, [])
})

test('a well-formed name that nothing registered is unknown, not malformed', () => {
  const { malformed, unknown } = inspectPromptVariables('{{cwd}}', REGISTERED_PROMPT_VARIABLES)
  assert.deepEqual(malformed, [])
  assert.deepEqual(unknown, ['cwd'])
})

test('repeated reports are deduplicated in order of first appearance', () => {
  const { malformed, unknown } = inspectPromptVariables(
    'a {{cwd}} b {{team}} c {{cwd}} d {{team}} e {{model}} f {{1bad}} g {{1bad}}',
    REGISTERED_PROMPT_VARIABLES,
  )
  assert.deepEqual(unknown, ['cwd', 'team'])
  assert.deepEqual(malformed, ['1bad'])
})

test('a name is matched as a whole identifier, not as a prefix of a longer name', () => {
  // `model_foo` is not `model`; treating a prefix as registered would hide a typo. And
  // `modelFoo` is not even a legal name — the uppercase letter makes it malformed, not aliased.
  assert.deepEqual(unknownPromptVariables('{{model_foo}}', REGISTERED_PROMPT_VARIABLES), [
    'model_foo',
  ])
  assert.deepEqual(unknownPromptVariables('{{provider_extra}}', REGISTERED_PROMPT_VARIABLES), [
    'provider_extra',
  ])
  assert.deepEqual(inspectPromptVariables('{{modelFoo}}', REGISTERED_PROMPT_VARIABLES), {
    malformed: ['modelFoo'],
    unknown: [],
  })
})