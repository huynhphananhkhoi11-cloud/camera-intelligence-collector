# FIX13 Release Manifest

## Base lineage

Remote base: `integration/v3-vision-first`

## V15 snapshot

The release is intended to overlay the frozen V15/FIX12 source/test snapshot used during the D10+1 investigation, then apply the single FIX13 arbitration delta documented in `FIX13_ARCHITECTURE.md`.

## Intended frozen surface

- `src/v04/**`
- `tests/v04/**`
- V15 live comparator/benchmark support under `tests/live/v3/**`
- `scripts/v04/**`
- `benchmarks/v3/run_sentinel_benchmark.ps1`
- root `package.json` and `tsconfig.json` from the validated FIX12 snapshot

## No semantic hardcodes

FIX13 does not add retailer names, benchmark case IDs, expected stock strings, product-specific values, or regex-based semantic extraction to production code.
