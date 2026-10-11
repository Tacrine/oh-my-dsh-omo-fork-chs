/**
 * The inverse rewrites, exercised through the shared rules module.
 *
 * The inverse direction is what makes `baseline/cordis.patch.yml` derivable rather
 * than transcribed, and it is checked two ways here: the counts, and the round trip
 * itself. The round trip is the load-bearing assertion, because a slip in the
 * inverse patterns would still produce plausible-looking counts while changing the
 * text. The rules module also self-checks the round trip internally; this file
 * asserts the same property from the outside.
 *
 * This file deliberately embeds the pre-port package literal, for the same reason
 * the forward test does: the inverse exists to rebuild that literal, so a test that
 * avoided it could not test the inverse.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { applyRewrites, applyInverseRewrites, baselineProblems, LOCAL_PACKAGE, personaExpression } from '../tools/lib/rewrites.mjs'

const PACKAGE = '@tacrine_f/oh-my-dsh-omo-fork-chs'

/** The nine persona files, in the order the source patch lists them. */
const PERSONA_FILES = [
  'explore.md',
  'librarian.md',
  'oracle.md',
  'momus.md',
  'multimodal-looker.md',
  'sisyphus-junior.md',
  'metis.md',
  'hephaestus.md',
  'sisyphus.md',
]

/** A persona anchor in its pre-port shape, for one persona file. */
const localAnchor = (file) =>
  "process.getBuiltinModule('node:url').fileURLToPath(" +
  `new URL('./node_modules/${LOCAL_PACKAGE}/personas/${file}', baseUrl))`

/** A minimal pre-port patch carrying all three rewrite sites. */
function minimalPatch() {
  return [
    `# anchored on ${LOCAL_PACKAGE} before the port`,
    `- insert:`,
    `    - id: preset-omo-fork-chs`,
    `      config:`,
    `        plugins:`,
    `          - id: persona-plugin`,
    `            name: '${LOCAL_PACKAGE}/persona'`,
    ...PERSONA_FILES.map((file) => `          - id: row-${file}\n            persona: !!js process.getBuiltinModule('node:fs').readFileSync(${localAnchor(file)}, 'utf8')`),
    '',
  ].join('\n')
}

test('the inverse rewrite groups count exactly 1 / 9 / 1', () => {
  const ported = applyRewrites(minimalPatch(), PACKAGE)
  const inverse = applyInverseRewrites(ported.text, PACKAGE)
  assert.deepEqual(inverse.counts, { name: 1, persona: 9, comment: 1 })
})

test('forward then inverse returns the original text exactly', () => {
  const original = minimalPatch()
  const ported = applyRewrites(original, PACKAGE)
  const inverse = applyInverseRewrites(ported.text, PACKAGE)
  assert.equal(inverse.text, original)
})

test('inverse then forward returns the ported text exactly', () => {
  const original = minimalPatch()
  const ported = applyRewrites(original, PACKAGE).text
  const inverse = applyInverseRewrites(ported, PACKAGE)
  const forwardAgain = applyRewrites(inverse.text, PACKAGE).text
  assert.equal(forwardAgain, ported)
})

test('the derived baseline satisfies the baseline invariants', () => {
  const ported = applyRewrites(minimalPatch(), PACKAGE)
  const inverse = applyInverseRewrites(ported.text, PACKAGE)
  assert.deepEqual(baselineProblems(inverse.text, inverse.counts), [])
})

test('the derived baseline carries eleven pre-port occurrences', () => {
  const ported = applyRewrites(minimalPatch(), PACKAGE)
  const inverse = applyInverseRewrites(ported.text, PACKAGE)
  assert.equal(inverse.text.split(LOCAL_PACKAGE).length - 1, 11)
  assert.equal(inverse.text.split(`'./node_modules/${LOCAL_PACKAGE}/personas/`).length - 1, 9)
  assert.equal(inverse.text.split(`name: '${LOCAL_PACKAGE}/persona'`).length - 1, 1)
})

test('the inverse rebuilds the pre-port expression, not a paraphrase', () => {
  const ported = applyRewrites(minimalPatch(), PACKAGE)
  const inverse = applyInverseRewrites(ported.text, PACKAGE)
  for (const file of PERSONA_FILES) {
    assert.ok(inverse.text.includes(localAnchor(file)), `the inverse must rebuild the pre-port anchor for ${file}`)
    assert.ok(!inverse.text.includes(personaExpression(PACKAGE, file)), `the ported expression for ${file} must be gone`)
  }
})

test('a ported patch that lost an anchor inverts to a baseline that fails the invariants', () => {
  const ported = applyRewrites(minimalPatch(), PACKAGE)
  const damaged = ported.text.replace(personaExpression(PACKAGE, 'metis.md'), 'aDifferentExpression')
  const inverse = applyInverseRewrites(damaged, PACKAGE)
  assert.equal(inverse.counts.persona, 8)
  const problems = baselineProblems(inverse.text, inverse.counts)
  assert.ok(problems.length > 0, 'a short inverse must be reported, not silently accepted')
})
