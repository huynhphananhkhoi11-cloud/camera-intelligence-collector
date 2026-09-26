# V15 FIX11 — semantic field-mapping hardening

Supersedes FIX10.

Why FIX11 exists
----------------
The latest Windows Smoke4 runtime itself was healthy:

- total=4
- validated=4
- review=0
- errors=0

The only release blocker was S01:

- field: `rentalPricePerDay`
- current visible one-day rental option: 400,000 VND
- model output for the dedicated field: null/empty

Earlier live evidence also showed the one-day rental wording could be captured while the model placed rental information in `rentalTerms` and left `rentalPricePerDay` empty.

Diagnosis
---------
This is not a capture retry issue and not a comparator-normalization issue.

It is a semantic field-mapping error between two nearby fields:

- `rentalPricePerDay`
- `rentalTerms`

FIX11
-----
1. Adds clear JSON-schema `description` guidance for both rental fields.
2. Makes the one-day/per-day field assignment explicit and exclusive in the product semantic prompt.
3. Uses `thinking_level: medium` for the single product-semantic Gemini call.
4. Keeps route-selection thinking at `low`.

Frozen architecture retained
----------------------------
- model: `gemini-3.5-flash-lite`
- one Gemini semantic call per product
- authoritative final hero remains `ultra_high`
- other semantic images remain `high`
- no retailer-specific production rule
- no benchmark literal in the production prompt/schema
- no local rental-price regex
- no semantic post-processing
- no second-pass repair
- exact 13-column workbook contract
- FIX10 fresh-page capture isolation and durable capture-only resume retained

Offline verification
--------------------
- TypeScript syntax/transpile: PASS
- V15 required coverage helper: PASS []
- V15 architecture scan: PASS []
- V15 security scan: PASS
- one product-semantic `medium` thinking level: PASS
- route selection remains `low`: PASS

Fresh Windows full gate is still required before release green.
