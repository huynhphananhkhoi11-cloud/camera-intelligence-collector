# V15 FIX8 — authoritative final hero at ultra_high

Supersedes FIX7.

Fresh evidence
--------------
FIX7 still produced one Smoke4 comparator mismatch while runtime itself remained fully healthy:

- total=4
- validated=4
- review=0
- errors=0
- S08 stock actual: `Có 7 cửa hàng có sẵn phẩm`

The final hero visibly contains the complete availability phrase. FIX7 already told Gemini not to paraphrase or omit words, but the same malformed transcription repeated.

Root cause narrowed
-------------------
The remaining issue is media fidelity for small text in the authoritative hero, not browser capture, structural validation, or comparator logic.

A prior accepted V15 diagnosis explicitly specified:

- final authoritative hero -> `ultra_high`
- remaining screenshots -> `high`

Later integration had regressed all screenshots to `high`.

FIX8
----
Restore the bounded intended policy:

- authoritative `01-hero-final` -> `resolution: ultra_high`
- screenshots 2..N -> `resolution: high`

Retained unchanged
------------------
- model: `gemini-3.5-flash-lite`
- one Gemini semantic call/product
- FIX5 comparator
- FIX6 transient navigation retry
- FIX7 exact short-stock transcription instruction
- no retailer hardcode
- no benchmark literal in production semantic logic
- no stock/price regex
- no local semantic repair
- no second Gemini pass
- exact 13-column workbook contract

Offline evidence
----------------
- TypeScript syntax/transpile: PASS
- V15 numbered packet architecture guard: PASS
- V15 security scan: PASS
- static authoritative-hero resolution assertions: PASS

Fresh Windows full gate is still required before release green.
