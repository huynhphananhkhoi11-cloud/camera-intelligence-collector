# V15 FIX4 — live Smoke4 comparator correction

Supersedes FIX3.

Why FIX4 exists
---------------
The Windows live pipeline reached:

- total=4
- validated=4
- review=0
- errors=0

but the release comparator still reported 2 mismatches.

The prior V15 diagnosis had the same 4/4 + two-mismatch signature on stock/availability. Inspection of FIX3 also found a concrete transport bug: product images were labelled as high resolution in text metadata, but the actual Gemini Interactions image object did not include the `resolution` field.

Changes
-------
1. Send `resolution: "high"` on actual Gemini Interactions product image content items.
2. Add generic stock-vs-warranty semantic guidance.
3. Add generic one-day-rental semantic guidance.
4. Stabilize S07/S08 benchmark stock comparison to the visible phrase `cửa hàng có sản phẩm` instead of a volatile numeric branch count.
5. Print exact comparator mismatch objects on future acceptance failure.

Frozen architecture retained
----------------------------
- `gemini-3.5-flash-lite`
- one Gemini semantic call/product
- no local price/stock regex
- no retailer-specific semantic rules
- no benchmark-driven production repair
- no second semantic repair pass
- exact 13-column workbook contract

Offline evidence
----------------
- changed TS syntax/transpile diagnostics: PASS
- numbered-packet architecture scan: PASS
- secret scan: PASS
- static FIX4 assertions: PASS

Fresh real-Windows Smoke4 and Sentinel10 are still required before release green.
