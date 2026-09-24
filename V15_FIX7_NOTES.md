# V15 FIX7 — exact short stock transcription

Supersedes FIX6.

Fresh Windows evidence
----------------------
Smoke4 production completed successfully:

- total=4
- validated=4
- review=0
- errors=0

The only blocker was S08 stock:

- expected semantic anchor: `cửa hàng có sản phẩm`
- Gemini output: `Có 7 cửa hàng có sẵn phẩm`

The live page visibly says `Có 7 cửa hàng có sản phẩm`.

Diagnosis
---------
This is a short-text semantic transcription/paraphrase error, not a comparator bug.

FIX5's comparator correctly rejects the malformed phrase. FIX7 therefore does NOT loosen the comparator.

FIX7
----
Prompt-only production change:

- for short stock/availability phrases, copy the complete visible wording exactly;
- do not paraphrase;
- do not substitute synonyms;
- do not reorder, omit, or insert words;
- if exact wording cannot be read faithfully, return null rather than reconstructing it.

Frozen architecture retained
----------------------------
No changes to:
- `gemini-3.5-flash-lite`;
- one semantic call per product;
- normal-path `high` media resolution;
- browser/capture topology;
- pipeline concurrency;
- 13-column workbook contract;
- no local semantic repair;
- no retailer-specific production logic;
- no benchmark literals in the production prompt.

Offline evidence
----------------
- TypeScript syntax/transpile: PASS
- V15 numbered-packet architecture guard: PASS
- V15 security scan: PASS
- FIX7 prompt regression assertions: PASS

Fresh Windows full gate is still required before release green.
