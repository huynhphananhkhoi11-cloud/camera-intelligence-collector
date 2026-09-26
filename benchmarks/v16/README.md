# DEV7 V16 benchmark metrics contract

This harness compares **measured** V15 and V16 runs. It deliberately does not invent the integrated CLI command or a fixed runtime threshold.

Reference targets are stored in `reference-sites.json` and are acceptance-only data; production `src/v16` must not contain retailer-specific branches for them.

Each V15/V16 metrics JSON object must contain:

```json
{
  "version": "v16",
  "site": "VJShop",
  "rootUrl": "https://www.vjshop.vn/",
  "wallClockMs": 0,
  "pagesOpened": 0,
  "screenshotCount": 0,
  "geminiCalls": 0,
  "totalUrlCandidates": 0,
  "irrelevantUrlCandidates": 0,
  "finalUniqueCameraProducts": 0,
  "directCompletedProducts": 0,
  "geminiCallsForDirectProducts": 0,
  "fieldCompleteness": {
    "website": 0,
    "productName": 0,
    "condition": 0,
    "specs": 0,
    "rentalPricePerDay": 0,
    "rentalTerms": 0,
    "accessoriesIncluded": 0,
    "bundleIncluded": 0,
    "rating": 0,
    "reviewCount": 0,
    "stock": 0,
    "salePrice": 0,
    "url": 0
  }
}
```

`fieldCompleteness` values are ratios in `[0,1]` calculated from the exported camera rows for that run.

Hard DEV7 checks:
- V16 products completed `DIRECT` must have `geminiCallsForDirectProducts = 0`.
- queued irrelevant URL candidates must be `0` in V16 benchmark metrics.
- exact 13 completeness keys/order is required.

Comparison deliberately reports, rather than pre-promises, wall-clock time. Candidate/page/screenshot/Gemini deltas show whether V16 is materially narrower; DEV0 can make the final release judgement from measured data.

Run after DEV0 has produced real metrics JSON:

```powershell
node .\scripts\v16\benchmark-harness.mjs --v15 .\artifacts\v15-metrics.json --v16 .\artifacts\v16-metrics.json --out .\artifacts\V16_BENCHMARK.md
```
