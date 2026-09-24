# V15 FIX6 — bounded transient capture-navigation recovery

Supersedes FIX5.

## Evidence from the uploaded Sentinel10 diagnostic

Run: `v15-2026-09-24T04-44-07-400Z`

Summary:
- total=10
- validated=6
- skippedNonCamera=2
- errors=2
- review=0
- deferred=0

Exact failed items:

1. Product 0001 — ZShop Canon EOS R50
   - phase: CAPTURE
   - `page.evaluate: Execution context was destroyed, most likely because of a navigation`

2. Product 0002 — ZShop Canon EOS R50 variation 65130
   - phase: CAPTURE
   - `page.goto: Timeout 20000ms exceeded` while waiting for `domcontentloaded`

All later products 0003–0010 produced durable capture/decision/validation artifacts. This isolates the failure to transient browser navigation at the capture boundary.

## FIX6

`captureProductVisualPacket` now performs one bounded retry only for explicit transient navigation failures:

- execution context destroyed due to navigation;
- `page.goto` timeout;
- frame detached.

Recovery sequence:

1. abandon the failed capture attempt;
2. reset the shared capture page to `about:blank` with a 5-second bound;
3. wait 250 ms;
4. retry the whole product capture once with navigation timeout at least 40 seconds;
5. only then hand the frozen packet to Gemini.

Unrelated capture failures are not retried.

## Architecture retained

No changes to:
- Gemini model (`gemini-3.5-flash-lite`);
- one semantic call per product;
- one capture worker / one semantic worker;
- bounded queue;
- exact 13-column schema;
- semantic prompt/business rules;
- comparator behavior from FIX5;
- retention contract.

No retailer-specific recovery selectors or semantic hardcoding were added.

## Offline verification

- changed TS syntax/transpile: PASS
- real compiled production recovery harness: PASS
- first attempt timeout → blank reset → retry at 40s: PASS
- observed context-destroyed classifier: PASS
- observed goto-timeout classifier: PASS
- unrelated failure no-retry guard: PASS
- V15 secret/security scan: PASS

Fresh Windows full gate is still required before release green.
