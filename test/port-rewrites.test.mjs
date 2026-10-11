/**
 * The three forward rewrites, exercised through the shared rules module.
 *
 * This file deliberately embeds the pre-port package literal. That literal is
 * exactly what the rewrites exist to remove, so a test that avoided it could not
 * test the rewrites at all. It is also why the repository's `@local/` class for
 * test sources is exempt from a count assertion while still reporting its count:
 * the literal is required here, and asserting zero would make the class
 * permanently red.
 *
 * The rules are imported from `tools/lib/rewrites.mjs` rather than re-implemented,
 * because that module is the single source of truth for both directions and
 * re-implementing them here would let the test and the tool agree on a wrong rule.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { applyRewrites, productProblems, LOCAL_PACKAGE, personaExpression } from '../tools/lib/rewrites.mjs'

const PACKAGE = '@tacrine_f/oh-my-dsh-omo-fork-chs'

/** A persona anchor in its pre-port shape, for one persona file. */
const localAnchor = (file) =>
  "process.getBuiltinModule('node:url').fileURLToPath(" +
  `new URL('./node_modules/${LOCAL_PACKAGE}/personas/${file}', baseUrl))`

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

/** A minimal patch carrying all three rewrite sites. */
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

test('the three rewrite groups count exactly 1 / 9 / 1', () => {
  const result = applyRewrites(minimalPatch(), PACKAGE)
  assert.deepEqual(result.counts, { name: 1, persona: 9, comment: 1 })
  assert.equal(result.sites.length, 11, 'the three groups touch eleven sites in total')
})

test('the persona anchors are rewritten in source order', () => {
  const result = applyRewrites(minimalPatch(), PACKAGE)
  const anchors = result.sites.filter((site) => site.rule === 'persona-anchor')
  assert.deepEqual(
    anchors.map((site) => site.file),
    PERSONA_FILES,
  )
})

test('the produced text carries no pre-port package occurrence', () => {
  const result = applyRewrites(minimalPatch(), PACKAGE)
  assert.equal(result.text.split(LOCAL_PACKAGE).length - 1, 0)
  assert.equal(result.text.split(`${LOCAL_PACKAGE}/persona`).length - 1, 0)
  assert.equal(result.text.split('@local/').length - 1, 0)
})

test('the produced text satisfies the product invariants', () => {
  const result = applyRewrites(minimalPatch(), PACKAGE)
  assert.deepEqual(productProblems(result.text, PACKAGE, result.counts), [])
})

test('the produced text names the published package exactly once as a self-reference', () => {
  const result = applyRewrites(minimalPatch(), PACKAGE)
  assert.equal(result.text.split(`name: '${PACKAGE}/persona'`).length - 1, 1)
  assert.equal(result.text.split("personas', '").length - 1, 9)
})

test('already-ported text is not rewritten again', () => {
  const once = applyRewrites(minimalPatch(), PACKAGE)
  const twice = applyRewrites(once.text, PACKAGE)
  assert.deepEqual(twice.counts, { name: 0, persona: 0, comment: 0 })
  assert.equal(twice.text, once.text, 'a second pass must be a no-op')
})

test('the rewritten anchor is the exact expression the tools publish', () => {
  const result = applyRewrites(minimalPatch(), PACKAGE)
  assert.ok(result.text.includes(personaExpression(PACKAGE, 'explore.md')))
})

test('a patch with the wrong number of anchors is reported, not silently accepted', () => {
  const patch = minimalPatch().replace(localAnchor('metis.md'), 'aDifferentExpression')
  const result = applyRewrites(patch, PACKAGE)
  assert.equal(result.counts.persona, 8)
  const problems = productProblems(result.text, PACKAGE, result.counts)
  assert.ok(problems.some((problem) => problem.includes('persona')), `expected a persona problem, got: ${problems.join(' | ')}`)
})
