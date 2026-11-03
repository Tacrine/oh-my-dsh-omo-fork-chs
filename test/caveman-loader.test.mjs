/**
 * The caveman loader contract, asserted against a real `apply()` call.
 *
 * `caveman-autoload.mjs` does two things when the preset mounts it: it registers the
 * `caveman-ultra` skill, and it registers the prompt section that makes that skill authoritative.
 * Neither is observable through `--dump-config` — a dump prints the composed configuration tree and
 * never contains section text — so this test drives `apply` directly through a fake context that
 * records what each service receives, and asserts on those recorded calls.
 *
 * Three properties here are worth stating because they are the ones a well-meaning edit breaks:
 *
 *   - the description handed to the skill service must equal the `description` in the skill file's
 *     own frontmatter. It is parsed out of that file here, not repeated, so a drift between the two
 *     is a test failure rather than a slow divergence between catalog and file.
 *   - the loader text must carry no prompt variable. A `{{…}}` there would be interpolated by the
 *     prompt registry and throw unless the name happened to be registered, which is how the 0.2.2
 *     persona suffix broke a session.
 *   - the loader text must name no slash command. The regex is bounded on both sides
 *     (`(?<![\w-/])/caveman(?![\w-])`) because a bare `/caveman` substring also matches the
 *     directory name `skills/caveman-ultra`, which is exactly the false positive this assertion
 *     would otherwise report.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { readFileSync } from 'node:fs'

import { apply, inject, name as moduleName } from '../caveman-autoload.mjs'

/** The slash command this deployment does not provide, matched without swallowing paths. */
const SLASH_COMMAND = /(?<![\w-/])\/caveman(?![\w-])/

/** The skill file the module publishes, read here for the description it must agree with. */
const SKILL_FILE = new URL('../skills/caveman-ultra/SKILL.md', import.meta.url)

/**
 * The `description` in a skill file's frontmatter, parsed the same way the module parses it so the
 * comparison is between two readings of one file rather than between a file and a literal.
 *
 * @param content - the skill file's text.
 * @returns the frontmatter description.
 */
function frontmatterDescription(content) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)
  assert.ok(frontmatter !== null, 'the skill file must carry frontmatter')
  const line = /^description:[ \t]*(.*)$/m.exec(frontmatter[1])
  assert.ok(line !== null, 'the skill file frontmatter must carry a description')
  const raw = line[1].trim()
  return raw.startsWith('"') ? JSON.parse(raw) : raw
}

/**
 * The `name` in a skill file's frontmatter, so the catalog entry can be compared with the file it
 * claims to publish.
 *
 * @param content - the skill file's text.
 * @returns the frontmatter name.
 */
function frontmatterName(content) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(content)
  assert.ok(frontmatter !== null, 'the skill file must carry frontmatter')
  const line = /^name:[ \t]*(.*)$/m.exec(frontmatter[1])
  assert.ok(line !== null, 'the skill file frontmatter must carry a name')
  return line[1].trim()
}

/**
 * A context that records the two registrations instead of performing them.
 *
 * `ctx.effect` runs the callback immediately and returns its result, which is what Cordis does with
 * a disposer-returning effect; the labels are kept so a caller can see how many effects were
 * registered and in what order.
 *
 * @returns the fake context plus the record it fills in.
 */
function makeContext() {
  const recorded = { skills: [], sections: [], effects: [], effectDepth: 0 }
  const ctx = {
    effect(fn, label) {
      recorded.effects.push(label)
      recorded.effectDepth += 1
      try {
        return fn()
      } finally {
        recorded.effectDepth -= 1
      }
    },
    skills: {
      register(skill) {
        // A registration outside `ctx.effect` is not tied to the plugin's lifetime, so Cordis
        // would never dispose it. The fake refuses it the same way a real scope would: this is
        // what makes "the module registers through effects" an assertion rather than a claim.
        if (recorded.effectDepth === 0) throw new Error('skills.register called outside ctx.effect')
        recorded.skills.push(skill)
        return () => {}
      },
    },
    systemPrompt: {
      section(section) {
        if (recorded.effectDepth === 0) throw new Error('systemPrompt.section called outside ctx.effect')
        recorded.sections.push(section)
        return () => {}
      },
    },
  }
  return { ctx, recorded }
}

/**
 * Resolve a section's text, since the module registers a provider so the level can change without
 * a re-mount.
 *
 * @param section - the recorded section.
 * @returns the text for an empty assembly context.
 */
const textOf = (section) => (typeof section.text === 'function' ? section.text({}) : section.text)

test('the module declares the plugin name and the two services it needs', () => {
  assert.equal(typeof apply, 'function')
  assert.equal(moduleName, 'caveman-autoload')
  assert.deepEqual(inject, ['systemPrompt', 'skills'])
})

test('both registrations are made inside ctx.effect, so they are tied to the plugin lifetime', () => {
  const { ctx, recorded } = makeContext()

  apply(ctx)

  assert.deepEqual(
    recorded.effects,
    ['caveman-autoload: skill', 'caveman-autoload: loader section'],
    'exactly two effects, one per registration, in this order',
  )
  assert.equal(recorded.skills.length, 1, 'the one skill registration went through an effect')
  assert.equal(recorded.sections.length, 1, 'the one section registration went through an effect')

  // The fake refuses a registration made outside an effect, so the assertion above is not
  // satisfied by an implementation that calls the services directly.
  assert.throws(() => ctx.skills.register({ name: 'probe', description: 'd', content: 'c' }), /outside ctx\.effect/)
  assert.throws(() => ctx.systemPrompt.section({ name: 'probe', order: 1, text: 't' }), /outside ctx\.effect/)
})

test('apply registers one skill whose description is the skill file’s own', () => {
  const skillFile = readFileSync(SKILL_FILE, 'utf8')
  const { ctx, recorded } = makeContext()

  apply(ctx)

  assert.equal(recorded.skills.length, 1, 'exactly one skill is registered')
  const skill = recorded.skills[0]
  assert.equal(skill.name, 'caveman-ultra')

  const expected = frontmatterDescription(skillFile)
  assert.ok(expected.length > 0, 'the skill file description must not be empty')
  assert.equal(skill.description, expected, 'the catalog description must equal the file frontmatter')

  assert.equal(typeof skill.content, 'string')
  assert.ok(skill.content.includes('Default: **ultra**'), 'the shipped skill must default to ultra')
  assert.equal(
    skill.content.match(SLASH_COMMAND)?.length ?? 0,
    0,
    'the shipped skill must name no slash command',
  )
})

test('the skill file’s own name matches the name it is registered under', () => {
  const skillFile = readFileSync(SKILL_FILE, 'utf8')
  assert.equal(frontmatterName(skillFile), 'caveman-ultra')
})

test('apply registers one section at order 60 with a clean loader text', () => {
  const { ctx, recorded } = makeContext()

  apply(ctx)

  assert.equal(recorded.sections.length, 1, 'exactly one section is registered')
  const section = recorded.sections[0]
  assert.equal(section.name, 'caveman:loader')
  assert.equal(section.order, 60, 'order 60 sits between the persona (0) and the plan policy (500)')

  const text = textOf(section)
  assert.ok(text.includes('ultra'), 'the default level is named')
  assert.ok(text.includes('caveman-ultra'), 'the authoritative skill is named')
  assert.ok(text.includes('旧副本'), 'the superseded catalog entry is named as a subordinate clause')
  assert.ok(text.includes('stop caveman'), 'the off switch is named')
  assert.ok(text.includes('normal mode'), 'the second off form is named')
  assert.equal(text.includes('{{'), false, 'the loader text carries no prompt variable')
  assert.equal(text.match(SLASH_COMMAND)?.length ?? 0, 0, 'the loader text names no slash command')
})

test('the level comes from OMO_CAVEMAN_LEVEL, read per assembly', () => {
  const previous = process.env.OMO_CAVEMAN_LEVEL
  try {
    process.env.OMO_CAVEMAN_LEVEL = 'full'
    const { ctx, recorded } = makeContext()
    apply(ctx)
    const text = textOf(recorded.sections[0])
    assert.ok(
      text.includes('默认级别是 **full**'),
      'a deployment that sets the level must see it in the text without a re-mount',
    )

    process.env.OMO_CAVEMAN_LEVEL = 'wenyan-ultra'
    assert.ok(
      textOf(recorded.sections[0]).includes('默认级别是 **wenyan-ultra**'),
      'the provider is read again, so a changed level is visible on the next assembly',
    )

    delete process.env.OMO_CAVEMAN_LEVEL
    assert.ok(
      textOf(recorded.sections[0]).includes('默认级别是 **ultra**'),
      'with nothing set the default is ultra',
    )
  } finally {
    if (previous === undefined) delete process.env.OMO_CAVEMAN_LEVEL
    else process.env.OMO_CAVEMAN_LEVEL = previous
  }
})