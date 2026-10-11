# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
  `package.json`, `.gitignore`, `README.md`, `README.zh.md`, `CHANGELOG.md` and `NOTICE.md`.
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
  is inherited from the upstream fork and is not specific to this localization.
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

[0.1.0]: https://github.com/Tacrine/oh-my-dsh-omo-fork-chs/releases/tag/v0.1.0
