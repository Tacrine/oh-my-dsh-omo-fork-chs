/**
 * Tool gate for the `tri-agent` agent preset.
 *
 * The deployment mounts five MCP servers process-wide, so every preset inherits
 * their whole tool catalog whether or not it wants it. For this preset that
 * catalog is dead weight: it costs schema tokens on every request and pulls the
 * model toward tools the preset never routes work to. The deployment cannot
 * switch them off per preset — a context-global restriction would mask the
 * tools for every agent — so this plugin applies the mask from inside the
 * preset's own agent scope, the only place `tools.restrict()` accepts.
 *
 * `restrict()` matches exact global names only; it throws on anything it cannot
 * resolve. Configuration therefore carries prefixes (`mcp__<server>__`), and
 * this plugin expands them against the live registry on every change instead of
 * baking a name list that would rot the moment a server adds or drops a tool.
 *
 * Both `restrict()` and the disposer it returns emit `tools/change`
 * synchronously, and this plugin subscribes to that same event — hence the
 * re-entry guard. Without it the first application would recurse forever.
 *
 * The gate also exposes two meta tools, `enable_mcp` and `disable_mcp`, so the
 * model can toggle one server's tools within a session. `enable_mcp` marks the
 * server active and lifts its mask (its tools show from the next step);
 * `disable_mcp` re-applies an exact-name restriction for that server on top of
 * the base mask. The base mask deliberately skips prefixes whose server is
 * currently active, so the next reconcile does not undo an enable. The meta
 * tool names themselves never match `mcp__`, so the base mask cannot hide them.
 *
 * @module tool-gate
 */

/** Cordis plugin name. */
export const name = 'tool-gate'

/** The gate reads and rewrites the tool registry of its own agent scope. */
export const inject = ['tools']

/**
 * Expand one configured entry into the exact global tool names it covers.
 *
 * An entry is either a full tool name or a name prefix; a name that matches
 * neither drops out silently, which is what lets a preset mount before its MCP
 * servers have published anything.
 *
 * @param known - every restrictable global tool name, pre-restriction.
 * @param prefix - the configured name or name prefix.
 * @returns the matching tool names, in registry order.
 */
function expand(known, prefix) {
  const matched = []
  for (const toolName of known) {
    if (toolName === prefix || toolName.startsWith(prefix)) matched.push(toolName)
  }
  return matched
}

/**
 * Mask the configured tool prefixes for this preset's agents, and register the
 * `enable_mcp` / `disable_mcp` meta tools when `serverNames` is configured.
 *
 * An absent or empty `deny` is a no-op rather than an empty mask: `restrict({})`
 * throws, and a preset that lists nothing means "keep everything".
 *
 * @param ctx - the preset's agent scope context.
 * @param config - optional `deny` list of tool names or name prefixes, and an
 *   optional `serverNames` list that enables the meta tools.
 */
export function apply(ctx, config) {
  const denyList = config?.deny ?? []
  const serverNames = config?.serverNames ?? []
  if (denyList.length === 0 && serverNames.length === 0) return

  /** Per-server mask state, keyed by the `mcp__<server>__` prefix. */
  const states = Object.fromEntries(serverNames.map((server) => [
    `mcp__${server}__`,
    { undo: undefined, active: false },
  ]))

  /** Disposer of the base restriction currently in force, if any. */
  let undo
  /** Signature of the set last applied; `null` means nothing is applied now. */
  let applied = null
  /** Cleared when the host recycles this plugin fiber, to stop re-applying. */
  let live = true
  /** Re-entry guard: applying and lifting a restriction both emit `tools/change`. */
  let inside = false

  /**
   * Reconcile the base mask with the registry's current contents, skipping any
   * server whose tools `enable_mcp` has made visible.
   */
  const syncOnce = () => {
    let known
    try {
      known = new Set(ctx.tools.view(undefined).restrictableNames)
    } catch {
      // The registry refused a view: nothing to reconcile against this round.
      return
    }

    const activePrefixes = new Set(
      Object.entries(states).filter(([, state]) => state.active).map(([prefix]) => prefix),
    )
    const usable = [...new Set(
      denyList
        .filter((prefix) => ![...activePrefixes].some((active) => prefix.startsWith(active)))
        .flatMap((prefix) => expand(known, prefix)),
    )]
    const signature = usable.slice().sort().join('\u0000')
    // An unchanged set needs no work: undo + view + restrict per event is the
    // difference between idle and a busy loop once tools are registered often.
    if (signature === applied) return

    if (undo !== undefined) {
      try {
        undo()
      } catch {
        // A disposer that already ran is not an error worth failing the mount.
      }
      undo = undefined
      applied = null
    }

    if (usable.length === 0) {
      // Nothing matched yet: record the empty set so the next identical round
      // is a no-op, and leave the registry untouched.
      applied = ''
      return
    }

    try {
      undo = ctx.tools.restrict({ deny: usable })
      applied = signature
    } catch {
      // A name disappeared between the view and the call; the next change retries.
      undo = undefined
      applied = null
    }
  }

  /**
   * Reconcile once, unless this call is the echo of our own `restrict()`.
   */
  const sync = () => {
    if (!live || inside) return
    inside = true
    try {
      syncOnce()
    } finally {
      inside = false
    }
  }

  if (serverNames.length > 0) {
    const serverParameter = {
      type: 'string',
      enum: serverNames,
      description: 'MCP server name',
    }
    const textOutput = {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          message: { type: 'string', description: 'What happened' },
        },
        required: ['message'],
      },
      render: (_args, value) => [{ type: 'text', text: value.message }],
    }

    ctx.tools.register({
      name: 'enable_mcp',
      description: 'Enable MCP tools for a server in the next step. Call this when you need tools from a server that is currently disabled.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { server: serverParameter },
        required: ['server'],
      },
      output: textOutput,
      async execute(args) {
        const prefix = `mcp__${args.server}__`
        const state = states[prefix]
        if (state === undefined) throw new Error(`unknown server: ${args.server}`)
        if (state.active) return { message: `tools from ${args.server} are already enabled` }
        // Mark active first so the tools/change echo of the undo (and the
        // reconcile below) excludes this server from the base mask.
        state.active = true
        if (state.undo !== undefined) {
          try {
            state.undo()
          } catch {
            // A disposer that already ran needs no second report.
          }
          state.undo = undefined
        }
        // The base mask may still cover this server (no server-level undo was
        // held); reconcile now so the tools show from the next step.
        sync()
        return { message: `enabled tools from ${args.server}; they will appear in the next step` }
      },
    })

    ctx.tools.register({
      name: 'disable_mcp',
      description: 'Disable MCP tools for a server. Call this to hide those tools and save token overhead.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: { server: serverParameter },
        required: ['server'],
      },
      output: textOutput,
      async execute(args) {
        const prefix = `mcp__${args.server}__`
        const state = states[prefix]
        if (state === undefined) throw new Error(`unknown server: ${args.server}`)
        let known
        try {
          known = new Set(ctx.tools.view(undefined).restrictableNames)
        } catch {
          return { message: 'failed to read tool catalog' }
        }
        const usable = [...known].filter((toolName) => toolName.startsWith(prefix))
        if (usable.length === 0) {
          return { message: `no tools from ${args.server} to disable (server may not be connected)` }
        }
        try {
          state.undo = ctx.tools.restrict({ deny: usable })
          state.active = false
          return { message: `disabled ${usable.length} tools from ${args.server}` }
        } catch (error) {
          return { message: `failed to disable: ${error.message}` }
        }
      },
    })

    ctx.tools.register({
      name: 'list_mcp_servers',
      description: 'List the configured MCP servers with their connection status and whether their tools are currently enabled. Call this when the user asks to load an MCP server, then enable the one they pick.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {},
        required: [],
      },
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
      async execute() {
        let known
        try {
          known = ctx.tools.view(undefined).restrictableNames
        } catch (error) {
          return { servers: [], message: `tool catalog unavailable: ${error.message}` }
        }
        const names = [...known]
        const servers = serverNames.map((server) => {
          const prefix = `mcp__${server}__`
          const toolCount = names.filter((toolName) => toolName.startsWith(prefix)).length
          const state = states[prefix]
          return {
            server,
            connected: toolCount > 0,
            toolCount,
            enabled: state !== undefined && state.active,
          }
        })
        return { servers }
      },
    })
  }

  ctx.on('tools/change', sync)

  ctx.effect(() => () => {
    live = false
    if (undo === undefined) return
    try {
      undo()
    } catch {
      // Fiber teardown: a disposer that already ran needs no second report.
    }
    undo = undefined
  }, 'tool-gate: restricted tool cleanup')

  // The registry is already populated when a preset mounts late; a subscription
  // alone would leave the first catalog untouched.
  sync()
}
