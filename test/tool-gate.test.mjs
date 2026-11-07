/**
 * The `tool-gate` module's contract, exercised against a recording context
 * rather than a live DSH runtime: the export shape, the prefix expansion
 * against the live registry, the empty-deny no-op, and the re-entry guard.
 *
 * The module is mounted inside the preset's own agent scope, the only place
 * `tools.restrict()` accepts. The fake below stands in for that scope: a
 * `view()` that reports a fixed registry, a `restrict()` that records its
 * argument and returns a disposer, an `on()` that records subscriptions, and
 * an `effect()` that runs its callback immediately. The contract under test is
 * the plugin's own logic, not the registry implementation.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** A registry name set that contains tools from the five MCP servers plus builtins. */
const REGISTRY_NAMES = [
  'mcp__EIDE__start_server',
  'mcp__EIDE__stop_server',
  'mcp__tavily-proxy__search',
  'mcp__codebase-memory-mcp__search_graph',
  'mcp__cubemx__cubemx_read_ioc',
  'mcp__cortex-debug-mcp__attach',
  'tool-fs',
  'tool-bash',
]

/** The five deny prefixes the preset configures. */
const DENY = [
  'mcp__EIDE__',
  'mcp__tavily-proxy__',
  'mcp__codebase-memory-mcp__',
  'mcp__cubemx__',
  'mcp__cortex-debug-mcp__',
]

/** Build a recording context standing in for the preset's agent scope. */
function recordingContext(registryNames = REGISTRY_NAMES) {
  const events = []
  const restricted = []
  const unsubscribed = []
  const cleanup = []
  let applied
  const ctx = {
    tools: {
      view() {
        return { restrictableNames: registryNames }
      },
      restrict({ deny }) {
        restricted.push(deny)
        return () => {
          applied = undefined
          unsubscribed.push(deny)
        }
      },
    },
    on(event, handler) {
      events.push([event, handler])
      return () => {}
    },
    effect(fn) {
      cleanup.push(fn())
      return () => {}
    },
  }
  const trigger = (reason) => {
    // Re-emit a tools/change: the plugin's own restrict() synchronously echoes
    // through the same channel, which is exactly the recursion the guard must
    // stop. Each recorded handler runs once per event.
    for (const [, handler] of events) handler(reason)
  }
  return { ctx, events, restricted, unsubscribed, cleanup, trigger }
}

const MODULE_URL = pathToFileURL(join(import.meta.dirname, '..', 'tool-gate.mjs')).href

test('the module exports the cordis plugin shape', async () => {
  const mod = await import(MODULE_URL)
  assert.equal(mod.name, 'tool-gate')
  assert.deepEqual(mod.inject, ['tools'])
  assert.equal(typeof mod.apply, 'function')
})

test('an absent or empty deny is a no-op that registers nothing', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  assert.doesNotThrow(() => mod.apply(rec.ctx, undefined))
  assert.equal(rec.events.length, 0)
  assert.equal(rec.restricted.length, 0)
  assert.equal(rec.cleanup.length, 0)

  const rec2 = recordingContext()
  assert.doesNotThrow(() => mod.apply(rec2.ctx, { deny: [] }))
  assert.equal(rec2.events.length, 0)
  assert.equal(rec2.restricted.length, 0)
})

test('apply subscribes, restricts once and registers cleanup', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  mod.apply(rec.ctx, { deny: DENY })
  assert.equal(rec.events.length, 1)
  assert.equal(rec.events[0][0], 'tools/change')
  assert.equal(rec.restricted.length, 1)
  const denied = rec.restricted[0]
  assert.equal(denied.length, 6)
  assert.ok(denied.includes('mcp__EIDE__start_server'))
  assert.ok(denied.includes('mcp__tavily-proxy__search'))
  assert.ok(denied.includes('mcp__codebase-memory-mcp__search_graph'))
  assert.ok(denied.includes('mcp__cubemx__cubemx_read_ioc'))
  assert.ok(denied.includes('mcp__cortex-debug-mcp__attach'))
  assert.ok(!denied.includes('tool-fs'))
  assert.ok(!denied.includes('tool-bash'))
  assert.equal(rec.cleanup.length, 1)
})

test('a tools/change echo does not re-restrict an unchanged set', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  mod.apply(rec.ctx, { deny: DENY })
  rec.trigger('tools/change')
  assert.equal(rec.restricted.length, 1, 'the echo of our own restriction must be a no-op')
})

test('a registry change that adds a matching tool expands and re-restricts', async () => {
  const mod = await import(MODULE_URL)
  const names = [...REGISTRY_NAMES]
  const rec = recordingContext(names)
  mod.apply(rec.ctx, { deny: DENY })
  assert.equal(rec.restricted.length, 1)
  names.push('mcp__EIDE__probe')
  rec.trigger('tools/change')
  assert.equal(rec.restricted.length, 2)
  assert.ok(rec.restricted[1].includes('mcp__EIDE__probe'))
})

test('a registry that matches nothing stays unrestricted and is re-checked', async () => {
  const mod = await import(MODULE_URL)
  const names = ['tool-fs', 'tool-bash']
  const rec = recordingContext(names)
  mod.apply(rec.ctx, { deny: DENY })
  assert.equal(rec.restricted.length, 0, 'nothing matched, so nothing is restricted')
  names.push('mcp__cubemx__cubemx_read_ioc')
  rec.trigger('tools/change')
  assert.equal(rec.restricted.length, 1)
  assert.deepEqual(rec.restricted[0], ['mcp__cubemx__cubemx_read_ioc'])
})

test('the cleanup disposes the restriction in force', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  mod.apply(rec.ctx, { deny: DENY })
  assert.equal(rec.unsubscribed.length, 0)
  rec.cleanup[0]()
  assert.equal(rec.unsubscribed.length, 1)
  assert.deepEqual(rec.unsubscribed[0], rec.restricted[0])
})
