# V3 Semantic Contract — Phase 12A

Status: **FROZEN for V3 implementation**

## Purpose

Camera Intelligence Collector V3 is a **data collection system**, not a truth-resolution or data-cleaning system.

The collector MUST:
1. discover publicly observable commercial product data;
2. classify the primary entity as CAMERA, NON_CAMERA, or UNCERTAIN;
3. associate every observation with the correct product entity;
4. preserve all unique observed values and their provenance;
5. deduplicate repeated representations of the same product identity;
6. export confirmed cameras and retain audit evidence.

The collector MUST NOT:
- choose which conflicting source is “more trustworthy”;
- silently discard a conflicting observation;
- fabricate a value when evidence is absent;
- treat conflict severity as a reason to withhold a confirmed camera;
- use body-wide nearest-number guesses when ownership is not established.

## Decision semantics

- CAMERA + successful acquisition => exportable.
- NON_CAMERA => excluded from the main camera dataset.
- UNCERTAIN => review queue.
- Technical acquisition failure => error queue.

Field conflicts are **audit metadata only**. They do not change a confirmed CAMERA into REVIEW.

## Core invariant

**Collect → associate → preserve → deduplicate → export.**

There is no “winner-selection” stage for conflicting field observations.

## Example

If a product page exposes:
- visible title: `NEW 100%`
- JSON-LD: `UsedCondition`

V3 preserves both CONDITION observations with provenance. It does not decide which one is correct.
