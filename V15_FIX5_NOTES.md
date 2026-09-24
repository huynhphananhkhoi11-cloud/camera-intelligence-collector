# V15 FIX5 — comparator false-negative correction

Supersedes FIX4.

Fresh Windows evidence
----------------------
Smoke4 runtime itself is fully healthy:

- total=4
- validated=4
- review=0
- errors=0

The only blocker was:

- S07
- field: stock
- expected anchor: `cửa hàng có sản phẩm`
- actual: `Có 4 cửa hàng có sẵn sản phẩm`

Root cause
----------
The acceptance comparator used literal substring matching. The validated live value is semantically the same availability statement, but the live site inserted a volatile branch count and the filler word `sẵn`.

So this is a comparator false negative, not a production semantic failure.

FIX5
----
Comparator-only normalization:

- removes volatile numeric counts;
- ignores only the generic filler tokens `có` and `sẵn`;
- requires all remaining benchmark tokens in order;
- accepts `Có 4 cửa hàng có sẵn sản phẩm`;
- still rejects warranty text;
- still rejects `Hết hàng`.

Applied to:
- `tests/live/v3/workbookComparator.ts` — the comparator actually used by V15 Smoke4/Sentinel10;
- `scripts/v04/run-smoke4.mjs` — legacy V04 consistency.

Regression tests were added for both comparator surfaces.

Frozen architecture retained
----------------------------
No changes to:
- `gemini-3.5-flash-lite`;
- one Gemini semantic call/product;
- capture topology;
- queue/runtime;
- 13-column workbook schema;
- local semantic repair policy;
- retailer-specific production logic.

Offline evidence
----------------
- actual TypeScript comparator helper execution: PASS
- live phrase normalization case: PASS
- warranty false-positive guard: PASS
- out-of-stock false-positive guard: PASS
- V15 security scan: PASS
- V15 numbered architecture guards: PASS

Fresh Windows full gate is still required before release green.
