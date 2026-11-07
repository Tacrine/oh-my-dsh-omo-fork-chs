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
 * Mask the configured tool prefixes for this preset's agents.
 *
 * An absent or empty `deny` is a no-op rather than an empty mask: `restrict({})`
 * throws, and a preset that lists nothing means "keep everything".
 *
 * @param ctx - the preset's agent scope context.
 * @param config - optional `deny` list of tool names or name prefixes.
 */
export function apply(ctx, config) {
  const denyList = config?.deny ?? []
  if (denyList.length === 0) return

  /** Disposer of the restriction currently in force, if any. */
  let undo
  /** Signature of the set last applied; `null` means nothing is applied now. */
  let applied = null
  /** Cleared when the host recycles this plugin fiber, to stop re-applying. */
  let live = true
  /** Re-entry guard: applying and lifting a restriction both emit `tools/change`. */
  let inside = false

  /**
   * Reconcile the mask with the registry's current contents.
   */
  const syncOnce = () => {
    let known
    try {
      known = new Set(ctx.tools.view(undefined).restrictableNames)
    } catch {
      // The registry refused a view: nothing to reconcile against this round.
      return
    }

    const usable = [...new Set(denyList.flatMap((prefix) => expand(known, prefix)))]
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
