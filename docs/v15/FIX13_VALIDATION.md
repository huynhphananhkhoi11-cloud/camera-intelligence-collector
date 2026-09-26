# V15 FIX13 Validation Record

Validation source: fresh D10+1 live run, generated 2026-09-24.

## D10 benchmark

- Cases: S01–S10
- Expected camera products: 8
- Actual camera products: 8
- Expected non-camera cases: 2
- Actual non-camera cases: 2
- Review count: 0
- Disposition mismatches: 0
- Comparator mismatches: 0
- Benchmark pass: true

## Key arbitration case — S07

The live page exposed both promotional scarcity copy and a dedicated inventory state. FIX13 selected the dedicated inventory state rather than the promotional urgency text. The live inventory count had changed from an earlier capture, demonstrating that the rule was not tied to a benchmark literal.

## S08

The live run returned the expected benchmark disposition and stock state. A known benchmark-contract debt remains around condition evidence: earlier screenshots did not expose an explicit NEW/Mới label even though the benchmark expects `NEW`. FIX13 does not hardcode that benchmark value.

## Unseen page gate

- URL: `https://kyma.vn/may-anh-canon-eos-r6-mark-ii.html`
- Classification: `CAMERA_PRODUCT`
- Screenshot count: 4
- Gemini attempts: 1
- Structural pass: true
- Product name present: true
- Sale price present: true
- Authoritative URL present: true
- Website present: true

Manual visual audit confirmed that the frozen screenshot packet did not contain an explicit primary-product stock statement, so `stock = null` was grounded rather than a missed visible value.

## Scope of claim

This validation record establishes the V15/FIX13 visual-semantic architecture and its targeted live benchmark behavior. It does not claim that every historical v02/v03 test in the repository is green.
