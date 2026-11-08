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

/** The five server names the preset configures for the meta tools. */
const SERVER_NAMES = [
  'EIDE',
  'tavily-proxy',
  'codebase-memory-mcp',
  'cubemx',
  'cortex-debug-mcp',
]

/** Build a recording context standing in for the preset's agent scope. */
function recordingContext(registryNames = REGISTRY_NAMES) {
  const events = []
  const restricted = []
  const unsubscribed = []
  const cleanup = []
  const registered = []
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
      register(definition) {
        registered.push(definition)
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
  return { ctx, events, restricted, unsubscribed, cleanup, registered, trigger }
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

test('enable_mcp removes the server tools from the deny set and registers output schema', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  mod.apply(rec.ctx, { deny: DENY, serverNames: SERVER_NAMES })
  // The base mask covered every server tool.
  const base = rec.restricted[0]
  assert.ok(base.includes('mcp__codebase-memory-mcp__search_graph'))
  assert.ok(base.includes('mcp__EIDE__start_server'))
  // Both meta tools registered with the output schema contract.
  const names = rec.registered.map((d) => d.name)
  assert.ok(names.includes('enable_mcp'))
  assert.ok(names.includes('disable_mcp'))
  for (const definition of rec.registered) {
    assert.ok(definition.output?.schema, `${definition.name} must declare an output schema`)
    assert.equal(typeof definition.output?.render, 'function')
  }
  const enable = rec.registered.find((d) => d.name === 'enable_mcp')
  const result = await enable.execute({ server: 'codebase-memory-mcp' })
  assert.match(result.message, /enabled tools from codebase-memory-mcp/)
  // The undo of the per-server restriction and the reconcile emit tools/change
  // echoes; the re-entry guard must leave the base mask intact for other servers.
  assert.equal(rec.restricted.length, 2)
  const second = rec.restricted[1]
  assert.ok(!second.includes('mcp__codebase-memory-mcp__search_graph'))
  assert.ok(second.includes('mcp__EIDE__start_server'))
  // Disabling again re-adds the exact names.
  const disable = rec.registered.find((d) => d.name === 'disable_mcp')
  const result2 = await disable.execute({ server: 'codebase-memory-mcp' })
  assert.match(result2.message, /disabled 1 tool/)
  assert.ok(rec.unsubscribed.length >= 1)
  const undos = rec.unsubscribed.flat()
  assert.ok(undos.includes('mcp__codebase-memory-mcp__search_graph'))
})

test('disable_mcp re-enters the denied set with exact names', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  mod.apply(rec.ctx, { deny: DENY, serverNames: SERVER_NAMES })
  const disable = rec.registered.find((d) => d.name === 'disable_mcp')
  // Base mask already hides the server; disable re-applies exact names on top.
  const result = await disable.execute({ server: 'EIDE' })
  assert.match(result.message, /disabled 2 tools from EIDE/)
  assert.equal(rec.restricted.length, 2)
  assert.deepEqual(rec.restricted[1], ['mcp__EIDE__start_server', 'mcp__EIDE__stop_server'])
})

test('enable_mcp and disable_mcp throw for an unknown server', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  mod.apply(rec.ctx, { deny: DENY, serverNames: SERVER_NAMES })
  const enable = rec.registered.find((d) => d.name === 'enable_mcp')
  const disable = rec.registered.find((d) => d.name === 'disable_mcp')
  await assert.rejects(() => enable.execute({ server: 'unknown-server' }), /unknown server: unknown-server/)
  await assert.rejects(() => disable.execute({ server: 'unknown-server' }), /unknown server: unknown-server/)
})

test('no serverNames config registers no meta tools', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  mod.apply(rec.ctx, { deny: DENY })
  assert.equal(rec.registered.length, 0)
  assert.ok(!rec.restricted[0].some((n) => n === 'enable_mcp' || n === 'disable_mcp'))
})

test('list_mcp_servers reports every configured server with its tool count', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  mod.apply(rec.ctx, { deny: DENY, serverNames: SERVER_NAMES })
  const list = rec.registered.find((d) => d.name === 'list_mcp_servers')
  assert.ok(list, 'list_mcp_servers must be registered')
  const result = await list.execute({})
  assert.equal(result.servers.length, 5)
  const byName = Object.fromEntries(result.servers.map((entry) => [entry.server, entry]))
  assert.deepEqual(byName.EIDE, { server: 'EIDE', connected: true, toolCount: 2, enabled: false })
  assert.deepEqual(byName['tavily-proxy'], {
    server: 'tavily-proxy',
    connected: true,
    toolCount: 1,
    enabled: false,
  })
  assert.deepEqual(byName['codebase-memory-mcp'], {
    server: 'codebase-memory-mcp',
    connected: true,
    toolCount: 1,
    enabled: false,
  })
  assert.deepEqual(byName.cubemx, { server: 'cubemx', connected: true, toolCount: 1, enabled: false })
  assert.deepEqual(byName['cortex-debug-mcp'], {
    server: 'cortex-debug-mcp',
    connected: true,
    toolCount: 1,
    enabled: false,
  })
  // The renderer emits the list as one JSON text block.
  const blocks = list.output.render({}, result)
  assert.equal(blocks.length, 1)
  assert.deepEqual(JSON.parse(blocks[0].text), result.servers)
})

test('list_mcp_servers reports a disconnected server as zero tools', async () => {
  const mod = await import(MODULE_URL)
  // A registry without any MCP tool stands in for the servers not connected.
  const rec = recordingContext(['tool-fs'])
  mod.apply(rec.ctx, { deny: DENY, serverNames: SERVER_NAMES })
  const list = rec.registered.find((d) => d.name === 'list_mcp_servers')
  const result = await list.execute({})
  assert.equal(result.servers.length, 5)
  for (const entry of result.servers) {
    assert.equal(entry.connected, false)
    assert.equal(entry.toolCount, 0)
  }
})

test('list_mcp_servers reports the enabled flag flipping with enable and disable', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  mod.apply(rec.ctx, { deny: DENY, serverNames: SERVER_NAMES })
  const list = rec.registered.find((d) => d.name === 'list_mcp_servers')
  const enable = rec.registered.find((d) => d.name === 'enable_mcp')
  const disable = rec.registered.find((d) => d.name === 'disable_mcp')
  const pick = (result) => result.servers.find((entry) => entry.server === 'codebase-memory-mcp')
  assert.equal(pick(await list.execute({})).enabled, false)
  await enable.execute({ server: 'codebase-memory-mcp' })
  const during = pick(await list.execute({}))
  assert.equal(during.enabled, true)
  // Connection status is independent of the enabled flag.
  assert.equal(during.connected, true)
  await disable.execute({ server: 'codebase-memory-mcp' })
  assert.equal(pick(await list.execute({})).enabled, false)
})

test('list_mcp_servers degrades to an empty list when the catalog cannot be read', async () => {
  const mod = await import(MODULE_URL)
  const rec = recordingContext()
  mod.apply(rec.ctx, { deny: DENY, serverNames: SERVER_NAMES })
  const list = rec.registered.find((d) => d.name === 'list_mcp_servers')
  const originalView = rec.ctx.tools.view
  rec.ctx.tools.view = () => {
    throw new Error('registry offline')
  }
  const result = await list.execute({})
  rec.ctx.tools.view = originalView
  assert.deepEqual(result.servers, [])
  assert.match(result.message, /tool catalog unavailable: registry offline/)
  // The failure path renders the message instead of a list.
  const blocks = list.output.render({}, result)
  assert.equal(blocks.length, 1)
  assert.match(blocks[0].text, /tool catalog unavailable/)
})
