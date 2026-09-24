# V04 Legacy Semantic Retirement Manifest

Baseline contract: `97d21c23384ba1dd69ee90f5d6b9a8ee1f6ad5a3`

This document is a cutover manifest, not a deletion patch. Dev6 does **not** delete V3 code during the parallel rebuild.

## Retirement gate

Run the scanner only after V04 has been integrated and the canonical production command has been cut over to V04:

```powershell
npx.cmd tsx src/v04/diagnostics/legacySemanticScanner.ts .
```

The scanner exits non-zero while any retained `src/v03` or `tests/v03` file still has a blocking finding. Candidate-internal references between the legacy modules do not block group retirement by themselves.

A deletion patch is allowed only when all of the following are true:

1. Smoke4 and Sentinel10 acceptance have passed under V04.
2. The canonical production command points to V04.
3. `retirementBlocked` is `false`.
4. Neutral capture types currently housed in `evidenceTypes.ts` have been preserved or migrated.
5. Unknown/manual-review findings have been resolved by a human reviewer.
6. Provider retry/quota/state code required by V04 remains intact.

## Safe to delete only after V04 cutover

These are legacy semantic candidates. They are safe to remove **as a group only after the retirement gate is green**:

- `src/v03/ai/evidenceCompactor.ts`
- `src/v03/ai/evidencePacket.ts`
- `src/v03/ai/evidenceSpool.ts`
- `src/v03/ai/groundingValidator.ts`
- `src/v03/ai/entityConsistency.ts`

Associated V3 tests that exist solely to validate these retired semantics may then be removed or replaced in the same retirement change, after Dev0 review.

## Must preserve

The following are not legacy semantic deletion targets merely because they live under V3:

- Stable provider retry/quota/backoff code imported or wrapped by V04.
- Stable run-state/resume code imported or wrapped by V04.
- Neutral capture metadata and shapes such as `VisualEvidence`, `ControlSnapshot`, and `EvidenceBox` while retained code still depends on them.
- Browser/runtime primitives that remain dependencies of V04 and are not explicitly approved for retirement.
- Any V3 code outside the semantic retirement scope unless another lane owns and approves its removal.

The shared V04 contract explicitly requires preserving existing provider retry/quota/state behavior by importing or wrapping stable V3 modules rather than rewriting it.

## Unknown / manual review

### `src/v03/ai/evidenceTypes.ts`

This file is mixed-responsibility and must **not** be blanket-deleted by filename alone.

Semantic types such as:

- `EvidenceItem`
- `EvidencePacket`

belong to the legacy evidence architecture and may retire with it.

Neutral capture types such as:

- `VisualEvidence`
- `ControlSnapshot`
- `EvidenceBox`

must be preserved or migrated to a neutral V04/V3 location before the file itself can be deleted.

Any unknown symbol imported from `evidenceTypes.ts` is classified by the scanner as `manual-review` rather than guessed.

### Retailer-specific semantic logic

Domain/retailer branching near semantic fields is reported as `manual-review`. A scanner hit is not automatic proof that the code is wrong; a human must determine whether the branch is:

- forbidden retailer-specific semantic interpretation, which should retire; or
- neutral transport/discovery/capture behavior, which may remain.

### Tests and benchmark-only references

Legacy test references are blocking until they are intentionally migrated or retired. Benchmark fixtures and acceptance artifacts should not be deleted solely because they mention historical V3 concepts; review ownership and continued diagnostic value first.

## Scanner interpretation

Finding categories:

- `legacy-semantic`: V3 evidence/grounding/entity-consistency imports, known exported semantic symbols, `rawText`, selected-offer/control semantic inference, or field-by-field completeness logic.
- `neutral-capture`: neutral visual/control metadata currently imported from `evidenceTypes.ts`; preserve or migrate before deleting that file.
- `manual-review`: evidenceTypes symbols the scanner cannot classify safely, or likely retailer/domain-specific semantic branching.

Finding scopes:

- `runtime`: retained `src/v03` code outside the candidate module set.
- `test`: `tests/v03` references.
- `candidate-internal`: references inside the six retirement candidate modules. These do not block group deletion by themselves.

The scanner intentionally favors false-positive review over unsafe deletion. It does not edit files and it does not infer that a `VisualEvidence`-like type is semantic evidence solely from its name.
