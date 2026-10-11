# The frozen pre-port baseline

This directory holds one file, `cordis.patch.yml`, plus this sidecar. The baseline is the
**pre-port** form of the patch: the text the chs bundle carried before the three packaging
rewrites were applied to it.

## Where this snapshot comes from

The snapshot is the `cordis.patch.yml` of the chs bundle, the localized agent-preset bundle
that this fork vendors from. It was captured by reversing the three port rewrites with
`node tools/derive-baseline.mjs`, which reads this repository's published `cordis.patch.yml`
and applies the inverse of the rules in `tools/lib/rewrites.mjs`.

- Source: the chs bundle's `cordis.patch.yml`
- Source byte count: 26903
- Source line count: 540
- Source SHA256: `BD9619038AFB3817C4EC8599B6A67EAC559A6193FFF53C820F1895E26312514F`

The baseline file in this directory is **byte-identical** to that source: same 26903 bytes,
same 540 lines, same SHA256. It carries no header, no provenance comment and no added blank
line, because any of those would break both the byte-identity assertion and the round trip.
This sidecar exists precisely so that nothing has to be added to the file itself.

## Upstream provenance

- Upstream project: **oh-my-opencode**, also published as **oh-my-openagent**
- Upstream repository: https://github.com/code-yeongyu/oh-my-openagent
- Upstream author: **YeonGyu-Kim (code-yeongyu)**
- Upstream commit this content is derived from: `3c711483856207ef530c09d062fa9077c225debb`
- Upstream version at that commit: **5.0.1**

The baseline is upstream-derived content and is covered by the upstream Sustainable Use
License 1.0. See `LICENSE-SUL-1.0.md` and `NOTICE.md` at the repository root for the full
terms and the machine-readable scope mapping.

## This is a frozen snapshot, not an independent original

The baseline is **a frozen snapshot of the source patch, not an independent original**. It is
not authored here, it is not a second implementation of the same preset, and it is not a
specification. It is a copy, committed so that the verification chain has an input that does
not depend on any machine-local directory.

That matters for how the file may be read. If it and the source ever disagree, the source is
the authority and the baseline is stale. Editing the baseline by hand would not "fix" anything:
it would break the round trip, and the round trip is the only thing the baseline is for.

## What the reverse derivation proves, and what it does not

The reverse derivation proves that the port is **reproducible**:

- the published `cordis.patch.yml` and this baseline are related by exactly the three
  documented rewrites and nothing else;
- re-applying those rewrites to this baseline (`node tools/port-patch.mjs --src baseline`)
  reproduces the published patch byte for byte;
- `node tools/derive-baseline.mjs --check` confirms the committed baseline still equals a
  freshly derived copy.

The reverse derivation **does not prove that the content is correct**. It is a statement about
the relationship between two files, not about whether either one is right. If the source patch
had been wrong, the derivation would faithfully reproduce that wrongness, and every check in
this repository would still pass. Reproducibility and correctness are different properties, and
this baseline only speaks to the first.
## Where the evidence for content correctness lives

The prior evidence for the **content** of this bundle was produced by the chs port work's own
verification set, referred to here as the **`omo-fork-chs-*` evidence set**:

- its `verify-omo-fork-chs-bundle` checker reported **`FAITHFUL`**, meaning the localized
  bundle's persona content was verified against its source;
- its `verify-omo-fork-chs-deport` checker reported **`CLEAN`**, meaning the deployment
  extraction carried nothing machine-local and nothing stray.

Those checkers are **machine-local**: they run against directories that exist only on the
machine where the chs port work was done, and they are deliberately **not shipped with this
package**.
This sidecar therefore refers to that evidence set by name and by what it reported,
and not by any path, because a committed file must not name a machine location and because the
evidence would not be reproducible from this repository even if it did.

Anyone re-verifying this package's content should read that set's results as the prior
evidence and treat this repository's own checks as what they are: a reproducible proof that the
packaging rewrites were applied correctly, not a re-derivation of the content's correctness.
