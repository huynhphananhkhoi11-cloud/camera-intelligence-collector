# V04 Minimal Vision — Acceptance Procedure

Dev7 owns the Smoke4/Sentinel10 acceptance harness only. It does not modify V04 production code and unit tests never call Gemini live.

## Preconditions

1. Work only in the clean V04 worktree from the rebuild pack.
2. Dev0 has integrated the temporary package script:

   ```json
   "smart-batch:minimal": "tsx src/v04/cli/smartBatchMinimal.ts"
   ```

3. The temporary CLI accepts:
   - input URL text file as its positional source;
   - `--output <xlsx>`;
   - `--capture-root <dir>`;
   - `--headless`.
4. The CLI exposes the durable `BatchSummary` without adding another CLI flag. The acceptance harness accepts either:
   - a final one-line JSON object on stdout containing `summary: { total, validated, review, skippedNonCamera, errors }`; or
   - `<output>.run-report.json` / `<output>.run-summary.json` containing that summary.
5. Immediately before each live acceptance run, refresh the selected CAMERA cases in `benchmarks/v3/ground_truth.json`. Replace provisional/stale `sourceStatus` values with a timestamped marker such as `BROWSER_REFRESHED_2026-09-21T15:00:00+07:00`. Dev7 does not own or rewrite benchmark truth.

The runners fail before invoking the live CLI if a selected CAMERA case is still marked stale.

## Unit acceptance harness

No live provider is invoked by these tests:

```powershell
npx.cmd vitest run tests/v04/acceptance/smoke4.test.ts tests/v04/acceptance/sentinel10.test.ts
```

Both tests assert that the command actually generated for `smart-batch:minimal` contains `--headless`.

## Smoke4

Exact cases:

- S01
- S07
- S08
- S10

Run:

```powershell
npx.cmd tsx scripts/v04/run-smoke4.mjs
```

Required gate:

```text
validated = 4
review = 0
skippedNonCamera = 0
errors = 0
comparator mismatches = 0
```

Artifacts are written under `.camintel/acceptance/v04/` and must remain untracked.

## Sentinel10

Run only after Smoke4 passes:

```powershell
npx.cmd tsx scripts/v04/run-sentinel10.mjs
```

Required gate:

```text
validated = 8
skippedNonCamera = 2
review = 0
errors = 0
comparator mismatches = 0
```

The harness uses the frozen S01-S10 IDs from the existing benchmark truth and reproduces the exact 13-column workbook comparator contract. It fails on missing CAMERA rows, leaked negative sentinels, product/condition/selected-variant mismatches, dynamic price/stock/review mismatches, accessory/bundle contamination, and required-null violations.

## Final V04 release scans

Run these at the exact candidate SHA after Smoke4 and Sentinel10 are green.

### 1. Retailer / product / benchmark-price hardcodes in production

The benchmark truth intentionally contains retailer/product/price values. Production V04 code must not.

```powershell
git grep -n -i -E 'zshop|vjshop|mayanhtop1|canon eos r50|sony alpha a7|15[_., ]*990[_., ]*000|53[_., ]*990[_., ]*182|15[_., ]*790[_., ]*000|20[_., ]*290[_., ]*000|18[_., ]*000[_., ]*000|400[_., ]*000' -- src/v04
```

Expected: no matches.

### 2. Selected-offer / field-by-field semantic machinery

```powershell
git grep -n -i -E 'selected[-_ ]offer|field[-_ ]by[-_ ]field|rawText|evidenceCompactor|evidencePacket|evidenceSpool|evidenceTypes|groundingValidator|entityConsistency' -- src/v04 ':(exclude)src/v04/diagnostics/legacySemanticScanner.ts'
```

Expected: no matches in V04 production code.

### 3. Secrets and forbidden local artifacts

If the existing release scanner is present:

```powershell
node scripts/release/verify-no-secrets.mjs --tracked
```

Also inspect V04-owned paths directly:

```powershell
git grep -n -E 'AIza[0-9A-Za-z_-]{35}|gh[pousr]_[A-Za-z0-9]{20,255}|github_pat_[A-Za-z0-9_]{20,255}|sk-(proj-)?[A-Za-z0-9_-]{20,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----' -- src/v04 tests/v04 scripts/v04 docs/v04
```

Expected: no matches.

Check that runtime artifacts are not tracked:

```powershell
git ls-files | Where-Object { $_ -match '^\.camintel/|\.run-state\.json$|\.partial\.xlsx$|(^|/)data/profiles/' -or (($_ -match '(^|/)\.env($|\.)') -and ($_ -notmatch '\.env\.example$')) }
```

Expected: no matches.

## Final verification

```powershell
npm.cmd run check
npx.cmd vitest run
git diff --check
npx.cmd vitest run tests/v04/acceptance/smoke4.test.ts tests/v04/acceptance/sentinel10.test.ts
```

Do not point `smart-batch:v2` at V04 and do not delete V3 semantic machinery until Sentinel10 passes and Dev0 performs the final cutover/retirement sequence.
