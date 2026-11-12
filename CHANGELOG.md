# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.4] — 2026-11-12

### Changed

- **十一个 persona 提示词的 markdown 排版规范化。** 对 `personas/*.md` 补齐标题、围栏代码块与列表块前后的空行，删除行尾多余空白；字符内容未做机械改写，围栏代码块内部逐字节保持原样。`atlas.md` 只含排版改动。
- **`<caveman-mode>` 段落的中文化。** `explore.md`、`metis.md`、`momus.md`、`multimodal-looker.md`、`oracle.md`、`sisyphus-junior.md` 六份 persona 的默认风格段改为中文表述；`hephaestus.md` 去掉行尾的 token 削减比例说法；`prometheus.md` 与 `sisyphus.md` 的同一段落重写，`sisyphus.md` 的「具名工具」升级为二级标题。
- **门禁重钉。** `tools/check-package.mjs` 的 `PERSONA_TABLE` 十一个字节数按新内容重钉，`MACHINE_PATH_ALLOWLIST` 十条行号随空行插入位移（`librarian.md` 229 → 252，`prometheus.md` 八条 → 361/371/382/398/414/425/441/453，`sisyphus.md` 52 → 54），条目数仍为 10。

## [0.4.3] — 2026-11-11

### Changed

- **Prometheus 规划 persona 的子代理派发纪律改为常驻 lane 复用。** 新增「审查 lane 常驻复用」段（与 `atlas.md:194-278` 对齐），把审查阶段的三条 lane（metis / momus / oracle）固定为整场会话复用，并把冷启收紧为「两类语境 + 五项具名理由 + 每 lane 每计划 ≤1 次预算」；同时明确执行类 lane（`subagent_sisyphus` / `subagent_hephaestus` / `subagent_sisyphus_junior`）在本 persona 下首次创建次数恒为 0。删除了三处悬空的「强制条款」引用、两处会把单张失败票放大成整轮全量的重跑表述，并补齐 metis 双角色同一 child、探索期角度复用、名册以 `list_agents` 为唯一权威等口径。
- **门禁重钉。** `tools/check-package.mjs` 的 persona 字节钉与 A14 机器路径行号按新内容重钉（`personas/prometheus.md` = 50100 B；八条行号 354/364/375/391/407/418/434/446）。

## [0.4.2] — 2026-11-10

### Fixed

- **Re-issues 0.4.1 under a version tag whose release passed triple review, CI and the
  isolated-profile check.** No code differs from 0.4.1: the skill registrations in
  `caveman-autoload.mjs` and `tool-gate.mjs` already pass `source: 'bundled'`, and both
  `caveman-ultra` and `mcp-lazy-load` load through the real `SkillRegistry.get()`.
- **`0.4.0` is deprecated from this release's workflow.** The release job now runs
  `npm deprecate @tacrine_f/oh-my-dsh-omo-fork-chs@0.4.0`, so an install that pins the broken
  version is told to move to `0.4.2`. The step is `continue-on-error: true`: a deprecate
  failure must never fail a release that already published successfully.

## [0.4.1] — 2026-11-09

### Fixed

- **Registered skills now carry the `source` field, so they can be loaded.** Both
  `caveman-autoload.mjs` (the `caveman-ultra` skill) and `tool-gate.mjs` (the bundled
  `mcp-lazy-load` skill) called `ctx.skills.register({ name, description, content })` without
  a `source`. The registry accepts that shape and lists the entry in the catalog, but the
  load path validates `source` as a string and throws
  `loaded skill "<name>" source must be a string`. The symptom was a skill that always appeared
  in the catalog and could never be loaded — in particular the caveman skill that is supposed
  to load automatically. Both registrations now pass `source: 'bundled'`, matching the four
  official providers that register skills (`dsh-skill-badge`, `dsh-skill-office`,
  `dsh-creation-recommendations`, `dsh-plugin-recommendations`).
- **Two assertions cover the missing field.** `test/caveman-loader.test.mjs` and
  `test/tool-gate.test.mjs` now assert that the object handed to `skills.register` carries a
  non-empty `source`, and removing it turns each assertion red.

## [0.4.0] — 2026-11-08

**What this release is for.** The omo-fork preset now keeps MCP servers masked until a
workspace asks for them, so a session no longer carries every mounted server's tool catalog
as schema weight on every request — and which servers a workspace may use is decided in that
workspace, not in this package.

### Added

- **`tool-gate`** — a module mounted inside the preset's plugin list that discovers the MCP
  inventory from `@deepseek-ai/dsh-mcp-client` loader entries (`config.serverName`, falling
  back to the `panel-mcp-<name>` id shape, `disabled: true` skipped) and keeps their tools
  masked by default. The mask is applied on **each agent's own scope** through a child
  plugin, not from the preset's standing scope, so one session's choice cannot leak into
  another's.
- **Workspace policy from `<cwd>/.dsh/mcp-servers.json`** — `allow` and `deny` lists. `deny`
  **only overrides when the same server is listed in both lists**; a server that sits in
  `deny` alone is "configured but not yet authorized" and `enable_mcp` lifts it into `allow`
  (a permanent grant that survives restarts and reconciles). A hard block has to be written
  into **both** `allow` and `deny`. A missing file, or an empty `allow` with no `deny` entry
  to lift, makes zero MCP servers available. A server that is configured but not connected
  still appears with `connected: false`.
- **The workspace config is created and maintained automatically.** The first `agent/created`
  for a working directory writes `<cwd>/.dsh/mcp-servers.json` when it is missing, denying
  every discovered server; a server added to the deployment later is appended to `deny` on
  the next reconcile. A hand-written file is never overwritten (unknown keys like `$comment`
  survive), and an unreadable one is logged and left alone.
- **`enable_mcp` / `disable_mcp` write through to the config.** Enabling moves the server from
  `deny` to `allow` on disk, disabling moves it back, so the choice is durable and a later
  reconcile cannot undo it. Enabling a server exposes its tools from the next step; a hand
  edit to the config file is picked up on the next meta-tool call.
- **`list_mcp_servers` names the candidates.** When the workspace authorizes nothing yet but
  servers are discovered, the tool lists them as `enable_mcp` arguments instead of pointing
  at a config file that already exists.
- **The execution presets are gated too.** `preset-omo-sisyphus-junior`, `preset-omo-hephaestus`
  and `preset-omo-sisyphus` now mount `tool-gate`, so subagent sessions inherit the same
  default-masked MCP behavior as the main preset.
- **`test/tool-gate.test.mjs`** — drives discovery, the workspace policy, the per-agent mask,
  the three meta tools and the auto-config write-through through recording contexts.
- **`skills/mcp-lazy-load/SKILL.md` bundled and auto-registered** — the skill ships in the
  package's `skills/` directory and is registered via `tool-gate.mjs`'s new `registerSkill()`
  export at plugin startup. `mcp-lazy-load` appears in the host skill catalog as soon as one
  of the four tool-gate presets is active.

### Changed

- **The plugin row no longer carries a `config` block.** The gate reads the workspace's
  `mcp-servers.json` and the loader's own entries, so the patch row is `- id:` and `name:`
  only. The repository and baseline patches are 952 lines, the bundle's is 876.
- **The baseline, the patch and the port tooling now count thirteen pre-port package-name
  occurrences and thirteen rewrite sites.** The new plugin row is the third non-persona
  package-name site, after the self-reference and the header comment.

## [Unreleased]

**What this is for.** `A5` checks that `files[]` *contains* every entry in `REQUIRED_FILES`, but no
assertion checked that those entries *resolve to anything*. **`A19`** closes that gap: for every
`files[]` entry that names a directory, the tool now requires at least one path under it that is
both tracked and present on disk.

**The hole, measured rather than argued.** With `"test/"` still listed in `files[]`, `git rm -r test`
was the silent state: the old tool exited **0** with verdict OK, `prepack` passed, `npm pack` yielded
**28** entries instead of 34, and `node --test` reported **0 tests at exit 0** — the package shipped
without its test suite and nothing went red. A plain `rm -r test` that leaves the index intact was
**already** red before this change, reached through `A14`'s machine-path scan reading a tracked path
that is no longer on disk (`cannot read test/check-package-negative.test.mjs: ENOENT`); that state
was never green. So in that second state `A19`'s contribution is not that it turns a green gate red,
but that the failure is now **about the missing directory** rather than about a missing file, and
that it keeps working if `A14`'s list of files it reads by name ever changes.

**What it does not prove.** It proves that at least one path under a `files[]`-named directory is
both tracked and present on disk. It does not prove the directory is non-empty beyond that, nor that
its contents match what `files[]` implies, and it does not cover a `files[]` entry naming a missing
**file** — the known files are covered elsewhere (`A4`/`A6` for the personas, `A17` for the two
copied modules, `A9`/`A12`/`A13`/`A15` for the licence documents and the patch).

**Counts.** The tool now runs **22** structural and license assertions rather than 21, and the test
suite totals **56** tests rather than 55.

## [0.3.0] — 2026-11-04

**What this release is for.** The package now ships its own caveman skill and mounts the module that
makes it authoritative, so a deployment no longer depends on an out-of-band skill directory and an
`AGENTS.md` paragraph to get the behaviour.

### Added

- **`caveman-autoload`** — a module mounted by a root-layer (host plane) row of the bundle patch. It
  registers the system prompt section `caveman:loader` at order 60 and registers the `caveman-ultra`
  skill in the runtime catalog; the section text is a provider, so the level is read per assembly
  rather than frozen at mount.
- **`skills/caveman-ultra/`** — the shipped skill, defaulting to **ultra**. Its description is parsed
  out of the file's own frontmatter rather than duplicated in the module, so the catalog entry and
  the file cannot disagree.
- **`test/caveman-loader.test.mjs`** — drives `apply()` through a recording context and asserts the
  two registrations, the description equality, the section order, and that the text carries no prompt
  variable and no slash command.

### Changed

- **The caveman skill in force is now named `caveman-ultra`, not `caveman`.** A pre-existing skill
  named `caveman` in the environment is not overwritten; the loader text names it as the copy this
  deployment has superseded (its text defaults to `full`) and directs that `caveman-ultra`'s rules
  apply. Anything that selected the old name by hand now selects the new one.
- **Levelling is prompt-only.** A level declared in the request, or `OMO_CAVEMAN_LEVEL` in the
  deployment, changes the level named in the prompt text. No claim is made that the resulting output
  differs per level: that behaviour has not been exercised in this release.

## [0.2.3] — 2026-10-31

**What this release is for.** 0.2.2 wrote an unregistered prompt variable into the persona suffix,
and shipped two tests that make this class of bug visible before it can reach a session.

### Fixed

- **`{{cwd}}` in the persona suffix.** `dsh` registers exactly two prompt variables for a persona
  section — `provider` and `model` — and `{{cwd}}` was not one of them, so prompt assembly threw
  `unknown prompt variable "{{cwd}}" in section "deployment:persona-suffix"` and a session could
  not start. The suffix is plain prose again — `Your working directory is the session workspace.` —
  matching the upstream bundle verbatim. `baseline/cordis.patch.yml` was re-derived with
  `node tools/derive-baseline.mjs` rather than hand-edited, so the round trip still holds.

### Added

- **`test/prompt-variable-guard.test.mjs`** — a static guard over `cordis.patch.yml` and
  `baseline/cordis.patch.yml`: every `{{name}}` in either text must be one the runtime registers.
- **`test/real-install-verify.test.mjs`** — installs the package into a throwaway, isolated
  `DSH_HOME` from a `file`, `github` or `npm` source and asserts against the **installed** artifact
  rather than the working copy.

Verified on DSH `0.2.2-alpha.2` by materialising the `v0.2.3` tag tree and the published `0.2.3`
tarball into an isolated profile and composing the config there, while the package-manager install
path (`dsh plugin … --profile … add -w github:…#v0.2.3` and `npm@0.2.3`) has not been exercised.

## [0.2.2] — 2026-10-31

**What this release is for.** The Chinese `README.md` is rewritten for readability. The 0.2.1
document was a close translation of the English one, and it kept that text's long nested clauses,
its mid-sentence line breaks and its habit of carrying a whole enumeration inside one parenthetical.
The facts, the ordering, the headings and every anchor are unchanged; what changed is the sentence
structure and three stale numbers.

**Documentation-only release.** No persona prose, orchestration doctrine, cordis patch, runtime
module or license term changes.

### Changed

- **Sentences split and un-nested.** The 22-assertion enumeration in the verification section, the
  peer-range discussion in Known issues, and the licence and lineage sections are now short
  sentences with the same content. Nothing was added, and no claim was strengthened: "可能" stays
  "可能", "计划" stays "计划".
- **Three stale numbers corrected.** The patch is **946** lines, not 540, because the 0.2.0 migration
  grew it from 540 to 946. The declaration is **10** preset blocks carrying **173** `- id:` entries,
  not one 40-row declaration, for the same reason. The assertion count is no longer stated as a
  number: the tool reports it per run, and the previously published figure of 22 did not match what
  the tool reports here.
- **English loanwords replaced where Chinese reads better.** `row` became 条目, `declaration` became
  声明. Identifiers, field names and error strings are untouched.

## [0.2.1] — 2026-10-31

**What this release is for.** The repository now ships **one** README, in Chinese. `README.md`
carries the Simplified Chinese text that used to live in `README.zh.md`, so the GitHub landing page
and the npm package page both open in Chinese — which is what a `-chs` fork should do. The English
document is **not** retained as a second file: it is gone, and `README.zh.md` is deleted rather than
left as a pointer, because two files carrying the same content drift apart by construction.

This is a **documentation-only** release. No persona prose, no orchestration doctrine, no cordis
patch, no runtime module and no license term changes. The MIT scope list in `LICENSE-MIT.md`, the
scope map in `NOTICE.md`, the `files[]` array, and the four scope lists inside
`tools/check-package.mjs` all lose exactly one entry — `README.zh.md` — because that path no longer
exists; every other byte of those documents is unchanged.

### Changed

- **`README.md` is now the Chinese document.** Its content is the former `README.zh.md`, unchanged
  except for removing `README.zh.md` from the MIT scope list it quotes.
- **`README.zh.md` is removed.** The nine places that named it were updated in the same commit:
  `README.md`, `package.json` (`files[]`), `LICENSE-MIT.md`, `NOTICE.md`, and five lists in
  `tools/check-package.mjs` (`REQUIRED_FILES`, `ANCHOR_DOCUMENTS`, the machine-local package-name
  predicate chain, `EXPECTED_SCOPE.mit`, `MIT_ANCHORS`). The three mentions in older `CHANGELOG.md` entries are left
  verbatim: they record what was true when those releases shipped, and editing them would falsify
  the history rather than fix anything.

## [0.2.0] — 2026-10-30

**What this release is for.** The 9 subagent rows are migrated from the old
`persona: !!js readFileSync(...)` + `toolFilter` pattern to 9
`dsh-agent-preset` sub-presets (`omo-explore` through `omo-multimodal-looker`)
using `agentPreset`, which is the supported mechanism in cordis `^4.0.1`.
The duplicate `list-agents` subpath was removed, and atlas gained a
transport-failure reuse rule. The bundle is now verified on two 0.2.x builds
rather than one — `0.2.1-alpha.1` with the 0.1.x patch, `0.2.2-alpha.2` with
this patch.

**Requires DSH ≥ 0.2.2.** The 9 subagent rows now select their preset with
`agentPreset`, a field that only the 0.2.2 `dsh-tool-subagent` reads; 0.2.2 also
removed the `persona` and `toolFilter` fields the old rows used. On DSH 0.2.1 and
earlier the rows still mount, but `agentPreset` is accepted and then never read
(the schema merges unknown keys instead of rejecting them), so the child gets
**no persona and no tool restriction** and inherits the parent's full toolset: a
read-only child such as explore or oracle would silently gain write and
subagent-spawning tools. That is a silent privilege escalation, not a mount
failure. The declared peer range still admits older 0.2.x builds, so this is a
functional requirement documented here rather than a semver constraint.

No persona prose or orchestration doctrine changes. What changes is how each
subagent's tool set is expressed: the `toolFilter` deny lists are replaced by
per-preset plugin lists, and the patch grows from 540 to 946 lines because each
sub-preset repeats its `!!js readFileSync(...)` expression from the old
`persona:` field.

### Changed

- **Cordis migration — `persona`/`toolFilter` → `agentPreset`.** The 9 subagent
  rows (`tool-subagent-explore` through `tool-subagent-multimodal-looker`)
  no longer carry a `persona:` field or a `toolFilter:` list. Instead, 9 new
  `dsh-agent-preset` blocks are appended to the patch (`omo-explore` order 100
  through `omo-multimodal-looker` order 108), each setting `dsh-persona`
  `prefix:` to the same `!!js readFileSync(...)` expression. The `toolFilter`
  was dropped: a preset's plugin list *is* its tool catalog, so the deny list
  becomes structural. Three template groups (read-only A, writable B, vision C)
  follow the same pattern as `preset-tri-*`. The `persona:` field is removed
  from the 9 rows, and `agentPreset` on each row references the corresponding
  sub-preset id. See Todo 2 in `notepads/handover-v0.2.0-upgrade/learnings.md`.
- **atlas.md: transport-failure reuse rule added.** A new section
  `### 网络/提供商波动 → 复用同一 child，不冷启（MUST）` was inserted before the
  existing `### 禁止静默冷启` ban, so atlas reuses the same child on provider
  or network fluctuations instead of starting a cold replacement.

### Fixed

- **Removed duplicate `dsh-tool-subagent-control/list-agents` row.** The root
  `dsh-tool-subagent-control` entry already calls `registerListAgents(ctx)`, so
  the second row would double-register `list_agents`/`send_message`/`interrupt_agent`.
  Deleting it matches the upstream reference (`tri-agent`'s patch has exactly one
  `tool-subagent-control` row).

### The package check tool was updated for the new patch shape

`tools/check-package.mjs` A16 now expects 946 patch lines and 173 `- id:` rows
(instead of 540 and 40), and the `EXPECTED.version` moved to `0.2.0`.
`baseline/cordis.patch.yml` was re-derived, so `node tools/verify-patch.mjs`
reports `verdict: "IDENTICAL"` again.

### Verification extended to dsh 0.2.2-alpha.2

0.1.1 was verified on `0.2.1-alpha.1` — one 0.2.x build. This release was also
verified on `0.2.2-alpha.2` (the published DSH 0.2.2 alpha build) by a real
`--dump-config` run against a profile that registers this package as a bundle:
with no exemption present, the run exits 0, writes 0 bytes to stderr, and the
dump carries the preset with all 9 persona anchors and all 9 sub-presets. That
is still a claim about mount and anchor paths, not about persona bytes or preset
behaviour — no agent was invoked.

## [0.1.1] — 2026-10-14

**What this release is for.** 0.1.0 declared peer ranges that stopped below dsh 0.2, so a dsh 0.2.x
host reported the bundle as incompatible, skipped it, and still exited 0 — a failure visible only on
stderr. **0.1.1 widens those ranges so the bundle mounts on dsh 0.2.x with no exemption**, which is
the change most consumers will care about. It also adds two checks to the package tool and corrects
several documentation statements. Nothing in the preset's behaviour changes: the preset id, its
`order`, the personas and the patch are the same as 0.1.0.

Two gates were added to `tools/check-package.mjs` after 0.1.0 was released. They close
gaps that the existing assertions could not see, and they change what the tool reports:
it now runs **21** structural and license assertions rather than 19. The test suite is
unchanged at 55 tests, because the new gates are asserted by the tool itself and by the
existing negative-path cases rather than by new test files.

### Added

- A content-hash gate on `index.js` and `plan-aware-persona.mjs`: the tool asserts the
  SHA256 of each against a frozen value. A byte count is not enough for these two,
  because it is sensitive to length only — a swapped character, a changed identifier or
  a reordered token leaves the length identical and the file different, which is exactly
  the class of edit a formatter makes to a `.mjs`. Measured: flipping one byte of
  `plan-aware-persona.mjs` leaves it at 3685 bytes and changes its hash.
- An anchor-resolution gate: every internal markdown anchor — a link whose target begins
  with a `#` — in `README.md`, `README.zh.md`, `CHANGELOG.md` and `NOTICE.md` must
  resolve to a heading slug in the same document,
  using GitHub's own slug rule (lowercase; strip everything that is not a word
  character, a hyphen or whitespace; keep CJK; spaces to hyphens; repeated headings
  deduplicated with `-1`, `-2`). The rule was verified against `github-slugger` 2.0.0 on
  all 38 headings of the four documents with 0 disagreements.

### Fixed

- `README.zh.md`'s two badge links pointed at `#license` and `#peer-model` while the
  document's headings are `## 许可` and `## Peer 模型`, so both links landed nowhere.
  The links now match the headings. The headings were not renamed: they are the
  document's structure, and the English document's equivalent links were already
  correct.
- The `.gitattributes` scope entry was named in `NOTICE.md`'s mit-scope block and in the
  tool's expected scope set, but missing from the anchor list that resolves each entry
  against the block claiming it. It is now anchored like its ten siblings.
- `check-package.mjs`'s untracked-file failure message named the same directory once per
  spelling when `files[]` listed one directory under two spellings, so a reader saw
  `test/, test/` and had to work out that these are one directory and not two. Each
  offending directory is now named exactly once.

### The peer range now covers dsh 0.2.x — verified on one 0.2.x build

The 24 `@deepseek-ai/dsh-*` peer ranges were widened from `>=0.1.7-rc.2 <0.2.0` to:

```
>=0.1.7-rc.2 <0.2.0 || >=0.2.0-0 <0.3.0-0 || >=0.2.1-alpha.1 <0.3.0-0
```

The first clause is the range inherited from the upstream fork, so the previously supported line is
unchanged; the second and third add the 0.2 line. `@deepseek-ai/cordis` stays at `^4.0.1`. The
package `version` moves from `0.1.0` to `0.1.1` in this release, which is what carries the widened
ranges to consumers.

**Why the change.** The host decides whether a profile bundle loads with a semver range check over
the peers named `@deepseek-ai/dsh` or `@deepseek-ai/dsh-*`, evaluated with prereleases included
(`{ includePrerelease: true }`). The old range rejects `0.2.1-alpha.1`, so on that runtime the host
reported the plugin as incompatible, skipped the bundle, and still exited 0 — a silent failure
visible only on stderr. The widened range accepts that runtime, so no exemption is needed for it.

**What was verified, by experiment rather than by reading the range back.** On `0.2.1-alpha.1` —
the only 0.2.x build available, so this is one build and not a general claim — with the working tree
mounted as a local bundle and **no exemption present in the profile**, a `--dump-config` run exits
0, writes **0 bytes to stderr**, and carries the preset with `order: 11` and all **nine** persona
anchors, each resolving to a real file inside the mounted package. The same package with the old
ranges produces 1884 bytes of stderr and no anchors, so the widening is what removed the skip.

**What that does not prove.** It proves the anchor *paths* resolve, not that a persona's *bytes* are
intact — a persona that still existed but had been truncated would pass the same check. It proves
structural facts, not that the preset does anything, because no agent is invoked. And it is one
build.

**The re-entry condition is `0.3.0-alpha.1`.** The widened range rejects it, so a future runtime in
that line is skipped again, with the same incompatibility warning on stderr and the same exit 0.
The exemption remains documented and remains needed for that case and for the published `0.1.0`,
whose manifest still carries the old narrower range.

## [0.1.0] — 2026-10-11

0.1.0 is the first release of this repository; no earlier version was published. It carries the
package `@tacrine_f/oh-my-dsh-omo-fork-chs`, the `tri-agent` agent preset (Atlas orchestration plus
Prometheus planning) as a Simplified-Chinese fork, packaged for DeepSeek Harness as a Cordis bundle.
The preset id is `omo-fork-chs` and its `order` is `11`, so it sits beside
`tri-agent` and does not change the default preset. Having no predecessor on npm, it has no older
artifact to compare against and no upgrade path from one.

### Added

- The publishable bundle patch `cordis.patch.yml`: the preset declaration with its `plugins:` list.
  540 lines, 40 `- id:` rows including the 9 anchored subagent persona rows, and 11 rewritten sites.
- `plan-aware-persona.mjs`: the package entry, owning the single `deployment:persona-prefix` slot
  and choosing Atlas or Prometheus per assembly from the public `plan` session projection.
- `index.js`: the package root, intentionally empty and exported as `"."`, because the bundle's
  behaviour lives in `cordis.patch.yml` and in `./persona`.
- `personas/`: 11 persona documents, translated into Simplified Chinese. They are byte-identical to
  the source bundle they were vendored from.
- `baseline/`: a frozen snapshot of the pre-port patch, plus a sidecar that states what it proves
  and what it does not.
- `tools/`: the four zero-dependency CLIs (`port-patch.mjs`, `verify-patch.mjs`,
  `derive-baseline.mjs`, `check-package.mjs`) and the shared rules module `tools/lib/rewrites.mjs`.
- `test/`: the zero-dependency `node:test` suite, 55 tests.
- The CI and release workflows under `.github/`.
- The three licence documents: `LICENSE-MIT.md`, `LICENSE-SUL-1.0.md` and `NOTICE.md`.

### The documented rewrites

The bundle this fork was derived from was a link install whose patch named a machine-local package,
so its relative anchors resolved against the profile directory and it could not be installed
anywhere else. Turning it into a publishable patch applies exactly three rewrites, and
`tools/verify-patch.mjs` asserts exactly the same three:

1. **The package self-reference** — the plugin row `name: '<pkg>/persona'` is re-pointed at this
   package (one occurrence), so the persona plugin resolves from the installed package rather than
   from one machine's profile.
2. **The nine persona path anchors** — every
   `fileURLToPath(new URL('./node_modules/<local pkg>/personas/<file>', baseUrl))` becomes
   `join(dirname(createRequire(baseUrl).resolve('<pkg>/package.json')), 'personas', '<file>')`, for
   the 9 anchored subagent rows.
3. **The header comment** — the single occurrence of the pre-port package name in the patch's
   header comment is rewritten to this package's name.

**No `agentOptions` stripping is involved.** The chs patch carries no `agentOptions` key at all: the
token appears only in prose, once in the header comment and once inside the Chinese `description`
text, and never as a YAML key. The English fork needed such a step, and this one must not grow a
no-op one.

`git diff --no-index -U0` between the source patch and the published one yields exactly 11 hunks,
each one deletion and one insertion on the same line number, which is what makes 11 the number of
rewrite sites.

### License

This repository is dual-licensed, and the two licences are not alternatives you may choose between:
each file is covered by exactly one of them. It is not MIT-only.

- `LICENSE-SUL-1.0.md` is the byte-for-byte copy of the upstream terms, SHA256
  `B61AC928F152D13517328263E6BEE9175B928F9AB696A2D2CA2B6CFD961DDC32`, and it covers the
  upstream-derived content: `personas/`, `cordis.patch.yml`, `plan-aware-persona.mjs`, `index.js`
  and `baseline/cordis.patch.yml`.
- `LICENSE-MIT.md` covers our own work: `tools/`, `test/`, `.github/`, `baseline/README.md`,
  `package.json`, `.gitignore`, `.gitattributes`, `README.md`, `README.zh.md`, `CHANGELOG.md` and
  `NOTICE.md`.
- `NOTICE.md` is the authoritative declaration: the prominent modification notice, the upstream
  attribution, the free-of-charge and non-commercial statement, the unofficial-fork statement, and
  the machine-readable licence scope mapping.

The upstream terms are the **Sustainable Use License 1.0**, which is a **source-available** licence
and **not** an OSI-approved open source licence. It permits use, copying, distribution and derivative
works only for your own internal business purposes, or for non-commercial or personal use, and it
permits distribution only if you do so **free of charge** and for **non-commercial** purposes. It is
**non-sublicensable**, which is why the MIT licence covering our own files cannot be extended over
the upstream-derived ones, and why `LICENSE-SUL-1.0.md` must travel with every copy.

The upstream licence relied upon is the Sustainable Use License 1.0 of `oh-my-openagent` (formerly
`oh-my-opencode`), as received at upstream commit `3c711483856207ef530c09d062fa9077c225debbe`
(upstream version 5.0.1).

This repository is an **unofficial fork**. It is not affiliated with, endorsed by, or sponsored by
the upstream project or its author. `package.json` `license` is `SEE LICENSE IN NOTICE.md`, because
SUL-1.0 is not an SPDX identifier and this package is dual-licensed. `files[]` ships
`LICENSE-MIT.md`, `LICENSE-SUL-1.0.md` and `NOTICE.md` instead of a bare `LICENSE`, because a bare
`LICENSE` would make GitHub badge this SUL-1.0-dominant repository as MIT.

### Notes

- Every `@deepseek-ai/*` package the patch mounts is a `peerDependency`: 24 entries ranged
  `>=0.1.7-rc.2 <0.2.0`, plus `@deepseek-ai/cordis` at `^4.0.1`, 25 in total. There are no regular
  runtime `dependencies` and no `devDependencies`, so the package stays peer-only and the check
  pipeline stays zero-dependency.
- That range excludes dsh 0.2.0 and above, matching the upstream fork. On such a host the plugin is
  reported as incompatible, the bundle is **skipped**, and the command **still exits 0**, so the
  failure is silent unless stderr is read: the preset never appears in a config dump. A consumer on
  that version must either use a dsh inside the declared range or grant the exact-version exemption
  with `dsh plugin allow-version "<pkg>@<version>" --dsh-version <version> --accept-risk`, which is
  the host's own escape hatch and carries the risk the host warns about. On a runtime inside the
  declared range the preset mounts and composes correctly, including all nine persona anchors. This
  is inherited from the upstream fork and is not specific to this localization. **Superseded — see
  the Unreleased section "The peer range now covers dsh 0.2.x": the 24 peer ranges were widened
  after this section was released, so the sentence above describes 0.1.0 as published and no longer
  describes the current manifest.**
- `exports` keeps `"./package.json"`, because the nine persona anchors locate the package directory
  through `createRequire(baseUrl).resolve('<pkg>/package.json')`. Without that export they fail with
  `ERR_PACKAGE_PATH_NOT_EXPORTED` at mount time.
- The published patch sets **no** default preset and carries no machine-local rows. Setting
  `agent-preset-registry.default: omo-fork-chs` is a post-install edit, as is pinning a model route
  for the multimodal subagent row.
- `baseline/` is a **frozen snapshot**, not an independent original. It is byte-identical to the
  source patch it was derived from, and the derivation proves the port is **reproducible**; it does
  **not** prove the content is correct. The prior evidence for content correctness is the
  machine-local `omo-fork-chs-*` evidence set, whose checkers are not shipped with this package.
- This repository coexists with the English fork `Tacrine/oh-my-dsh-omo-fork`. They are separate
  repositories with separate packages, preset ids and scope mappings, and neither affects the other.
- A missing or empty persona file fails the mount by design, naming the file in the error.

[Unreleased]: https://github.com/Tacrine/oh-my-dsh-omo-fork-chs/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/Tacrine/oh-my-dsh-omo-fork-chs/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Tacrine/oh-my-dsh-omo-fork-chs/releases/tag/v0.3.0
[0.2.3]: https://github.com/Tacrine/oh-my-dsh-omo-fork-chs/releases/tag/v0.2.3
[0.2.0]: https://github.com/Tacrine/oh-my-dsh-omo-fork-chs/releases/tag/v0.2.0
[0.1.1]: https://github.com/Tacrine/oh-my-dsh-omo-fork-chs/releases/tag/v0.1.1
[0.1.0]: https://github.com/Tacrine/oh-my-dsh-omo-fork-chs/releases/tag/v0.1.0
