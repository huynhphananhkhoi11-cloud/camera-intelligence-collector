# V15 FIX9 — numbered-packet coverage marker correction

Supersedes FIX8.

Windows FIX8 result:
- 30/31 test files passed
- 170/171 tests passed
- only failure: `v15NumberedPacketArchitecture.test.ts` lane-coverage marker

Root cause:
The product semantic test already verified `ultra_high`/`high`, but `resolution:` and the literal were split across lines. The architecture guard regex does not use dot-all, so the marker was not detected.

FIX9 changes only the regression test by adding explicit one-line assertions:
- authoritative final hero resolution is `ultra_high`
- following product image resolution is `high`

No production runtime or semantic behavior changed.

Offline guard helper results after patch:
- required lane coverage: PASS
- architecture scan: PASS
- frozen numbered contracts: PASS
- canonical semantic contract: PASS
- workbook contract: PASS

Fresh Windows full gate is still required before release green.
