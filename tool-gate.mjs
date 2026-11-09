/**
 * Tool gate for the `tri-agent` agent preset — workspace-scoped MCP lazy loading.
 *
 * The deployment can register any number of MCP servers through
 * `@deepseek-ai/dsh-mcp-client` loader entries. Every preset inherits their whole
 * tool catalog whether or not it wants it, which costs schema tokens on every
 * request. This plugin keeps all of them masked by default and lets the model
 * lift the mask for one server at a time, per session.
 *
 * Two things make the design non-obvious:
 *
 * 1. The MCP inventory comes from the loader entry list, not from the tool
 *    registry. A server that is configured but not connected publishes no tools,
 *    and a server whose tool names happen to share a prefix with another server
 *    would be mis-attributed; reading `@deepseek-ai/dsh-mcp-client` entries and
 *    their `config.serverName` is the only faithful source.
 *
 * 2. The mask has to be applied per agent, not from this plugin's own context.
 *    A preset is mounted once under a standing scope and every session joins by
 *    scope parentage, so a restriction applied here would be shared by all
 *    sessions of the preset. The plugin therefore mounts a small child plugin on
 *    each agent's own scope and applies `tools.restrict()` there.
 *
 * Which servers a workspace may use is workspace-local: `<session cwd>/.dsh/
 * mcp-servers.json` carries `allow` and `deny` lists. A missing file, or an
 * empty `allow`, means no MCP server is available at all — the deny list alone
 * never grants anything.
 *
 * `restrict()` matches exact global names only and throws on anything it cannot
 * resolve, so every mask is expanded against the agent scope's live
 * `restrictableNames` right before it is applied. Both `restrict()` and the
 * disposer it returns emit `tools/change` synchronously, and the controller
 * subscribes to that same event, hence the re-entry guards.
 *
 * @module tool-gate
 */

import { readFileSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name. */
export const name = 'tool-gate'

/** The gate reads and rewrites the tool registry of its own agent scope. */
export const inject = ['tools']

/** The loader plugin name that publishes MCP servers. */
const MCP_PLUGIN = '@deepseek-ai/dsh-mcp-client'

/** `serverName` shape the MCP client accepts. */
const NAME_RE = /^[A-Za-z0-9_-]{1,32}$/

/** Public tool-name prefix of one MCP server. */
const MCP_PREFIX = 'mcp__'

/** Workspace-local configuration file, relative to the session cwd. */
const CONFIG_RELATIVE = join('.dsh', 'mcp-servers.json')

/** Prefix the panel gives to an MCP entry id it created. */
const MANAGED_ID_PREFIX = 'panel-mcp-'

/** Config cache entry: parsed allow/deny plus the mtime they were read at. */
const configCache = new Map()

/**
 * Read one MCP entry's server name from its id when `config.serverName` is
 * missing, matching the panel's own fallback (`panel-mcp-<name>` → `<name>`).
 *
 * @param id - the loader entry id, when present.
 * @returns the derived server name, or undefined.
 */
function serverNameFromEntryId(id) {
  if (typeof id !== 'string' || !id.startsWith(MANAGED_ID_PREFIX)) return undefined
  return id.slice(MANAGED_ID_PREFIX.length)
}

/**
 * Scan one patch file for MCP entry `serverName` values, without a YAML parser.
 *
 * The scan is deliberately dumb: it looks for a `name:` line holding the MCP
 * client plugin name and then for the first `serverName:` line inside that
 * entry's block. That covers the shapes the panel and hand editing produce.
 *
 * @param path - absolute path of a `cordis.patch.yml`.
 * @returns every server name found, deduplicated.
 */
function discoverFromPatchFile(path) {
  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    return []
  }
  const found = new Set()
  const lines = raw.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (line === undefined || !/^\s*-?\s*name:/.test(line)) continue
    const value = line.slice(line.indexOf('name:') + 5).trim().replace(/^['"]|['"]$/g, '')
    if (value !== MCP_PLUGIN) continue
    const indent = line.length - line.trimStart().length
    for (let inner = index + 1; inner < lines.length; inner += 1) {
      const next = lines[inner] ?? ''
      const nextIndent = next.length - next.trimStart().length
      if (next.trim() !== '' && nextIndent <= indent - 1) break
      const match = /^\s*serverName:\s*(.+?)\s*$/.exec(next)
      if (match === null) continue
      const serverName = match[1].replace(/^['"]|['"]$/g, '')
      if (NAME_RE.test(serverName)) found.add(serverName)
      break
    }
  }
  return [...found]
}

/**
 * Whether one loader entry is switched off.
 *
 * A loader `Entry` exposes an effective `disabled` getter that folds its own
 * options, every owning parent group, and `!!js` expression results into one
 * boolean, so reading only `options.disabled` would miss a group-disabled or
 * expression-disabled MCP server and keep masking tools it never published. The
 * getter evaluates configuration expressions and can therefore throw, which is
 * not a reason to drop the server from the inventory: an unevaluable entry stays
 * in it, and the mask then simply finds no tools for it.
 *
 * @param entry - one loader entry.
 * @returns whether the entry is disabled.
 */
function entryDisabled(entry) {
  if (entry?.options?.disabled === true) return true
  try {
    return entry?.disabled === true
  } catch {
    return false
  }
}

/**
 * Resolve the MCP inventory from the loader, falling back to the profile patch.
 *
 * @param ctx - the plugin context; `get('loader')` is looked up on it.
 * @returns every configured MCP server name.
 */
function discoverServers(ctx) {
  const found = new Set()
  const loader = typeof ctx.get === 'function' ? ctx.get('loader') : undefined
  if (loader !== undefined && typeof loader.entries === 'function') {
    for (const entry of loader.entries()) {
      const options = entry?.options
      if (options?.name !== MCP_PLUGIN) continue
      if (entryDisabled(entry)) continue
      const configured = options?.config?.serverName
      const serverName = typeof configured === 'string' && configured !== ''
        ? configured
        : serverNameFromEntryId(options?.id)
      if (typeof serverName === 'string' && NAME_RE.test(serverName)) found.add(serverName)
    }
    return [...found]
  }
  // Best effort only: `ctx.baseUrl` is whatever the mounting realm set, which is
  // not necessarily the profile directory. Every candidate that reads cleanly
  // contributes, and a complete miss yields an empty inventory (never a crash).
  const base = ctx.baseUrl
  if (typeof base === 'string' && base.startsWith('file:')) {
    let directory
    try {
      directory = dirname(fileURLToPath(base))
    } catch {
      return []
    }
    for (const candidate of [
      join(directory, 'cordis.patch.yml'),
      join(directory, '..', '..', 'cordis.patch.yml'),
    ]) {
      for (const serverName of discoverFromPatchFile(candidate)) found.add(serverName)
    }
  }
  return [...found]
}

/**
 * Read one workspace's `allow`/`deny` lists, cached by cwd and file mtime.
 *
 * @param cwd - the session working directory, when the session has one.
 * @returns the workspace policy; both lists are empty when unreadable.
 */
function readWorkspaceConfig(cwd) {
  const empty = { allow: [], deny: [] }
  if (typeof cwd !== 'string' || cwd === '') return empty
  const path = join(cwd, CONFIG_RELATIVE)
  let mtime
  try {
    mtime = statSync(path).mtimeMs
  } catch {
    configCache.delete(cwd)
    return empty
  }
  const cached = configCache.get(cwd)
  if (cached !== undefined && cached.mtime === mtime) return cached.policy
  let policy = empty
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'))
    const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])
    policy = { allow: list(parsed?.allow), deny: list(parsed?.deny) }
  } catch {
    policy = empty
  }
  configCache.set(cwd, { mtime, policy })
  return policy
}

/**
 * The servers this workspace may use: configured ∩ allow − deny.
 *
 * An empty `allow` list means nothing is available; the deny list only ever
 * removes.
 *
 * @param discovered - every configured MCP server name.
 * @param policy - the workspace's allow/deny lists.
 * @returns the usable server names.
 */
function usableServers(discovered, policy) {
  const allowed = new Set(policy.allow)
  const denied = new Set(policy.deny)
  return discovered.filter((server) => allowed.has(server) && !denied.has(server))
}

/**
 * Expand one server into the exact global tool names currently in the agent
 * scope's restrictable set.
 *
 * @param known - the agent scope's pre-restriction tool names.
 * @param server - the MCP server name.
 * @returns the matching tool names, in registry order.
 */
function toolNamesOf(known, server) {
  const prefix = `${MCP_PREFIX}${server}__`
  return known.filter((toolName) => toolName.startsWith(prefix))
}

/**
 * The working directory one agent's session recorded.
 *
 * A live Session exposes its directory on the durable header, `header.cwd`; the
 * workspace policy is resolved from that path, so reading anywhere else leaves
 * the policy permanently unreadable and every server unavailable. `meta.cwd`
 * stays as a fallback for hosts that only carry the directory on agent meta.
 *
 * @param agent - the calling agent.
 * @returns the session working directory, or undefined when it recorded none.
 */
function sessionCwd(agent) {
  return agent?.session?.header?.cwd ?? agent?.session?.meta?.cwd
}

/**
 * Absolute path of one workspace's local MCP config file.
 *
 * @param cwd - the session working directory.
 * @returns the full path, or an empty string when cwd is unset.
 */
function configFilePath(cwd) {
  return typeof cwd === 'string' && cwd !== '' ? join(cwd, '.dsh', 'mcp-servers.json') : ''
}

/**
 * Write one workspace's MCP allow/deny config, refresh the config cache, and
 * create the `.dsh` directory when it does not exist yet.
 *
 * Keys other than `allow`/`deny` on the original file (a `$comment`, a `version`
 * marker, whatever the user chose to add) are carried over through `config.extra`
 * so a write-through never silently drops user-owned fields.
 *
 * @param cwd - the session working directory.
 * @param config - `{ extra?, allow, deny }` to persist.
 * @param warn - the plugin's logger function.
 * @returns whether the write succeeded.
 */
function writeConfig(cwd, config, warn) {
  if (typeof cwd !== 'string' || cwd === '') return false
  const path = configFilePath(cwd)
  try {
    mkdirSync(join(cwd, '.dsh'), { recursive: true })
    writeFileSync(
      path,
      JSON.stringify({ ...(config.extra ?? {}), allow: config.allow, deny: config.deny }, null, 2) + '\n',
      'utf8',
    )
  } catch (error) {
    warn(`tool-gate: writing the workspace MCP config for ${cwd} failed: ${error?.message ?? String(error)}`)
    return false
  }
  try {
    configCache.set(cwd, { mtime: statSync(path).mtimeMs, policy: { allow: config.allow.slice(), deny: config.deny.slice() } })
  } catch {
    configCache.delete(cwd)
  }
  return true
}

/**
 * The user-owned keys of a parsed config, i.e. everything except `allow` and
 * `deny`. Non-object input carries nothing over.
 *
 * @param parsed - the parsed config file, or null/array/undefined.
 * @returns the keys to preserve on the next write.
 */
function extraOf(parsed) {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
  const { allow: _allow, deny: _deny, ...rest } = parsed
  return rest
}

/**
 * Read one workspace's config file without touching the cache.
 *
 * @param cwd - the session working directory.
 * @returns the parsed object, or null when unreadable.
 */
function readRawConfig(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return null
  const path = configFilePath(cwd)
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Ensure the workspace's MCP config exists and the deny list covers every
 * discovered server. Does **not** overwrite an existing file or an unreadable
 * one; only appends newly-discovered servers that are not yet in either
 * `allow` or `deny`.
 *
 * A server already in `allow` must never be moved back to `deny`: that would
 * undo a prior `enable_mcp` on the next reconcile.
 *
 * @param cwd - the session working directory.
 * @param discovered - every configured MCP server name from the loader.
 * @param warn - the plugin's logger function.
 */
function ensureConfig(cwd, discovered, warn) {
  if (typeof cwd !== 'string' || cwd === '' || discovered.length === 0) return
  const path = configFilePath(cwd)
  let exists = true
  try { statSync(path) } catch { exists = false }
  if (!exists) {
    // The creation warning belongs inside the success branch: a failed write
    // already logs its own "writing ... failed" line and must not also claim
    // to have created the file.
    if (writeConfig(cwd, { allow: [], deny: [...discovered] }, warn)) {
      warn(`tool-gate: created workspace MCP config for ${cwd} with ${discovered.length} server(s) denied by default`)
    }
    return
  }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    warn(`tool-gate: workspace MCP config for ${cwd} is unreadable; leaving it alone — ${error?.message ?? String(error)}`)
    return
  }
  const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])
  const config = { extra: extraOf(parsed), allow: list(parsed?.allow), deny: list(parsed?.deny) }
  let changed = false
  const added = []
  for (const server of discovered) {
    if (config.deny.includes(server)) continue
    if (config.allow.includes(server)) continue
    config.deny.push(server)
    added.push(server)
    changed = true
  }
  if (changed) {
    if (writeConfig(cwd, config, warn)) {
      warn(`tool-gate: added ${added.length} new MCP server(s) to the workspace config's deny list for ${cwd}: ${added.join(', ')}`)
    }
  }
}

/**
 * Persist an `enable_mcp` decision: move one server from the workspace deny
 * list to the allow list, then write the config file. Called before the
 * in-memory `enabled` set changes, so a failed write leaves nothing half-done.
 *
 * @param cwd - the session working directory.
 * @param server - the MCP server name being enabled.
 * @param warn - the plugin's logger function.
 */
function persistEnable(cwd, server, warn) {
  if (typeof cwd !== 'string' || cwd === '') return
  const raw = readRawConfig(cwd)
  const policy = raw ?? { allow: [], deny: [] }
  const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])
  const allow = list(policy.allow).filter((candidate) => candidate !== server)
  const deny = list(policy.deny).filter((candidate) => candidate !== server)
  allow.push(server)
  writeConfig(cwd, { extra: extraOf(raw), allow, deny }, warn)
}

/**
 * Persist a `disable_mcp` decision: move one server from the workspace allow
 * list to the deny list, then write the config file.
 *
 * @param cwd - the session working directory.
 * @param server - the MCP server name being disabled.
 * @param warn - the plugin's logger function.
 */
function persistDisable(cwd, server, warn) {
  if (typeof cwd !== 'string' || cwd === '') return
  const raw = readRawConfig(cwd)
  const policy = raw ?? { allow: [], deny: [] }
  const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [])
  const allow = list(policy.allow).filter((candidate) => candidate !== server)
  const deny = list(policy.deny).filter((candidate) => candidate !== server)
  deny.push(server)
  writeConfig(cwd, { extra: extraOf(raw), allow, deny }, warn)
}

/**
 * Mount the per-agent mask plugin and register the three model-facing tools.
 *
 * @param ctx - the preset's agent scope context.
 */
export function apply(ctx) {
  /** agentId → { holder, enabled, cwd } */
  const agents = new Map()
  const mounted = new Set()
  const mounting = new Set()
  let syncing = false
  let live = true

  const warn = (message) => {
    try {
      ctx.logger?.warn?.(message)
    } catch {
      // A minimal host has no logger; the gate stays silent.
    }
  }

  /**
   * Build one agent's mask state holder. The returned plugin is mounted on that
   * agent's own scope, so its restriction is invisible to every other session.
   *
   * @param entry - the agent's bookkeeping record.
   * @returns the plugin and the holder the controller drives.
   */
  function pluginFor(entry) {
    const holder = { sync: () => {} }
    const plugin = {
      name: 'tool-gate:agent-mask',
      inject: ['tools'],
      apply(child) {
        let undo
        let applied = null
        let inside = false
        let alive = true
        /** Whether the unreadable-inventory warning was already reported. */
        let warnedEmpty = false

        const maskOnce = () => {
          if (!alive) return
          let known
          try {
            known = child.tools.view(undefined).restrictableNames
          } catch {
            return
          }
          const names = [...known]
          const discovered = discoverServers(ctx)
          // Reconcile the workspace config as well: new servers need to be
          // added to the deny list so they are masked until the model enables
          // them.
          if (entry.cwd) ensureConfig(entry.cwd, discovered, warn)
          const usable = usableServers(discovered, readWorkspaceConfig(entry.cwd))
          const entitled = new Set([...entry.enabled].filter((server) => usable.includes(server)))
          const deny = []
          const empty = discovered.length === 0
          if (empty) {
            // Fail closed. An empty inventory means the loader could not be read,
            // not that this deployment has no MCP servers; reading it as "nothing
            // to hide" would expose every `mcp__` tool, the exact opposite of the
            // gate's contract. Mask whatever the registry can still see.
            deny.push(...names.filter((toolName) => toolName.startsWith(MCP_PREFIX)))
          } else {
            for (const server of discovered) {
              if (entitled.has(server)) continue
              deny.push(...toolNamesOf(names, server))
            }
          }
          const signature = deny.slice().sort().join('\u0000')
          if (signature === applied) return
          // Report the unreadable inventory once per agent, and only on a real
          // state change: an inventory that stays empty would otherwise re-log on
          // every `tools/change`, and the mask it implies is unchanged anyway.
          if (empty && deny.length > 0) {
            if (!warnedEmpty) {
              warnedEmpty = true
              warn('tool-gate: no MCP servers discovered from the loader; masking every mcp__ tool')
            }
          } else {
            warnedEmpty = false
          }
          // Undo first: an empty mask means "apply nothing", never "keep the
          // previous one", otherwise the last enable could never take effect.
          if (undo !== undefined) {
            try {
              undo()
            } catch {
              // A disposer that already ran needs no second report.
            }
            undo = undefined
            applied = null
          }
          if (deny.length === 0) {
            applied = ''
            return
          }
          try {
            undo = child.tools.restrict({ deny })
            applied = signature
          } catch (error) {
            warn(`tool-gate: applying the MCP mask failed: ${error?.message ?? String(error)}`)
            undo = undefined
            applied = null
          }
        }

        const sync = () => {
          if (!alive || inside) return
          inside = true
          try {
            maskOnce()
          } finally {
            inside = false
          }
        }

        holder.sync = sync
        try {
          child.effect(() => () => {
            alive = false
            holder.sync = () => {}
          })
        } catch {
          // Minimal host without `effect`: stop being driven at teardown anyway.
          alive = false
          holder.sync = () => {}
        }
        sync()
      },
    }
    return { plugin, holder }
  }

  /**
   * Mount the mask for one agent, once.
   *
   * @param agent - the live agent whose scope receives the mask.
   */
  function attach(agent) {
    const id = typeof agent?.id === 'string' ? agent.id : undefined
    if (id === undefined || mounted.has(id) || mounting.has(id)) return
    const scope = agent.ctx
    if (scope === undefined || typeof scope.plugin !== 'function') {
      warn(`tool-gate: agent ${id} exposes no scoped context; leaving its MCP tools visible`)
      return
    }
    mounting.add(id)
    try {
      const entry = {
        holder: { sync: () => {} },
        enabled: new Set(),
        cwd: sessionCwd(agent),
        // The mounted child fiber is the only handle that lifts this agent's
        // restriction, so it has to be kept: without it a remounted preset would
        // stack a second mask plugin on the same scope while the first one's
        // "deny everything" restriction stayed in force, hiding that agent's MCP
        // tools for good.
        fiber: undefined,
      }
      const { plugin, holder } = pluginFor(entry)
      entry.holder = holder
      entry.fiber = scope.plugin(plugin)
      agents.set(id, entry)
      mounted.add(id)
      // Auto-create and auto-maintain the workspace MCP config.
      if (entry.cwd) ensureConfig(entry.cwd, discoverServers(ctx), warn)
    } catch (error) {
      warn(`tool-gate: mounting the mask for agent ${id} failed: ${error?.message ?? String(error)}`)
    } finally {
      mounting.delete(id)
    }
  }

  /**
   * Re-derive every mounted agent's mask, unless a reconcile is already running.
   * `restrict()` and its disposer emit `tools/change` synchronously, and this is
   * the listener for that event, so the flag is what stops the recursion.
   */
  function syncAll() {
    if (!live || syncing) return
    syncing = true
    try {
      for (const entry of agents.values()) {
        try {
          entry.holder.sync()
        } catch (error) {
          warn(`tool-gate: re-deriving a mask failed: ${error?.message ?? String(error)}`)
        }
      }
    } finally {
      syncing = false
    }
  }

  /**
   * Resolve the calling agent's record, refreshing both the workspace policy and
   * the loader inventory first: a plain tool call is the only moment a
   * hand-edited configuration file becomes visible.
   *
   * @param exec - the tool run context carrying the calling agent.
   * @returns the agent's record.
   */
  function entryOf(exec, toolName) {
    const agent = exec?.agent
    if (agent === undefined) throw new Error(`no agent context: ${toolName} needs a session`)
    attach(agent)
    const id = typeof agent.id === 'string' ? agent.id : undefined
    const entry = id === undefined ? undefined : agents.get(id)
    // Two different failures reach this point: no agent at all (handled above),
    // and an agent whose scope refused the mount. Reporting the second as a
    // missing session would send the caller looking for the wrong problem.
    if (entry === undefined) throw new Error(`agent scope is not restrictable: ${id ?? 'unknown agent'}`)
    entry.cwd = sessionCwd(agent)
    entry.holder.sync()
    return entry
  }

  /** The model-facing inventory: usable servers in this workspace, with state. */
  ctx.tools.register({
    name: 'list_mcp_servers',
    description:
      'List the MCP servers this workspace allows, with their connection state and whether their tools are currently enabled. Call this when the user asks to load an MCP server, then enable the one they pick.',
    parameters: { type: 'object', additionalProperties: false, properties: {}, required: [] },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          servers: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                server: { type: 'string' },
                connected: { type: 'boolean' },
                toolCount: { type: 'number' },
                enabled: { type: 'boolean' },
              },
              required: ['server', 'connected', 'toolCount', 'enabled'],
            },
          },
          message: { type: 'string' },
        },
        required: ['servers'],
      },
      render: (_args, value) => [
        { type: 'text', text: value.message ?? JSON.stringify(value.servers) },
      ],
    },
    async execute(_args, exec) {
      const agent = exec?.agent
      if (agent === undefined) throw new Error('no agent context: list_mcp_servers needs a session')
      attach(agent)
      const entry = agents.get(agent.id)
      const cwd = sessionCwd(agent)
      const discovered = discoverServers(ctx)
      const usable = usableServers(discovered, readWorkspaceConfig(cwd))
      if (usable.length === 0) {
        // Auto-config creates `{allow:[],deny:[all]}` the moment the first
        // agent appears, so an empty usable set is the normal "nothing
        // authorized yet" state, not a missing file. Name the candidates so
        // the model can call enable_mcp instead of guessing; the file only
        // genuinely needs creating when nothing was discovered at all.
        if (discovered.length === 0) {
          return {
            servers: [],
            message: 'no MCP servers allowed in this workspace; add .dsh/mcp-servers.json',
          }
        }
        return {
          servers: [],
          message: `no MCP servers are enabled in this workspace yet; call enable_mcp with one of: ${discovered.join(', ')}`,
        }
      }
      let known = []
      try {
        known = [...agent.ctx.tools.view(undefined).restrictableNames]
      } catch {
        known = []
      }
      const servers = usable.map((server) => {
        const toolCount = toolNamesOf(known, server).length
        return {
          server,
          connected: toolCount > 0,
          toolCount,
          enabled: entry?.enabled.has(server) === true,
        }
      })
      return { servers }
    },
  })

  /** Shared shape for the two toggles. */
  const toggleOutput = {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { message: { type: 'string' } },
      required: ['message'],
    },
    render: (_args, value) => [{ type: 'text', text: value.message }],
  }

  ctx.tools.register({
    name: 'enable_mcp',
    description:
      'Enable the MCP tools of one server for this session. The tools appear from the next step. Only servers this workspace allows can be enabled.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { server: { type: 'string', description: 'MCP server name' } },
      required: ['server'],
    },
    output: toggleOutput,
    async execute(args, exec) {
      const server = String(args?.server ?? '')
      const entry = entryOf(exec, 'enable_mcp')
      const discovered = discoverServers(ctx)
      if (!discovered.includes(server)) throw new Error(`unknown server: ${server}`)
      // Persist first: move the server from deny to allow in the workspace
      // config so the next reconcile cannot undo this enable.
      const policy = readWorkspaceConfig(entry.cwd)
      const inAllow = policy.allow.includes(server)
      const inDeny = policy.deny.includes(server)
      // Four cases, and the differences matter:
      //   allow ∩ deny    -> an explicit human denial, which wins over this tool
      //   allow ∖ deny    -> already authorized, nothing to persist
      //   deny ∖ allow    -> the auto-maintained default mask this tool exists to lift
      //   neither         -> this workspace never authorized the server
      if (inAllow && inDeny) throw new Error(`denied by workspace config: ${server}`)
      if (!inAllow && !inDeny) throw new Error(`not allowed in this workspace: ${server}`)
      if (!inAllow) persistEnable(entry.cwd, server, warn)
      const granted = readWorkspaceConfig(entry.cwd)
      if (!granted.allow.includes(server)) throw new Error(`not allowed in this workspace: ${server}`)
      if (granted.deny.includes(server)) throw new Error(`denied by workspace config: ${server}`)
      if (entry.enabled.has(server)) return { message: `tools from ${server} are already enabled` }
      entry.enabled.add(server)
      entry.holder.sync()
      let toolCount = 0
      try {
        toolCount = toolNamesOf([...exec.agent.ctx.tools.view(undefined).restrictableNames], server).length
      } catch {
        toolCount = 0
      }
      if (toolCount === 0) {
        return { message: `server ${server} is configured but not connected; it will appear once it connects` }
      }
      return { message: `enabled ${toolCount} tools from ${server}; they will appear in the next step` }
    },
  })

  ctx.tools.register({
    name: 'disable_mcp',
    description:
      'Disable the MCP tools of one server for this session, hiding them again from the next step.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { server: { type: 'string', description: 'MCP server name' } },
      required: ['server'],
    },
    output: toggleOutput,
    async execute(args, exec) {
      const server = String(args?.server ?? '')
      const entry = entryOf(exec, 'disable_mcp')
      const discovered = discoverServers(ctx)
      if (!discovered.includes(server)) throw new Error(`unknown server: ${server}`)
      // Persist first: move the server from allow to deny in the workspace
      // config so the next reconcile keeps it masked.
      persistDisable(entry.cwd, server, warn)
      if (!entry.enabled.has(server)) return { message: `tools from ${server} are already disabled` }
      entry.enabled.delete(server)
      entry.holder.sync()
      return { message: `disabled the tools of ${server}; they will disappear in the next step` }
    },
  })

  ctx.on('agent/created', (payload) => {
    const agent = payload?.agent
    if (agent !== undefined) attach(agent)
  })

  ctx.on('agent/disposed', (payload) => {
    const id = typeof payload?.agent?.id === 'string' ? payload.agent.id : payload?.agent
    if (typeof id !== 'string') return
    agents.delete(id)
    mounted.delete(id)
  })

  ctx.on('tools/change', syncAll)

  ctx.effect(() => () => {
    live = false
    // Dispose the mounted children before forgetting them: a fiber owns the
    // restriction its plugin applied, so only its disposal lifts that mask.
    for (const [id, entry] of [...agents.entries()]) {
      try {
        // `dispose()` may return a promise, and a rejection would slip past this
        // catch to become an unhandled rejection while the host is tearing down.
        entry.fiber?.dispose?.()?.catch?.(() => {})
      } catch (error) {
        warn(`tool-gate: disposing the mask for agent ${id} failed: ${error?.message ?? String(error)}`)
      }
    }
    agents.clear()
    mounted.clear()
  }, 'tool-gate: per-agent mask cleanup')

  // A preset can mount after agents already exist; a subscription alone would
  // leave those sessions unmasked.
  const existing = typeof ctx.get === 'function' ? ctx.get('agents') : undefined
  if (existing !== undefined && typeof existing.list === 'function') {
    for (const agent of existing.list()) attach(agent)
  } else if (existing !== undefined && typeof existing.values === 'function') {
    for (const agent of existing.values()) attach(agent)
  }
}
