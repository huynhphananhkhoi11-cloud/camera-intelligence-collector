# AI-Owned 13-Column Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the V3 production semantic boundary so one Gemini 3.5 Flash Lite vision call directly decides the existing 13 workbook fields and provides screenshot evidence, while local code validates only structure/provenance and serializes deterministically.

**Architecture:** Preserve adaptive capture, provider profiles, quota handling, durable run-state, checkpoint/resume, CLI orchestration, artifacts, workbook infrastructure, and sentinel benchmarks. Replace the current field-extraction semantic contract with a canonical AI decision object: `classification + row + evidence + reviewReason`. The production path must not contain retailer-specific semantic remapping rules.

**Tech Stack:** TypeScript, Zod, Vitest, Playwright, ExcelJS, Gemini Interactions API, existing V3 durable CLI.

**Spec:** `docs/superpowers/specs/2026-09-21-ai-owned-semantics-13-column-design.md`

## Global Constraints

- Default semantic model remains `gemini-3.5-flash-lite`.
- One normal Gemini semantic call per product.
- Plain JSON response; no provider-side JSON Schema dependency.
- Visual-only product semantics; no DOM product-data extraction.
- Existing 13-column workbook contract is unchanged.
- `website` and `url` are authoritative local context.
- Local code must not semantically move facts between product fields.
- Populated semantic fields require valid screenshot provenance.
- Invalid/malformed decisions become REVIEW; no semantic repair call.
- Resume must not duplicate Gemini calls or workbook rows.
- Sentinel benchmark truth must not be weakened.

## Review Focus

1. A populated field whose evidence references an unknown shotId must become REVIEW.
2. A populated semantic field without evidence must become REVIEW, except authoritative website/url.
3. NON_CAMERA decisions must not create workbook rows and must preserve durable completion state.
4. Money values must remain numeric plus currency through parsing and workbook serialization.
5. Resume after a persisted semantic decision must not invoke Gemini again or append a duplicate row.

---

### Task 1: Canonical AI Semantic Decision Contract

**Files:**
- Create: `src/v03/ai/semanticDecisionSchema.ts`
- Create: `tests/v03/ai/semanticDecisionSchema.test.ts`
- Modify: `src/v03/ai/visualExtractionSchema.ts` only if a compatibility adapter is required by existing callers; do not add semantic heuristics.

**Interfaces:**
- Produces:
  - `SemanticClassification = "CAMERA_PRODUCT" | "NON_CAMERA" | "REVIEW"`
  - `SemanticEvidence = { shotId: string; rawText: string }`
  - `SemanticMoney = { value: number; currency: string }`
  - `SemanticRow`
  - `SemanticDecision`
  - `validateSemanticDecision(decision, allowedShotIds, authoritativeContext)`

- [ ] **Step 1: Write failing schema tests**

Test cases must assert:
- CAMERA_PRODUCT accepts a canonical row with evidence.
- NON_CAMERA accepts `row: null`.
- populated productName without evidence is rejected to REVIEW.
- evidence with invalid shotId is rejected to REVIEW.
- website/url in output are overwritten or ignored in favor of authoritative context.
- money `value` must be numeric, not a quoted number.

Run:

```powershell
npx.cmd vitest run tests/v03/ai/semanticDecisionSchema.test.ts
```

Expected: FAIL because `semanticDecisionSchema.ts` does not exist.

- [ ] **Step 2: Implement the minimal schema/validator**

Use Zod for structural parsing. The validator must:
- parse the canonical decision;
- verify evidence keys correspond to populated semantic row fields;
- require at least one valid evidence item for each populated semantic field except website/url;
- verify every evidence `shotId` is in the supplied capture shot set;
- return REVIEW on structural/provenance failure rather than moving data between fields;
- inject authoritative website/url into CAMERA_PRODUCT rows.

Do not inspect `rawText` contents to decide semantics.

- [ ] **Step 3: Verify Task 1 green**

```powershell
npx.cmd vitest run tests/v03/ai/semanticDecisionSchema.test.ts
npm.cmd run check
```

Expected: PASS.

- [ ] **Step 4: Commit Task 1**

```powershell
git add src/v03/ai/semanticDecisionSchema.ts tests/v03/ai/semanticDecisionSchema.test.ts src/v03/ai/visualExtractionSchema.ts
git commit -m "feat(v3): add AI semantic decision contract"
```

---

### Task 2: Make Gemini Own the 13-Column Semantic Decision

**Files:**
- Modify: `src/v03/ai/gemini36VisualExtractor.ts`
- Create: `tests/v03/ai/geminiSemanticDecisionPrompt.test.ts`
- Update: `tests/v03/ai/gemini36VisualExtractor.test.ts`
- Update compatibility tests only where they still assert the obsolete extraction contract.

**Interfaces:**
- Consumes screenshots plus authoritative page/final URL and allowed shot IDs.
- Produces one parsed `SemanticDecision`.
- Makes one Gemini Interactions API request.

- [ ] **Step 1: Write failing prompt/response tests**

Prompt tests must assert general responsibilities, not retailer strings:
- inspect all screenshots before finalizing;
- classify CAMERA_PRODUCT/NON_CAMERA/REVIEW;
- directly assign visible facts to the canonical row fields;
- distinguish sale vs rental by meaning;
- distinguish accessory vs bundle by meaning;
- preserve selected variant identity in productName;
- do not duplicate one fact into unrelated fields;
- null when evidence is absent;
- never fabricate;
- attach `shotId/rawText` evidence;
- return exactly one plain JSON object;
- no `response_format` provider schema.

Response tests must assert the extractor accepts a canonical semantic decision and preserves one-call behavior.

Run:

```powershell
npx.cmd vitest run tests/v03/ai/geminiSemanticDecisionPrompt.test.ts tests/v03/ai/gemini36VisualExtractor.test.ts
```

Expected: FAIL against the old extraction contract.

- [ ] **Step 2: Replace the prompt contract**

Change the prompt from retailer/example-specific repair rules to column semantics. Include concise definitions for:
- productName
- condition
- specs
- rentalPricePerDay
- rentalTerms
- accessoriesIncluded
- bundleIncluded
- rating
- reviewCount
- stock
- salePrice

The prompt must tell Gemini to reason about the entire screenshot set before assigning facts and to provide evidence per populated field.

Remove or stop depending on narrow repair instructions introduced for S01 such as specific `Body Only`/`Thuê 1 Ngày` examples in the production semantic path. General examples are allowed only when they explain a category, not a retailer-specific mapping.

- [ ] **Step 3: Parse through the new semantic decision contract**

After plain JSON parse:
- call the new structural/provenance validator;
- do not perform semantic coercion/remapping;
- preserve existing provider telemetry and redacted diagnostic behavior.

- [ ] **Step 4: Verify Task 2 green**

```powershell
npx.cmd vitest run tests/v03/ai/geminiSemanticDecisionPrompt.test.ts tests/v03/ai/gemini36VisualExtractor.test.ts tests/v03/ai/geminiModelSelection.test.ts tests/v03/ai/geminiPlainJsonContract.test.ts
npm.cmd run check
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add src/v03/ai/gemini36VisualExtractor.ts tests/v03/ai/geminiSemanticDecisionPrompt.test.ts tests/v03/ai/gemini36VisualExtractor.test.ts tests/v03/ai/geminiModelSelection.test.ts tests/v03/ai/geminiPlainJsonContract.test.ts
git commit -m "feat(v3): let Gemini own workbook semantics"
```

---

### Task 3: Deterministic Workbook Mapping Without Semantic Remapping

**Files:**
- Modify: `src/v03/ai/scaleWorkbookExporter.ts`
- Modify: `src/v03/cli/smartBatchV2DurableCli.ts`
- Create or update: `tests/v03/ai/semanticDecisionWorkbook.test.ts`
- Update: `tests/v03/cli/smartBatchV2DurableRuntime.test.ts`

**Interfaces:**
- Consumes validated `SemanticDecision`.
- Produces:
  - exactly one workbook row for CAMERA_PRODUCT;
  - no row for NON_CAMERA;
  - REVIEW state for REVIEW;
  - persisted semantic-decision and validation artifacts.

- [ ] **Step 1: Write failing workbook/runtime tests**

Test:
- a canonical row maps one-to-one to the existing 13 headers;
- accessoriesIncluded writes only to `Phụ kiện đi kèm`;
- bundleIncluded writes only to `Combo/gói đi kèm`;
- rentalPricePerDay writes only to `Giá thuê/ngày`;
- salePrice writes only to `Giá bán`;
- exporter never moves values between these fields;
- NON_CAMERA creates no camera row;
- persisted completed semantic decision is reused on resume;
- resume performs no second Gemini call and no duplicate workbook row.

Run:

```powershell
npx.cmd vitest run tests/v03/ai/semanticDecisionWorkbook.test.ts tests/v03/cli/smartBatchV2DurableRuntime.test.ts
```

Expected: FAIL until production path consumes `SemanticDecision`.

- [ ] **Step 2: Add deterministic semantic-row serializer**

In `scaleWorkbookExporter.ts`, map canonical fields directly:
- website -> Website
- productName -> Tên sản phẩm
- condition -> Hàng cũ/Hàng mới
- specs -> Thông số mô tả
- rentalPricePerDay -> Giá thuê/ngày
- rentalTerms -> Điều kiện thuê riêng
- accessoriesIncluded -> Phụ kiện đi kèm
- bundleIncluded -> Combo/gói đi kèm
- rating -> Điểm đánh giá
- reviewCount -> Số lượt đánh giá/review
- stock -> Tồn kho
- salePrice -> Giá bán
- url -> URL

Only formatting is allowed:
- arrays join deterministically;
- money is formatted deterministically;
- null becomes blank.

- [ ] **Step 3: Wire durable CLI to SemanticDecision**

In `smartBatchV2DurableCli.ts`:
- capture screenshots as before;
- make one extractor call;
- persist raw output/parsed decision/validation artifacts;
- CAMERA_PRODUCT -> workbook row;
- NON_CAMERA -> durable non-camera transition, no row;
- REVIEW -> durable review transition, no fabricated row;
- resume behavior remains based on persisted state and must not repeat the AI call.

- [ ] **Step 4: Verify Task 3 green**

```powershell
npx.cmd vitest run tests/v03/ai/semanticDecisionWorkbook.test.ts tests/v03/cli/smartBatchV2DurableRuntime.test.ts
npm.cmd run check
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add src/v03/ai/scaleWorkbookExporter.ts src/v03/cli/smartBatchV2DurableCli.ts tests/v03/ai/semanticDecisionWorkbook.test.ts tests/v03/cli/smartBatchV2DurableRuntime.test.ts
git commit -m "feat(v3): serialize AI semantic rows directly"
```

---

### Task 4: Live Acceptance, Quota Hardening, and Publish Gate

**Files:**
- Modify only if a test proves necessary: `src/v03/provider/errorClassifier.ts`
- Update/add corresponding provider test if daily-quota classification needs correction.
- Do not weaken `benchmarks/v3/ground_truth.json`.

**Interfaces:**
- Fresh S01 and Sentinel-10 runs prove the production path.

- [ ] **Step 1: Run targeted local suite**

```powershell
npx.cmd vitest run tests/v03/ai/semanticDecisionSchema.test.ts tests/v03/ai/geminiSemanticDecisionPrompt.test.ts tests/v03/ai/semanticDecisionWorkbook.test.ts tests/v03/cli/smartBatchV2DurableRuntime.test.ts
npm.cmd run check
git diff --check
```

Expected: PASS.

- [ ] **Step 2: Run fresh S01**

Use the durable CLI with only the first URL from `benchmarks/v3/sentinel_10_urls.txt`.

Acceptance:
- total 1
- validated 1
- review 0
- skippedNonCamera 0
- errors 0
- workbook comparator: 0 mismatches.

Do not continue if S01 fails.

- [ ] **Step 3: Run fresh Sentinel-10**

Use the durable CLI against the full sentinel file.

Acceptance:
- total 10
- validated 8
- skippedNonCamera 2
- review 0
- errors 0
- workbook comparator: 0 mismatches.

- [ ] **Step 4: If and only if quota classification is wrong, TDD it**

For an explicit provider response containing a daily request limit, the classifier must produce DAILY_QUOTA even if the provider error code is generic `too_many_requests`.

Write the failing test first, then patch only the classifier, then rerun provider tests.

- [ ] **Step 5: Full verification**

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run build --if-present
git diff --check
git status --short
git diff --stat
git diff
```

Review all output. No secrets or API keys may appear in tracked changes.

- [ ] **Step 6: Secret scan before publish**

At minimum:

```powershell
git grep -n -I -E "AIza[0-9A-Za-z_-]{20,}|GEMINI_API_KEY|api[_-]?key" -- . ":(exclude).camintel/**"
```

Investigate every hit. Test fixtures may contain placeholders, but no real credential may be committed.

- [ ] **Step 7: Commit remaining implementation changes**

After all fresh gates pass:

```powershell
git add -A
git status --short
git commit -m "feat(v3): ship AI-owned vision semantics"
```

Do not include `.camintel` runtime artifacts or generated benchmark workbooks unless intentionally tracked by project policy.

- [ ] **Step 8: Publish**

Confirm current branch and remote first:

```powershell
git branch --show-current
git remote -v
git log -3 --oneline
```

Expected branch: `integration/v3-vision-first`.

Then push without force:

```powershell
git push -u origin integration/v3-vision-first
```

If push is rejected, stop and investigate. Never force-push automatically.

## Final Completion Evidence

Publication may be reported complete only with fresh evidence for:
- S01 comparator = 0 mismatches;
- Sentinel-10 comparator = 0 mismatches;
- full test suite = 0 failures;
- TypeScript = exit 0;
- build = exit 0 or no build script;
- diff check = exit 0;
- no credential leak;
- final implementation commit SHA;
- successful non-force push to `origin/integration/v3-vision-first`.

## 2026-09-21 execution ruling: best-effort semantics

User-approved ruling supersedes the earlier strict optional-field completeness gate for recoverable omissions. Keep AI-owned semantics and one Gemini call per product. Add a generic structural normalization boundary immediately before semantic decision validation, keep provenance validation for evidence that exists, and do not turn a clear camera row into REVIEW solely because an optional field or optional evidence entry is absent. Acceptance remains fresh S01 comparator=0 and fresh Sentinel-10 with 8 camera rows, 2 non-camera skips, 0 unexpected REVIEW/errors, comparator=0.

