/**
 * The `tool-gate` module's contract, exercised against a recording host rather
 * than a live DSH runtime.
 *
 * Two shapes matter here and both are faked deliberately:
 *
 * 1. The MCP inventory comes from the loader, not from the registry, so the fake
 *    loader yields `@deepseek-ai/dsh-mcp-client` entries the way a profile
 *    patch would. A server that is configured but not connected publishes no
 *    tools, and only the loader can still name it.
 * 2. The mask is mounted per agent, so one `apply()` produces one controller
 *    plus one child plugin per agent scope. The fake scope records every
 *    `restrict()` argument and every disposer call, which is what proves the
 *    isolation claim: a `tools/restrict` applied for agent A must never appear
 *    in agent B's recorded calls.
 *
 * Everything the plugin reads at runtime — the loader list, each agent's cwd,
 * the workspace config file, the registry — is injected here, so the assertions
 * describe the plugin's own logic rather than the harness around it.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const MODULE_URL = pathToFileURL(join(import.meta.dirname, '..', 'tool-gate.mjs')).href
const MCP_PLUGIN = '@deepseek-ai/dsh-mcp-client'

/** Registry contents: two tools from one server, one from another, two builtins. */
const REGISTRY_NAMES = [
  'mcp__codebase-memory-mcp__search_graph',
  'mcp__codebase-memory-mcp__list_projects',
  'mcp__other__ping',
  'read',
  'write',
]

/** Loader entries as a profile patch would produce them. */
function loaderEntries(names = ['codebase-memory-mcp']) {
  return names.map((server) => ({
    options: { id: `panel-mcp-${server}`, name: MCP_PLUGIN, config: { serverName: server } },
  }))
}

/**
 * One fake agent scope: records restrict() calls and disposer invocations, and
 * mounts child plugins immediately.
 */
function fakeScope(registryNames = REGISTRY_NAMES) {
  const masks = []
  const disposals = []
  const scope = {
    tools: {
      view: () => ({ restrictableNames: registryNames }),
      restrict({ deny }) {
        masks.push(deny.slice())
        return () => {
          disposals.push(deny.slice())
        }
      },
    },
    effect: (factory) => factory(),
  }
  scope.plugin = (plugin) => plugin.apply(scope)
  return { scope, masks, disposals }
}

/**
 * One fake host: a loader, a registry of registered tool definitions, an event
 * bus, and a per-agent scope factory.
 */
function fakeHost({ entries = loaderEntries(), registryNames = REGISTRY_NAMES } = {}) {
  const registered = new Map()
  const handlers = new Map()
  const agents = new Map()
  const events = []
  const host = {
    get(service) {
      if (service === 'loader') return { entries: () => entries }
      return undefined
    },
    logger: { warn: () => {} },
    tools: { register: (definition) => registered.set(definition.name, definition) },
    inject: (deps, cb) => cb(host),
    on(event, handler) {
      handlers.set(event, handler)
      return () => {}
    },
    effect: (factory) => factory(),
  }
  const emit = (event, payload) => {
    events.push(event)
    handlers.get(event)?.(payload)
  }
  const makeAgent = (id, cwd) => {
    const { scope, masks, disposals } = fakeScope(registryNames)
    const agent = {
      id,
      session: { header: cwd === undefined ? {} : { cwd } },
      ctx: scope,
      masks,
      disposals,
    }
    agents.set(id, agent)
    return agent
  }
  return { host, registered, emit, makeAgent, agents }
}

/** A throwaway workspace directory with an optional `.dsh/mcp-servers.json`. */
function workspace(policy) {
  const root = mkdtempSync(join(tmpdir(), 'tool-gate-'))
  if (policy !== undefined) {
    mkdirSync(join(root, '.dsh'), { recursive: true })
    writeFileSync(join(root, '.dsh', 'mcp-servers.json'), JSON.stringify(policy))
  }
  return { path: root, remove: () => rmSync(root, { recursive: true, force: true }) }
}

/**
 * The mask currently in force for one agent, or an empty list.
 *
 * The plugin lifts the previous restriction before it decides what to apply
 * next, and applies nothing at all once an empty mask is derived — so the
 * effective mask is the last `restrict()` whose disposer has not run yet, not
 * simply the last recorded call. Reading the last call would report a lifted
 * restriction as still active.
 */
function activeMask(agent) {
  const inForce = agent.masks.length - agent.disposals.length
  return inForce <= 0 ? [] : agent.masks[agent.masks.length - 1]
}

test('the module exports the cordis plugin shape', async () => {
  const mod = await import(MODULE_URL)
  assert.equal(mod.name, 'tool-gate')
  assert.deepEqual(mod.inject, ['tools'])
  assert.equal(typeof mod.apply, 'function')
})

test('the inventory comes from the loader, including the id fallback', async () => {
  const mod = await import(MODULE_URL)
  const entries = [
    { options: { id: 'panel-mcp-alpha', name: MCP_PLUGIN, config: { serverName: 'alpha' } } },
    { options: { id: 'panel-mcp-beta', name: MCP_PLUGIN, config: {} } },
    { options: { id: 'panel-mcp-gamma', name: MCP_PLUGIN, config: { serverName: 'gamma' }, disabled: true } },
    { options: { id: 'unrelated', name: 'some-other-plugin' } },
  ]
  const { host, registered, makeAgent } = fakeHost({
    entries,
    registryNames: ['mcp__alpha__one', 'mcp__beta__two', 'mcp__gamma__three'],
  })
  mod.apply(host)
  const space = workspace({ allow: ['alpha', 'beta', 'gamma'] })
  try {
    const agent = makeAgent('agent-1', space.path)
    const result = await registered.get('list_mcp_servers').execute({}, { agent })
    assert.deepEqual(result.servers.map((server) => server.server), ['alpha', 'beta'])
  } finally {
    space.remove()
  }
})

test('the workspace allow list filters what is available', async () => {
  const mod = await import(MODULE_URL)
  const { host, registered, makeAgent } = fakeHost({
    entries: loaderEntries(['codebase-memory-mcp', 'other']),
  })
  mod.apply(host)
  const space = workspace({ allow: ['other'] })
  try {
    const agent = makeAgent('agent-1', space.path)
    const result = await registered.get('list_mcp_servers').execute({}, { agent })
    assert.deepEqual(result.servers.map((server) => server.server), ['other'])
  } finally {
    space.remove()
  }
})

test('the workspace deny list wins over the allow list', async () => {
  const mod = await import(MODULE_URL)
  const { host, registered, makeAgent } = fakeHost({
    entries: loaderEntries(['codebase-memory-mcp', 'other']),
  })
  mod.apply(host)
  const space = workspace({ allow: ['codebase-memory-mcp', 'other'], deny: ['other'] })
  try {
    const agent = makeAgent('agent-1', space.path)
    const result = await registered.get('list_mcp_servers').execute({}, { agent })
    assert.deepEqual(result.servers.map((server) => server.server), ['codebase-memory-mcp'])
  } finally {
    space.remove()
  }
})

test('a workspace without a config file gets no servers at all', async () => {
  const mod = await import(MODULE_URL)
  // No discovered servers: there is genuinely nothing to authorize, so the
  // guidance points at the config file rather than at enable_mcp candidates.
  const { host, registered, makeAgent } = fakeHost({ entries: [] })
  mod.apply(host)
  const space = workspace()
  try {
    const agent = makeAgent('agent-1', space.path)
    const result = await registered.get('list_mcp_servers').execute({}, { agent })
    assert.deepEqual(result.servers, [])
    assert.equal(result.message, 'no MCP servers allowed in this workspace; add .dsh/mcp-servers.json')
  } finally {
    space.remove()
  }
})

test('a workspace with nothing enabled yet names the enable candidates', async () => {
  const mod = await import(MODULE_URL)
  // Auto-config writes `{allow:[],deny:[all]}` on first attach, so a usable set
  // of zero is the normal "nothing authorized yet" state; the tool must point
  // the model at enable_mcp candidates instead of at a file that already exists.
  const { host, registered, makeAgent } = fakeHost()
  mod.apply(host)
  const space = workspace()
  try {
    const agent = makeAgent('agent-1', space.path)
    const result = await registered.get('list_mcp_servers').execute({}, { agent })
    assert.deepEqual(result.servers, [])
    assert.match(
      String(result.message),
      /no MCP servers are enabled in this workspace yet; call enable_mcp with one of: codebase-memory-mcp/,
    )
  } finally {
    space.remove()
  }
})

test('every failure path names its own reason', async () => {
  const mod = await import(MODULE_URL)
  const { host, registered, makeAgent } = fakeHost({
    entries: loaderEntries(['codebase-memory-mcp', 'idle']),
  })
  mod.apply(host)
  const space = workspace({ allow: ['codebase-memory-mcp', 'idle'], deny: ['idle'] })
  try {
    const agent = makeAgent('agent-1', space.path)
    const list = registered.get('list_mcp_servers')
    const enable = registered.get('enable_mcp')

    await assert.rejects(() => list.execute({}, {}), /no agent context: list_mcp_servers needs a session/)
    await assert.rejects(() => enable.execute({ server: 'nope' }, { agent }), /unknown server: nope/)
    await assert.rejects(
      () => enable.execute({ server: 'idle' }, { agent }),
      /not allowed in this workspace: idle|denied by workspace config: idle/,
    )
    const notConnected = await enable.execute({ server: 'codebase-memory-mcp' }, { agent })
    assert.match(String(notConnected.message), /enabled 2 tools from codebase-memory-mcp/)
  } finally {
    space.remove()
  }
})

test('enable and disable move one server in and out of the mask', async () => {
  const mod = await import(MODULE_URL)
  const { host, registered, emit, makeAgent } = fakeHost()
  mod.apply(host)
  const space = workspace({ allow: ['codebase-memory-mcp'] })
  try {
    const agent = makeAgent('agent-1', space.path)
    emit('agent/created', { agent })
    assert.ok(activeMask(agent).includes('mcp__codebase-memory-mcp__search_graph'))

    await registered.get('enable_mcp').execute({ server: 'codebase-memory-mcp' }, { agent })
    assert.ok(!activeMask(agent).includes('mcp__codebase-memory-mcp__search_graph'))
    assert.ok(activeMask(agent).length === 0)

    await registered.get('disable_mcp').execute({ server: 'codebase-memory-mcp' }, { agent })
    assert.ok(activeMask(agent).includes('mcp__codebase-memory-mcp__search_graph'))
  } finally {
    space.remove()
  }
})

test('one applied controller keeps two agents isolated', async () => {
  const mod = await import(MODULE_URL)
  const { host, registered, emit, makeAgent } = fakeHost()
  mod.apply(host)
  const allowed = workspace({ allow: ['codebase-memory-mcp'] })
  const bare = workspace()
  try {
    const first = makeAgent('agent-a', allowed.path)
    const second = makeAgent('agent-b', bare.path)
    // One controller, two agent scopes: the isolation under test is the plugin's
    // own bookkeeping, not two independent module instances.
    emit('agent/created', { agent: first })
    emit('agent/created', { agent: second })

    await registered.get('enable_mcp').execute({ server: 'codebase-memory-mcp' }, { agent: first })

    assert.ok(!activeMask(first).includes('mcp__codebase-memory-mcp__search_graph'))
    assert.ok(activeMask(second).includes('mcp__codebase-memory-mcp__search_graph'))
    assert.equal(first.masks.length > 0, true)
    assert.equal(second.masks.length > 0, true)

    const secondList = await registered.get('list_mcp_servers').execute({}, { agent: second })
    assert.deepEqual(secondList.servers, [])
  } finally {
    allowed.remove()
    bare.remove()
  }
})

test('a disposed agent is forgotten so the same id can mount again', async () => {
  const mod = await import(MODULE_URL)
  const { host, emit, makeAgent } = fakeHost()
  mod.apply(host)
  const space = workspace({ allow: ['codebase-memory-mcp'] })
  try {
    const first = makeAgent('agent-1', space.path)
    emit('agent/created', { agent: first })
    assert.ok(first.masks.length > 0)

    emit('agent/disposed', { agent: { id: 'agent-1' } })
    const again = makeAgent('agent-1', space.path)
    emit('agent/created', { agent: again })
    assert.ok(again.masks.length > 0)
  } finally {
    space.remove()
  }
})

test('an empty mask undoes the previous restriction instead of keeping it', async () => {
  const mod = await import(MODULE_URL)
  const { host, registered, emit, makeAgent } = fakeHost({
    entries: loaderEntries(['codebase-memory-mcp', 'other']),
    registryNames: ['mcp__codebase-memory-mcp__search_graph', 'mcp__other__ping'],
  })
  mod.apply(host)
  const space = workspace({ allow: ['codebase-memory-mcp', 'other'] })
  try {
    const agent = makeAgent('agent-1', space.path)
    emit('agent/created', { agent })
    await registered.get('enable_mcp').execute({ server: 'codebase-memory-mcp' }, { agent })
    const before = agent.disposals.length
    const appliedBefore = agent.masks.length
    await registered.get('enable_mcp').execute({ server: 'other' }, { agent })
    assert.ok(agent.disposals.length > before, 'the previous restriction must be undone')
    assert.equal(agent.masks.length, appliedBefore, 'an empty mask must not be restricted at all')
    assert.deepEqual(activeMask(agent), [], 'nothing stays masked once every server is enabled')
  } finally {
    space.remove()
  }
})

test('a configured but disconnected server still reports and can be enabled', async () => {
  const mod = await import(MODULE_URL)
  const registry = ['read', 'write']
  const { host, registered, emit, makeAgent } = fakeHost({
    entries: loaderEntries(['codebase-memory-mcp']),
    registryNames: registry,
  })
  mod.apply(host)
  const space = workspace({ allow: ['codebase-memory-mcp'] })
  try {
    const agent = makeAgent('agent-1', space.path)
    emit('agent/created', { agent })
    const before = await registered.get('list_mcp_servers').execute({}, { agent })
    assert.deepEqual(before.servers, [
      { server: 'codebase-memory-mcp', connected: false, toolCount: 0, enabled: false },
    ])

    const enabled = await registered.get('enable_mcp').execute({ server: 'codebase-memory-mcp' }, { agent })
    assert.match(String(enabled.message), /configured but not connected/)
    const after = await registered.get('list_mcp_servers').execute({}, { agent })
    assert.equal(after.servers[0]?.enabled, true)
    assert.equal(after.servers[0]?.toolCount, 0)

    // Once the server publishes tools, the enabled flag applies without a retry.
    agent.ctx.tools.view = () => ({ restrictableNames: [...registry, 'mcp__codebase-memory-mcp__search_graph'] })
    emit('tools/change', [])
    assert.ok(!activeMask(agent).includes('mcp__codebase-memory-mcp__search_graph'))
  } finally {
    space.remove()
  }
})

test('a workspace without a config file gets one created on agent creation', async () => {
  const mod = await import(MODULE_URL)
  const { host, emit, makeAgent } = fakeHost({
    entries: loaderEntries(['codebase-memory-mcp', 'other']),
    registryNames: REGISTRY_NAMES,
  })
  mod.apply(host)
  // No policy argument: the workspace starts with no `.dsh/mcp-servers.json`.
  const space = workspace()
  try {
    const agent = makeAgent('agent-1', space.path)
    emit('agent/created', { agent })
    const config = JSON.parse(readFileSync(join(space.path, '.dsh', 'mcp-servers.json'), 'utf8'))
    assert.deepEqual(config.allow, [], 'a fresh config authorizes nothing')
    assert.deepEqual(
      [...config.deny].sort(),
      ['codebase-memory-mcp', 'other'],
      'a fresh config denies every discovered server',
    )
  } finally {
    space.remove()
  }
})

test('enable writes through to the config and a reconcile does not undo it', async () => {
  const mod = await import(MODULE_URL)
  const { host, registered, emit, makeAgent } = fakeHost({
    entries: loaderEntries(['codebase-memory-mcp', 'other']),
    registryNames: REGISTRY_NAMES,
  })
  mod.apply(host)
  // The auto-created config starts with everything denied, so this enable has
  // to lift a denial rather than confirm a pre-existing authorization.
  const space = workspace()
  const configPath = join(space.path, '.dsh', 'mcp-servers.json')
  try {
    const agent = makeAgent('agent-1', space.path)
    emit('agent/created', { agent })
    assert.deepEqual(JSON.parse(readFileSync(configPath, 'utf8')).allow, [])

    await registered.get('enable_mcp').execute({ server: 'codebase-memory-mcp' }, { agent })
    const afterEnable = JSON.parse(readFileSync(configPath, 'utf8'))
    assert.ok(afterEnable.allow.includes('codebase-memory-mcp'), 'enable must be written into allow')
    assert.ok(!afterEnable.deny.includes('codebase-memory-mcp'), 'enable must leave deny')
    assert.ok(afterEnable.deny.includes('other'), 'the other server stays denied')

    // A later reconcile must not put it back: the auto-maintain loop has to
    // skip servers that already sit in `allow`.
    emit('tools/change', [])
    emit('tools/change', [])
    assert.deepEqual(
      JSON.parse(readFileSync(configPath, 'utf8')),
      afterEnable,
      'a reconcile must not undo an enable',
    )
  } finally {
    space.remove()
  }
})

test('write-through preserves user-owned keys in the config file', async () => {
  const mod = await import(MODULE_URL)
  const { host, registered, emit, makeAgent } = fakeHost({
    entries: loaderEntries(['codebase-memory-mcp']),
    registryNames: REGISTRY_NAMES,
  })
  mod.apply(host)
  const space = workspace({ $comment: 'managed by ops', version: 2, allow: [], deny: ['codebase-memory-mcp'] })
  const configPath = join(space.path, '.dsh', 'mcp-servers.json')
  try {
    const agent = makeAgent('agent-1', space.path)
    emit('agent/created', { agent })
    // Enable rewrites the file; the extra keys must survive the write-through.
    await registered.get('enable_mcp').execute({ server: 'codebase-memory-mcp' }, { agent })
    const afterEnable = JSON.parse(readFileSync(configPath, 'utf8'))
    assert.equal(afterEnable.$comment, 'managed by ops')
    assert.equal(afterEnable.version, 2)
    assert.ok(afterEnable.allow.includes('codebase-memory-mcp'))
    assert.ok(!afterEnable.deny.includes('codebase-memory-mcp'))
    // Disable rewrites again; the keys must still be there.
    await registered.get('disable_mcp').execute({ server: 'codebase-memory-mcp' }, { agent })
    const afterDisable = JSON.parse(readFileSync(configPath, 'utf8'))
    assert.equal(afterDisable.$comment, 'managed by ops')
    assert.equal(afterDisable.version, 2)
    assert.ok(!afterDisable.allow.includes('codebase-memory-mcp'))
    assert.ok(afterDisable.deny.includes('codebase-memory-mcp'))
  } finally {
    space.remove()
  }
})

test('registerSkill does not throw when the host has no skills service', async () => {
  const mod = await import(MODULE_URL)
  const { host } = fakeHost()
  // The fake host has no `skills` property, but its `inject` delivers `host`
  // to `run`, which tries `scoped.skills.register` → TypeError → caught → warn.
  assert.doesNotThrow(() => mod.apply(host))
})

test('registerSkill with a bad URL logs a warning instead of throwing', async () => {
  const mod = await import(MODULE_URL)
  const { host } = fakeHost()
  const badUrl = new URL('file:///nonexistent')
  assert.doesNotThrow(() => mod.registerSkill(host, badUrl))
})

test('registerSkill catches and swallows a skills.register rejection', async () => {
  const mod = await import(MODULE_URL)
  const { host } = fakeHost()
  host.skills = { register: () => { throw new Error('mock reject') } }
  const goodUrl = new URL('./skills/mcp-lazy-load/SKILL.md', import.meta.url)
  assert.doesNotThrow(() => mod.registerSkill(host, goodUrl))
})
