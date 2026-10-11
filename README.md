# oh-my-dsh-omo-fork-chs

[![npm version](https://img.shields.io/npm/v/@tacrine_f/oh-my-dsh-omo-fork-chs)](https://www.npmjs.com/package/@tacrine_f/oh-my-dsh-omo-fork-chs)
[![license: SUL-1.0 (content) + MIT (packaging)](https://img.shields.io/badge/license-SUL--1.0_(content)_%2B_MIT_(packaging)-orange)](#license)
[![node](https://img.shields.io/badge/node-%5E22.19.0%20%7C%7C%20%3E%3D24.0.0-blue)](#peer-model)

The **Simplified-Chinese unofficial fork** of the `tri-agent` agent preset, packaged for
[DeepSeek Harness](https://www.npmjs.com/package/@deepseek-ai/dsh) as a publishable Cordis
bundle. Its preset id is `omo-fork-chs` and its `order` is `11`, so it sits beside `tri-agent`
rather than replacing it: this package **does not change the default preset** and does not change
which preset a session picks. Only the persona prose is translated; the toolchain composition and
the orchestration doctrine are the upstream design.

The preset gives an agent a two-mode identity and a full coding toolchain:

- **Atlas** is the standing orchestrator. It does not implement, verify, or review; it reads the
  plan, the notepad and the evidence, does the bookkeeping, and delegates every unit of work to a
  named subagent.
- **Prometheus** is the planning doctrine. While a session is in plan mode (`/plan`), the identity
  swaps to Prometheus for the whole planning session and then swaps back. A single plugin,
  `plan-aware-persona.mjs`, owns the one `deployment:persona-prefix` slot and chooses the text per
  assembly by reading the public `plan` session projection. The `planMode` service is deliberately
  not injected: it lives inside the `isolate: { planMode: true }` realm, so injecting it from
  outside would never resolve.

Around that identity the preset mounts the coding toolchain: filesystem and shell tools, background
jobs, skills, goals, plan mode, compaction, delegation and workflows. The declaration carries 40
`- id:` rows, of which 9 are anchored subagent rows (explore, librarian, oracle, momus,
multimodal-looker, sisyphus-junior, metis, hephaestus, sisyphus). The package ships **11 persona
files**; the plugin reads `atlas.md` and `prometheus.md` itself, and the other 9 are anchored to the
subagent rows.

## What ships

| File | Purpose |
| --- | --- |
| `cordis.patch.yml` | The published bundle patch: the preset declaration (`id: preset-omo-fork-chs`, `config.id: omo-fork-chs`, `config.name: 'Oh My DSH Chs - OMO Fork'`, `order: 11`) and its `plugins:` list. 540 lines, 11 rewritten sites. |
| `plan-aware-persona.mjs` | The package entry that registers the plan-aware persona prefix and the configured suffix. Exported as `./persona`. |
| `index.js` | The package root. It is intentionally empty: the bundle's behaviour lives in `cordis.patch.yml` and in `./persona`. |
| `personas/` | 11 persona documents, translated into Simplified Chinese. |
| `baseline/` | A frozen snapshot of the pre-port patch plus a sidecar that explains what it does and does not prove. |
| `tools/` | The port, verification, baseline and package-check CLIs. |
| `test/` | The zero-dependency test suite, run with `node --test`. |
| `LICENSE-MIT.md` | The MIT terms that cover our own work. |
| `LICENSE-SUL-1.0.md` | The verbatim upstream Sustainable Use License 1.0 terms, which cover the upstream-derived content. |
| `NOTICE.md` | The modification notice, the upstream attribution, and the machine-readable license scope mapping. |

The patch mounts the following peer packages, which DSH provides:

`@deepseek-ai/dsh-agent-preset`, `dsh-agent-instructions`, `dsh-tool-bash`, `dsh-tool-pwsh`,
`dsh-tool-fs`, `dsh-tool-fs-search`, `dsh-tool-jobs`, `dsh-skill-filesystem`, `dsh-tool-skill`,
`dsh-command-goal`, `dsh-tool-goal`, `dsh-plan-mode`, `dsh-compaction-basic`, `dsh-command-compact`,
`dsh-compaction-tool-result-pruner`, `dsh-tool-subagent-control`, `dsh-tool-subagent`,
`dsh-workflow-ptc`, `dsh-tool-workflow`, `dsh-tool-ralph`, `dsh-tool-ask-user`, `dsh-tool-todo`,
`dsh-tool-web`, `dsh-tool-present`, plus `@deepseek-ai/cordis`. That is 25 peer dependencies in
total.

## Install

Installation is **two explicit steps**. Step 1 installs the dependency; step 2 tells the profile to
load it. Both are required, and `dsh` is not assumed to be on your `PATH`.

### Step 1: install the package into the profile

Point the CLI at your DSH checkout's bin file, and forward the install to the profile:

```powershell
node "<dsh bin>" plugin --profile <profile> add -w @tacrine_f/oh-my-dsh-omo-fork-chs
```

For example, on a checkout whose runtime is `<dsh runtime>`, `<dsh bin>` is
`<dsh runtime>\@deepseek-ai\dsh\lib\bin.js`, so:

```powershell
node "<dsh runtime>\@deepseek-ai\dsh\lib\bin.js" plugin --profile web add -w @tacrine_f/oh-my-dsh-omo-fork-chs
```

This runs pnpm inside `$DSH_HOME\profiles\<profile>\`, so it writes a `dependencies` entry. **It
does not touch `dsh.profile.bundles`.**

### Step 2: add the package to `dsh.profile.bundles` and restart

Open `$DSH_HOME\profiles\<profile>\package.json` and add the package name to the profile's
`dsh.profile.bundles` array:

```jsonc
{
  "dsh": {
    "profile": {
      "bundles": [
        // ...your existing bundles...
        "@tacrine_f/oh-my-dsh-omo-fork-chs"
      ]
    }
  }
}
```

Then **restart the Host and start a new session.** A live agent keeps the composition it booted
with, so an already-running session will not pick the preset up; a new session is required.

### Verify the install composed

```powershell
$env:DSH_HOME = "<dsh home>"
node "<dsh bin>" --profile <profile> --dump-config
```

The output should contain a `preset-omo-fork-chs` row whose `name` is
`@deepseek-ai/dsh-agent-preset`, whose `config.id` is `omo-fork-chs`, whose `config.name` is
`'Oh My DSH Chs - OMO Fork'` and whose `config.order` is `11`, plus nine `personas` expressions
resolving through this package. `--dump-config` prints the raw `!!js` expression text, so the nine
anchors appear as the `resolve('<pkg>/package.json')` form rather than as resolved filesystem
paths.

## Post-install edits you may need

The published patch ships **only** the portable preset declaration. Two things that were local to
the machine this fork came from are deliberately **not** shipped, so you may want to re-add them
yourself:

1. **Making `omo-fork-chs` your default preset.** The published patch does **not** set a default
   preset, and this package never forces one. If you want this preset to be the default, set the
   registry row yourself in your own profile or overlay patch:

   ```yaml
   - id: agent-preset-registry
     config:
       default: omo-fork-chs
   ```

   (`@deepseek-ai/dsh-web-app` inserts that row with `default: standard`; the row above replaces the
   whole config, so only the default changes.)

2. **Giving `subagent_multimodal_looker` a model route.** The bundle this fork was derived from
   carried a machine-specific `provider` and `model` route for that row, and that route is **not
   portable**, so the published patch carries no `agentOptions` row at all. Without one the
   multimodal subagent inherits the deployment's route. To pin one, add an `agentOptions` block to
   that row in your own overlay:

   ```yaml
   - id: tool-subagent-multimodal-looker
     name: '@deepseek-ai/dsh-tool-subagent'
     config:
       # ...the shipped config...
       agentOptions:
         provider: <your provider>
         model: <your model>
   ```

## Failure mode: it fails loud on purpose

`plan-aware-persona.mjs` reads its persona prose from disk at mount time. A **missing or empty
persona file fails the mount**, naming the file in the error:

```
plan-aware-persona: cannot read persona "file:///.../personas/atlas.md"
plan-aware-persona: persona "file:///.../personas/atlas.md" is empty
```

That is deliberate. An empty persona prefix would silently strip the agent's identity, so a mount
error that names the file is far easier to act on than an agent that quietly lost its instructions.

## Peer model

Every `@deepseek-ai/*` package the patch mounts is declared as a **`peerDependency`**, never as a
regular `dependency`. DSH provides them; the bundle must not install its own copies. Peer ranges are
pinned as `>=0.1.7-rc.2 <0.2.0` (and `@deepseek-ai/cordis` as `^4.0.1`). The package declares 25
peers and **no** runtime dependencies and **no** dev dependencies, so nothing has to be installed
for the tests or for the zero-dependency part of the check chain.

The DSH profile's `.npmrc` sets `auto-install-peers=false`, so these peers are **declarative only**:
pnpm will not fetch them, and a missing peer surfaces as a resolution error at mount time rather
than being silently installed.

## Verification

Everything below runs from the repository root with **no install**, except `check:full`, which needs
a runtime and is marked as such.

```powershell
# 1. The test suite. Zero dependencies. 55 tests.
npm run test

# 2. The check chain. Zero dependencies, no runtime needed.
npm run check

# 3. The same check with the deep YAML comparison enabled. Needs a runtime.
npm run setup:verify
$env:DSH_RUNTIME = "<absolute path to a node_modules holding js-yaml and @deepseek-ai/cordis-plugin-include>"
npm run check:full

# 4. Regenerate the frozen baseline from the published patch and check it.
npm run baseline
npm run baseline -- --check

# 5. Re-port the published patch from a source patch directory.
npm run port -- --src <dir holding cordis.patch.yml>
```

What each one proves:

- **`npm run test`** runs the `node:test` suite: the three forward rewrites, the inverse rewrites
  and their round trip, the argument parsers, the machine-path pattern from both sides, the
  zero-byte guard, and the package check's negative paths. It is 55 tests and it needs nothing
  installed.
- **`npm run check`** is `node tools/check-package.mjs && node tools/verify-patch.mjs`. The first
  runs 16 structural and license assertions (manifest identity, the four `exports`, the single
  self-reference row, the nine persona anchors and their files, the `files[]` coverage, the eleven
  persona byte counts, the license pointers, the three license documents, the upstream fingerprint
  when one is supplied, the modification-notice claims, the license scope mapping, the machine-path
  scan and the classes that govern where the pre-port package name may appear, and the patch's
  shape). The second proves the published patch
  still equals what the three documented rewrites compute from the frozen baseline, and reports
  `verdict: "IDENTICAL"` with 11 rewrite sites. Both are **zero-dependency**, so they pass in a
  clean clone with no install.
- **`npm run check:full`** is `node tools/verify-patch.mjs` on its own. With `DSH_RUNTIME` pointing
  at an absolute `node_modules` that holds `js-yaml` and `@deepseek-ai/cordis-plugin-include`, the
  verifier parses both documents with the real entry-list dialect and compares them structurally,
  reporting `yamlCompare: "ok"` and `sites.length` of 11. **Without a runtime it reports
  `yamlCompare: "skipped"` and still exits 0**, which is why the exit code alone is not evidence
  here: assert on the field. That is also why this step is separate from `check`, and why
  `npm run setup:verify` exists: it installs the runtime into `.dsh-verify/` without adding a
  dependency to this package. The tool reads `DSH_RUNTIME` itself rather than taking a `--runtime`
  flag, because Windows npm runs scripts through `cmd.exe` and POSIX shells expand variables
  differently, so one script string would behave differently on the two platforms.
- **`npm run baseline`** re-derives `baseline/cordis.patch.yml` from the published patch by
  applying the inverse of the three rewrites, and `-- --check` compares the committed baseline
  against a freshly derived copy, printing the differing lines and exiting non-zero on drift.
- **`npm run port -- --src <dir>`** applies the three rewrites to the `cordis.patch.yml` in `<dir>`
  and writes the result. `--src` has **no default**, because the only honest default would be a
  machine-local directory; the error message names the baseline directory as the alternative
  source, and `npm run port -- --src baseline` reproduces the committed patch byte for byte.

> **`npm run check` must run inside a git checkout.** Three of its assertions (the license scope
> mapping, the machine-path scan, and the classes that govern where the pre-port package name may
> appear) are defined over the set of **tracked**
> files, so the tool asks `git ls-files` for that set. If git cannot answer, the tool fails with
> `run inside a git checkout` rather than silently skipping those three. A consumer who unpacks the
> published tarball outside a repository will therefore see that error, and it is deliberate: a
> mapping check that reports success for work it never did is worse than no check at all. The
> published package includes the tools and the test suite so the chain can be re-run from a clone.

## License

This repository is **dual-licensed**, and the two licenses are not alternatives you may choose
between: each file is covered by exactly one of them. It is **not** MIT-only.

The scope mapping, matching the two blocks in [`NOTICE.md`](./NOTICE.md):

- [`LICENSE-SUL-1.0.md`](./LICENSE-SUL-1.0.md) covers the upstream-derived content:
  `personas/`, `cordis.patch.yml`, `plan-aware-persona.mjs`, `index.js` and
  `baseline/cordis.patch.yml`.
- [`LICENSE-MIT.md`](./LICENSE-MIT.md) covers our own work: `tools/`, `test/`, `.github/`,
  `baseline/README.md`, `package.json`, `.gitignore`, `README.md`, `README.zh.md`, `CHANGELOG.md`
  and `NOTICE.md`.
- [`NOTICE.md`](./NOTICE.md) is the authoritative declaration: the modification notice, the upstream
  attribution, and the machine-readable scope mapping, including the match rule that decides which
  block covers each tracked path. In any disagreement between this README and `NOTICE.md`, the
  notice wins.

The upstream terms are the **Sustainable Use License 1.0**, held verbatim in
[`LICENSE-SUL-1.0.md`](./LICENSE-SUL-1.0.md). SUL-1.0 is a **source-available** license. It is
**not** an OSI-approved open source license, and this repository does not claim otherwise.

The upstream terms permit use, copying, distribution and derivative works only for your own
internal business purposes, or for non-commercial or personal use, and they permit distribution
only if you do so **free of charge** and for **non-commercial** purposes. This package is
distributed under exactly those terms: free of charge, non-commercial, and not for resale. The
upstream license is **not sublicensable**, which is why the MIT license covering our own files
cannot be extended over the upstream-derived ones, and why `LICENSE-SUL-1.0.md` must travel with
every copy.

One carve-out applies to the MIT scope: the files under `tools/` and `test/` are our own work and
are licensed under MIT, but they embed verbatim fragments of the upstream bundle patch expressions,
quoted so that the patch can be generated and verified. Those **quoted fragments** remain subject to
the upstream SUL-1.0 terms and are not relicensed by the MIT license that covers the surrounding
code. The same carve-out is stated in `NOTICE.md`, and the two documents agree.

This repository is an **unofficial fork**. It is **not affiliated** with, endorsed by, or sponsored
by the upstream project or its author, and nothing here implies any affiliation or endorsement.
Upstream names and trademarks belong to their owners.

## Known issues

- **The declared peer range excludes dsh 0.2.0 and above, and the host skips the bundle there.** The
  peers are declared as `>=0.1.7-rc.2 <0.2.0`, matching the upstream fork. On a dsh at 0.2.0 or
  above, the host reports the plugin as incompatible, **skips the bundle**, and the command **still
  exits 0**, so the failure is silent unless you read stderr: the preset never appears in the dump.
  On such a version you must either run a dsh inside the declared range, or grant the exact-version
  exemption with `dsh plugin allow-version "<pkg>@<version>" --dsh-version <version> --accept-risk`.
  That exemption is the host's own escape hatch and carries the risk the host itself warns about, so
  it is a deliberate acceptance of risk rather than a supported configuration. This behaviour is
  inherited from the upstream fork and is not specific to this localization. On a runtime inside the
  declared range the package mounts and composes correctly, including all nine persona anchors.
- **`baseline/` proves reproducibility, not correctness.** The baseline is a frozen snapshot of the
  pre-port patch, committed so the round trip can be checked anywhere. It is byte-identical to the
  source patch, and the derivation proves the port is **reproducible**: the published patch and the
  baseline are related by exactly the three documented rewrites and nothing else. It does **not**
  prove the content is correct. If the source patch had been wrong, the derivation would faithfully
  reproduce that wrongness and every check here would still pass.
- **The prior evidence for content correctness is not shipped.** That evidence is the
  `omo-fork-chs-*` evidence set produced by the Simplified-Chinese port work, whose
  `verify-omo-fork-chs-bundle` checker reported **`FAITHFUL`** and whose `verify-omo-fork-chs-deport`
  checker reported **`CLEAN`**. Those checkers are **machine-local**: they run against directories
  that exist only on the machine the port was prepared on, and they are deliberately not shipped
  with this package.
- **The vendored persona prose carries machine-local paths.** Ten lines across three persona
  documents name absolute paths from the machine the localization work was done on. They violate
  this repository's rule that no committed file names a machine absolute path, and they are
  tolerated only because byte identity with the source bundle is the harder constraint. The affected
  lines are enumerated in `tools/check-package.mjs`, whose scan accepts a match only at those exact
  positions. `NOTICE.md` records this as modification entry 8. The paths are not reproduced here
  because this document is itself covered by that scan.
- **This repository coexists with the English fork.** `Tacrine/oh-my-dsh-omo-fork` is a separate
  repository with its own package, its own preset id and its own scope mapping. Neither repository
  affects the other: they share the upstream lineage, and nothing in this package reads, writes or
  depends on the other one.
- **Nothing here has been published yet at the time of writing.** This repository carries no release
  tag, no CI run and no npm artifact of its own until the publish steps are done.

## Lineage

This package descends from the Simplified-Chinese agent-preset bundle, which lived as a **link
install**: a private dependency wired into one machine's DSH profile, pointing at a local directory.
That form cannot be installed anywhere else, because its patch named a machine-local package and its
persona anchors resolved relative to the profile directory.

This repository turns that bundle into an **npm-installable** form. The three documented rewrites do
the work: the package self-reference and the nine persona path anchors are re-pointed at this
package's own name and its `package.json`, and the header comment follows. The result is a patch
that resolves in any install layout, a frozen baseline that makes the round trip checkable without
the original machine, and a check chain that proves the published patch still matches the source it
was derived from.

The upstream project is **oh-my-openagent**, formerly published as **oh-my-opencode**
(https://github.com/code-yeongyu/oh-my-openagent). The content in this repository is derived from
upstream commit `3c711483856207ef530c09d062fa9077c225debbe`, which carries upstream version **5.0.1**.
The persona prose, the toolchain composition and the plugin are the upstream design; this fork's
contribution is the translation into Simplified Chinese and the packaging split.
