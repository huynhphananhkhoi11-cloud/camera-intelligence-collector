# V15 FIX13 — Numbered Visual Evidence + Generic Factual-State Arbitration

## Status

This document freezes the V15/FIX13 architecture that produced the validated D10+1 run on 2026-09-24.

## Pipeline

1. Site reconnaissance produces ordered navigation screenshots without semantic filtering.
2. Gemini navigation semantics selects approved camera routes.
3. Product URL discovery stays inside approved routes and remains semantic-free.
4. Product capture creates a frozen, ordered screenshot packet (`01`, `02`, `03`, ...).
5. The authoritative hero shot is first; later shots add visible evidence.
6. Exactly one Gemini product-semantic call is made per product.
7. Gemini maps visible facts to the frozen 13-column semantic contract.
8. Structural validation checks schema/shape only; it does not repair semantics.
9. Workbook export transports the validated row one-to-one.

## Product-semantic configuration

- Model: `gemini-3.5-flash-lite`
- One semantic call per product
- Thinking level: `medium`
- Temperature: `0.1`
- Max output tokens: `4096`
- Authoritative hero resolution: `ultra_high`
- Other screenshot resolution: `high`

## Grounding contract

- Read every screenshot in the frozen packet.
- Identify the primary camera/product.
- Map visible facts by semantic meaning.
- Use explicit visible evidence only.
- Do not infer from retailer identity, product category, benchmark expectations, or general expectations.
- Unsupported values return `null` / `[]` as appropriate.
- Preserve visible wording when wording itself is requested.
- Do not perform second-pass semantic repair.

## FIX13 semantic delta from FIX12

One generic arbitration rule is added:

> When multiple visible values could map to the same field, choose the value presented by the page as the dedicated factual state for that field rather than promotional, persuasive, urgency, or descriptive copy.

This rule is intentionally field-agnostic and retailer-agnostic. It contains no benchmark IDs, retailer names, stock phrases, product names, or expected values.

## Ownership boundaries

- Capture owns seeing.
- Gemini owns semantic interpretation.
- Structural validator owns schema/shape validation.
- Export owns transport/presentation.

The architecture forbids browser-side semantic regexes, retailer-specific semantics, benchmark hardcodes, semantic post-processing, per-field repair, and multiple semantic calls for one product.

## Frozen 13-column output

The existing V15 13-column contract remains unchanged. FIX13 changes evidence arbitration only; it does not change the response schema, workbook mapping, comparator, capture architecture, or concurrency model.
