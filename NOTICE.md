# NOTICE

This repository is the **chs** fork, a fork of the upstream project **oh-my-opencode** (also
published as **oh-my-openagent**). It is **not affiliated with, endorsed by, or sponsored
by** the upstream project or its author. The upstream names, logos and trademarks belong to
their owners, and nothing in this repository implies any affiliation with, or endorsement
by, the upstream project.

## This software has been modified

**The content in this repository is a modified copy of the upstream project's content.**
This is a prominent notice, required by the upstream license, stating that the software has
been modified. The modifications are listed in the `## Modifications` section below.

## Modifications

The changes made to the upstream content, relative to upstream commit
`3c711483856207ef530c09d062fa9077c225debb`, are:

1. **The persona prose was translated into Simplified Chinese.** The eleven persona
   documents under `personas/` were translated from the upstream English originals. The
   translation is a derivative work of the upstream text, not an independent work.
2. **The leading `<dsh_environment_note>` block was removed** from every persona document,
   and **the `## Tool Mapping` table was replaced** by a short Chinese `## DSH 工具速查`
   list. The upstream English persona documents contain 22 occurrences of
   `dsh_environment_note` and 33 occurrences of `Tool Mapping`; this repository's persona
   documents contain zero occurrences of either, and 11 occurrences of `DSH 工具速查`.
3. **Tool names were rewritten to DSH tool names**, so that the persona documents instruct
   the agent using the tools this harness actually exposes.
4. **The multimodal subagent's machine-local `agentOptions` route does not ship here.** The
   upstream content carried a machine-local `provider` and `model` route for the multimodal
   subagent; that route is not portable, and this repository's bundle carries no
   `agentOptions` row at all.
5. **The declaration anchor was re-anchored from `@local/dsh-preset-omo-fork-chs` to this
   package.** The bundle patch's plugin self-reference and its nine persona path anchors
   previously pointed at a machine-local package name; they now resolve through this
   package's own name and its `package.json`, so the bundle installs from a registry instead
   of from one machine's local profile.
6. **The bundle was repackaged as a DSH Cordis bundle.** The packaging shape changed from a
   private local dependency into a publishable package with a Cordis patch, a package
   manifest, and tools that generate and verify the patch.
7. **`index.js` and `plan-aware-persona.mjs` were copied unchanged** from the bundle this
   fork was derived from. They carry no translation and no functional change.
8. **The vendored persona prose carries machine-local paths.** Ten lines across three persona
   documents name absolute paths from the machine the localization work was done on: one
   illustrative Windows temporary-directory example, and nine invocations of a local helper
   script that lives under the harness home directory. Those lines do violate this
   repository's rule that no committed file names a machine absolute path. They are tolerated
   anyway, because byte identity with the source bundle is a harder constraint that this
   repository also imposes: sanitizing them would change the persona bytes and break the
   identity that the content-fidelity check and the final bundle audit both re-assert. The
   affected lines are enumerated, with their line numbers, in `tools/check-package.mjs`,
   whose machine-path scan accepts a match only at one of those exact positions and fails on
   any other. The paths are not reproduced here because this document is itself covered by
   that scan.

No upstream licensing, copyright, or other notice was altered, removed, or obscured by
these modifications. The persona documents and the two copied modules contain no license or
copyright notice of their own, so no notice was removed from them and none was added to
them, which keeps them byte-comparable with their source.

## Attribution

- Upstream project: **oh-my-opencode**, also published as **oh-my-openagent**
- Upstream repository: https://github.com/code-yeongyu/oh-my-openagent
- Upstream author: **YeonGyu-Kim (code-yeongyu)**
- Upstream commit this content is derived from: `3c711483856207ef530c09d062fa9077c225debb`
- Upstream version at that commit: **5.0.1**

## License scope

This repository is dual-licensed, and the scope of each license is declared below in a
machine-readable form. The licenses are not alternatives you may choose between: each file
is covered by exactly one of them, as the mapping states.

**Match rule.** The two blocks below are the authoritative mapping. Each block contains one
entry per line, and each entry is either a repository-relative path or a directory prefix.
An entry that ends in `/` matches every tracked path that starts with that directory prefix.
Any other entry matches exactly one path. Matching is **case-sensitive**. Every tracked path
must match exactly **one** block. An entry that currently matches no tracked file is allowed;
later work in this repository creates those files. The direction of the mapping is one way
only, from a tracked path to the block that covers it.

The terms of the upstream license are **not** reproduced here. They live in
`LICENSE-SUL-1.0.md`, which is the byte-for-byte copy of the upstream terms.

<!-- sul-scope -->
```
personas/
cordis.patch.yml
plan-aware-persona.mjs
index.js
baseline/cordis.patch.yml
```

<!-- mit-scope -->
```
tools/
test/
.github/
baseline/README.md
package.json
.gitignore
.gitattributes
README.md
README.zh.md
CHANGELOG.md
NOTICE.md
```

### Scope of the upstream Sustainable Use License 1.0

Everything in the `sul-scope` block above is a derivative work of upstream content, and it
is licensed under the **Sustainable Use License 1.0**, whose full terms are in
`LICENSE-SUL-1.0.md`. In particular, the upstream terms allow you to use, copy, distribute,
make available, and prepare derivative works of that content only for your own internal
business purposes or for non-commercial or personal use, and they allow you to distribute it
or provide it to others only if you do so free of charge for non-commercial purposes. The
upstream license is **not sublicensable**, which is why the license covering the files we
authored ourselves cannot be extended over the upstream-derived files.

The Sustainable Use License 1.0 is a **source-available** license. It is **not** an
open-source license approved by the Open Source Initiative, and this repository does not
claim otherwise.

### Scope of the MIT license

Everything in the `mit-scope` block above is our own work and is licensed under the **MIT**
license, whose full text is in `LICENSE-MIT.md`.

One carve-out applies to that block: the files under `tools/` and `test/` are our own work
and are licensed under MIT, but they embed verbatim fragments of the upstream bundle patch
expressions, quoted so that the patch can be generated and verified. Those quoted fragments
remain subject to the upstream **SUL-1.0** terms and are not relicensed by the MIT license
that covers the surrounding code.

## Distribution terms

This package is distributed **free of charge** and for **non-commercial** purposes only.
You may not sell it, resell it, charge for access to it, or place it behind a paywall or any
other paid gate. Redistributing it is permitted only if you do so free of charge and for
non-commercial purposes, and only if the terms in `LICENSE-SUL-1.0.md` travel with every
copy you pass on.

## Terms travel with copies

`LICENSE-SUL-1.0.md` holds the upstream Sustainable Use License 1.0 terms verbatim. The
upstream terms require that anyone who receives a copy of any part of the upstream-derived
content from you also receives a copy of those terms. Any copy, mirror, fork, package or
archive of this repository, or of any part of its upstream-derived content, must therefore
include `LICENSE-SUL-1.0.md` alongside it. Removing that file, or replacing it with a
different license, would break the terms under which this content may be used and
distributed at all.

## Files

- `LICENSE-MIT.md` covers our own work, as mapped above.
- `LICENSE-SUL-1.0.md` is the verbatim copy of the upstream terms, and covers the
  upstream-derived content, as mapped above.
- `NOTICE.md` is this file: the modification notice, the attribution, and the
  machine-readable license scope mapping.
