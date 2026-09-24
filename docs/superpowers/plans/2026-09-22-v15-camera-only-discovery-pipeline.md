# V15 Camera-Only Discovery Pipeline — DEV0 Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the frozen V15 architecture from visual site reconnaissance through Gemini camera-route selection, route-constrained product discovery, pipelined product capture/interpretation, and final 13-column Excel export.

**Architecture:** The browser is only a visual sensor/compressor; Gemini owns semantic route selection and product interpretation; the runtime owns bounded orchestration, durability, structure, and export. Seven implementation lanes work against DEV0-frozen cross-lane contracts, while DEV0 alone owns shared contract wiring, final orchestration, CLI cutover, and release gates.

**Tech Stack:** TypeScript, Node.js, Playwright, Vitest, Gemini `gemini-3.5-flash-lite`, ExcelJS.

**Spec:** `2026-09-22-v15-camera-only-discovery-pipeline-design.md`

## Global Constraints

- Do not change the frozen architecture without explicit user approval.
- Browser/Camera Intelligence performs no ecommerce semantic inference.
- Gemini is the sole semantic interpreter.
- Discovery begins only from Gemini-approved camera routes.
- Product visual packets are frozen before Gemini interpretation.
- Capture N+1 overlaps Gemini N through a bounded queue.
- Capture workers = 1, Gemini workers = 1, queue capacity = 2 for the first V15 implementation.
- Preserve V13.2 screenshot reliability.
- Preserve V14.1 13-column semantic contract.
- Preserve provider retry/quota/backoff and durable checkpoint/resume.
- One logical product semantic call per product.
- No retailer-specific rules, benchmark hardcodes, local semantic repair, or unbounded concurrency.
- No commit/push/merge/rebase during parallel delivery.

## Review Focus

1. **Gemini hallucinates/unrecognized route IDs:** runtime must accept only candidate IDs actually observed in the reconnaissance packet.
2. **One Gemini item is slow while capture advances:** bounded queue must stop capture at capacity 2 rather than grow memory or API work without bound.
3. **Concurrent completion arrives out of order:** workbook/result sequence must follow original product sequence, not completion order.
4. **Crash after capture but before semantic completion:** resume must reuse the frozen persisted packet and not silently mark the item complete.
5. **Late-loading hero UI:** final hero refresh must occur after broad capture with generic bounded settle and no field-specific waiting logic.

---

## File Ownership Map

### DEV0-only

- Create: `src/v04/contracts/v15PipelineContracts.ts`
- Create: `src/v04/pipeline/cameraOnlyDiscoveryPipeline.ts`
- Modify: `src/v04/cli/smartBatchMinimal.ts`
- Modify: `package.json` only if canonical script alias changes
- Create: `docs/superpowers/plans/2026-09-22-v15-camera-only-discovery-pipeline.md`

### Imported lane outputs

- DEV1: `src/v04/recon/siteReconnaissance.ts`
- DEV2: `src/v04/ai/cameraRouteSelector.ts`
- DEV3: `src/v04/discovery/approvedRouteDiscovery.ts`
- DEV4: `src/v04/vision/productCapturePacket.ts`
- DEV5: `src/v04/runtime/pipelinedProductRuntime.ts`
- DEV6: `src/v04/ai/productCameraSemanticPrompt.ts`
- DEV7: tests/scripts only

---

### Task 1: Freeze Cross-Lane Contracts

**Files:**
- Create: `src/v04/contracts/v15PipelineContracts.ts`
- Test: `tests/v04/contracts/v15PipelineContracts.test.ts`

**Interfaces:**
- Produces: `NavigationCandidate`, `NavigationVisualShot`, `SiteReconnaissancePacket`, `ApprovedCameraRoute`, `CameraRouteDecision`, `FrozenProductVisualPacket`, `CapturedProductWorkItem`.

- [ ] **Step 1: Write the failing contract test**

Assert:
- route decisions contain only candidate IDs;
- packet arrays are readonly at the TypeScript boundary;
- product packet carries `itemId`, `sequence`, URLs, screenshots, manifest, manifest path, and image paths.

- [ ] **Step 2: Run RED**

```powershell
npx.cmd vitest run tests/v04/contracts/v15PipelineContracts.test.ts
```

Expected: import failure because the shared contract module does not yet exist.

- [ ] **Step 3: Implement the exact interfaces from `V15_SHARED_CONTRACT.md`**

No semantic helper functions are permitted in this module.

- [ ] **Step 4: Run GREEN**

```powershell
npx.cmd vitest run tests/v04/contracts/v15PipelineContracts.test.ts
npm.cmd run check
```

Expected: PASS.

---

### Task 2: Integrate DEV1 + DEV2 Site Route Selection

**Files:**
- Consume: `src/v04/recon/siteReconnaissance.ts`
- Consume: `src/v04/ai/cameraRouteSelector.ts`
- Create/Modify: `src/v04/pipeline/cameraOnlyDiscoveryPipeline.ts`
- Test: `tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts`

**Interfaces:**
- Consumes: root site URL.
- Produces: `readonly ApprovedCameraRoute[]`.

- [ ] **Step 1: Write RED test**

Fixture:
- reconnaissance packet exposes candidates `c1`, `c2`, `c3`;
- Gemini route decision returns `["c2", "missing", "c2"]`.

Expected resolved output:
- only one route;
- route is exactly candidate `c2`;
- `missing` ignored;
- duplicate removed;
- no guessed URL.

- [ ] **Step 2: Run RED**

```powershell
npx.cmd vitest run tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts
```

- [ ] **Step 3: Implement route resolution**

Resolution must be ID-based only:

```ts
const byId =
  new Map(
    packet.candidates.map(
      candidate => [
        candidate.candidateId,
        candidate
      ]
    )
  );
```

Walk decision IDs in order, ignore unknown IDs, dedupe by ID, and convert to `ApprovedCameraRoute`.

- [ ] **Step 4: Run GREEN + TypeScript**

```powershell
npx.cmd vitest run tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts
npm.cmd run check
```

---

### Task 3: Integrate DEV3 Route-Constrained Discovery

**Files:**
- Consume: `src/v04/discovery/approvedRouteDiscovery.ts`
- Modify: `src/v04/pipeline/cameraOnlyDiscoveryPipeline.ts`
- Test: `tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts`

**Interfaces:**
- Consumes: `readonly ApprovedCameraRoute[]`.
- Produces: deterministic de-duplicated product URL queue.

- [ ] **Step 1: Add RED case**

Provide:
- approved routes A and B;
- discovery A → `[p1, p2]`;
- discovery B → `[p2, p3]`.

Expect:
```ts
["p1", "p2", "p3"]
```

No discovery call may be made for an unapproved candidate.

- [ ] **Step 2: Run RED**

```powershell
npx.cmd vitest run tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts
```

- [ ] **Step 3: Wire route discovery**

Preserve approved route order and first-seen product URL order.

- [ ] **Step 4: Run GREEN**

```powershell
npx.cmd vitest run tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts
npm.cmd run check
```

---

### Task 4: Integrate DEV4 + DEV6 Product Processing Contracts

**Files:**
- Consume: `src/v04/vision/productCapturePacket.ts`
- Consume: `src/v04/ai/productCameraSemanticPrompt.ts`
- Modify: `src/v04/pipeline/cameraOnlyDiscoveryPipeline.ts`
- Test: `tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts`

**Interfaces:**
- Capture produces `FrozenProductVisualPacket`.
- Semantic worker consumes packet and produces existing `MinimalVisualDecision`.

- [ ] **Step 1: Add RED case**

Assert semantic function receives:
- the frozen packet created for the same `itemId`;
- all final screenshots;
- final URL;
- no mutable Playwright page.

- [ ] **Step 2: Run RED**

```powershell
npx.cmd vitest run tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts
```

- [ ] **Step 3: Wire adapters only**

Do not perform field inference or repair in pipeline code.

- [ ] **Step 4: Run GREEN**

```powershell
npx.cmd vitest run tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts
npm.cmd run check
```

---

### Task 5: Integrate DEV5 Bounded Pipeline

**Files:**
- Consume: `src/v04/runtime/pipelinedProductRuntime.ts`
- Modify: `src/v04/pipeline/cameraOnlyDiscoveryPipeline.ts`
- Test: `tests/v04/runtime/pipelinedProductRuntime.test.ts`
- Test: `tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts`

**Interfaces:**
- Ordered URL list in.
- Ordered persisted validation results out.

- [ ] **Step 1: Verify DEV5 targeted RED/GREEN evidence**

Run:

```powershell
npx.cmd vitest run tests/v04/runtime/pipelinedProductRuntime.test.ts
```

Must prove:
- capture P2 starts before semantic P1 resolves;
- capture cannot get more than queue capacity 2 ahead;
- final results retain input sequence;
- rejection/error does not silently reorder;
- resume skips already persisted semantic completions.

- [ ] **Step 2: Add pipeline-level RED integration test**

Use deferred promises:
1. capture P1 resolves;
2. semantic P1 remains blocked;
3. assert capture P2 has already started;
4. release semantic P1;
5. finish all;
6. assert output `[P1, P2]`.

- [ ] **Step 3: Run RED**

```powershell
npx.cmd vitest run tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts
```

- [ ] **Step 4: Wire the bounded runtime**

Use queue configuration:
```ts
{
  captureConcurrency: 1,
  semanticConcurrency: 1,
  queueCapacity: 2
}
```

- [ ] **Step 5: Run GREEN**

```powershell
npx.cmd vitest run tests/v04/runtime/pipelinedProductRuntime.test.ts tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts
npm.cmd run check
```

---

### Task 6: Canonical CLI Cutover

**Files:**
- Modify: `src/v04/cli/smartBatchMinimal.ts`
- Modify: `package.json` only if required
- Test: `tests/v04/cli/smartBatchMinimal.test.ts`
- Test: `tests/v04/acceptance/v15Architecture.test.ts`

**Interfaces:**
- Root/site input enters V15 discovery pipeline.
- Existing direct product-URL mode remains usable for Smoke4/Sentinel fixtures if acceptance harness depends on it.

- [ ] **Step 1: Write RED wiring test**

Assert canonical production path uses:
```text
site reconnaissance
→ route selector
→ approved route discovery
→ pipelined product runtime
```

and does not invoke legacy semantic discovery.

- [ ] **Step 2: Run RED**

```powershell
npx.cmd vitest run tests/v04/cli/smartBatchMinimal.test.ts tests/v04/acceptance/v15Architecture.test.ts
```

- [ ] **Step 3: Perform minimal CLI cutover**

No rewrite of provider/resume/workbook components. Inject/wrap them.

- [ ] **Step 4: Run GREEN**

```powershell
npx.cmd vitest run tests/v04/cli/smartBatchMinimal.test.ts tests/v04/acceptance/v15Architecture.test.ts
npm.cmd run check
git diff --check
```

---

### Task 7: Integrate DEV7 Release Harness

**Files:**
- Consume: `tests/v04/acceptance/v15Architecture.test.ts`
- Consume: `tests/v04/acceptance/v15Pipeline.test.ts`
- Consume: `scripts/v04/run-v15-smoke4.mjs`
- Consume: `scripts/v04/run-v15-sentinel10.mjs`

- [ ] **Step 1: Run targeted architecture suite**

```powershell
npx.cmd vitest run tests/v04/acceptance/v15Architecture.test.ts tests/v04/acceptance/v15Pipeline.test.ts
```

- [ ] **Step 2: Run full V04 code gate**

```powershell
npm.cmd run check
npx.cmd vitest run tests/v04
git diff --check
```

Do not proceed to live acceptance until all pass.

---

### Task 8: Fresh Live Release Gates

**Files:** no production edits during the gate unless a new failing test reproduces the issue first.

- [ ] **Step 1: Run fresh Smoke4**

```powershell
npx.cmd tsx scripts/v04/run-v15-smoke4.mjs
```

Required runtime summary:
- total 4;
- validated 4;
- review 0;
- errors 0.

Comparator target is 0 mismatch, but a fresh screenshot that visibly disagrees with a historical benchmark must trigger benchmark/live-state diagnosis rather than semantic hardcoding.

- [ ] **Step 2: If Smoke4 green, run fresh Sentinel10**

```powershell
npx.cmd tsx scripts/v04/run-v15-sentinel10.mjs
```

Required:
- 8 validated camera products;
- 2 skipped NON_CAMERA;
- 0 review;
- 0 errors.

- [ ] **Step 3: Verify final workbook export**

Confirm:
- exact 13 headers;
- camera rows only;
- no NON_CAMERA row;
- final file exists in configured output / Downloads;
- row order is deterministic.

- [ ] **Step 4: Canonical publish verification**

Run canonical CLI once from the final integrated tree and verify the same production path is used.

No release declaration before this fresh command succeeds.

---

## DEV0 Integration Rules

For every returned lane:

```powershell
git apply --check RED.patch
git apply RED.patch
# run expected RED

git apply --check GREEN.patch
git apply GREEN.patch
# run targeted GREEN

npm.cmd run check
git diff --check
```

DEV0 may reject a lane if:
- it edits another lane's owned files without necessity;
- it adds retailer/benchmark semantics;
- it changes frozen shared interface names;
- it removes existing accepted V13.2/V14.1 behavior;
- its HANDOFF lacks reproducible RED/GREEN evidence.

## Self-Review

Spec coverage:
- site reconnaissance: DEV1 + Task 2;
- Gemini route selection: DEV2 + Task 2;
- route-constrained discovery: DEV3 + Task 3;
- broad/final-hero/frozen capture: DEV4 + Task 4;
- overlapped bounded runtime: DEV5 + Task 5;
- camera-only product semantics + 13 columns: DEV6 + Task 4;
- acceptance/release: DEV7 + Tasks 7–8;
- CLI/cutover/export ownership: DEV0 + Tasks 6–8.

Placeholder scan: no implementation placeholders intentionally remain.

Type consistency: cross-lane names are frozen in `V15_SHARED_CONTRACT.md`.

Review-focus cases are assigned to Tasks 2, 5, and DEV4/DEV5 lane tests.
