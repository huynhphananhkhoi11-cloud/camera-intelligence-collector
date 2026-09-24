# V15 FIX10 — reliability consolidation

Supersedes FIX9.

## Why FIX10 exists

The sequence of live runs proved two different things:

- production semantics can complete Smoke4 at 4/4;
- the same production source can also intermittently end at 2/4 because browser/live capture failures are nondeterministic.

FIX9 itself was test-only relative to FIX8, so the latest 2/4 cannot be explained by the FIX9 change.

The repeated patch loop was also amplified by the release harness: a non-zero live CLI exit caused the temporary extracted project to be deleted before durable `itemErrors` were surfaced.

## FIX10 changes

### 1. Fresh Playwright page per product

Each product capture now gets its own fresh page. This prevents a navigation race/timeout on one retailer page from contaminating the next product.

A second fresh-page attempt is permitted only for the existing recoverable navigation class. Unrelated failures are not retried.

### 2. Durable capture-only resume in release acceptance

Smoke4 and Sentinel10 can resume the exact same `runId` for capture-only transient failures.

This is safe with the frozen durability contract:

- already completed items are recovered from persisted decision/checkpoint files;
- failed capture items remain pending and are the only ones recaptured;
- successful product semantic decisions are not called again;
- semantic/auth/quota/schema/unknown errors are never auto-resumed.

Maximum: two resume passes after the initial live CLI pass.

### 3. Failure evidence survives the temporary ZIP workspace

On any final-gate failure the Windows runner now writes a timestamped archive to:

`Downloads\V15_FAILURE_EVIDENCE_YYYYMMDD-HHMMSS.zip`

It includes the V15 acceptance tree, run reports, logs, captures and comparator evidence available at the point of failure.

The live runners also print durable `itemErrors` before throwing.

## Frozen architecture retained

No changes to:

- Gemini model;
- one semantic call per completed product;
- semantic/browser responsibility boundary;
- capture worker = 1;
- semantic worker = 1;
- bounded queue = 1–2;
- authoritative hero final refresh;
- FIX8 media resolution policy;
- 13-column workbook schema;
- no retailer hardcodes;
- no local price/stock regex;
- no local semantic repair;
- no benchmark fabrication.

## Offline verification

- TypeScript syntax/transpile: PASS
- MJS syntax: PASS
- V15 required coverage: PASS
- V15 production architecture scan: PASS
- numbered-packet guards: PASS
- V15 secret scan: PASS

Fresh Windows final gate remains authoritative.
