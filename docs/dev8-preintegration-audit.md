# Dev8 Pre-Integration Audit — Vision-First V3

Baseline audited: `integration/v3-live-ai @ 39b9418`

Dev8 branch: `test/v3-cross-integration-acceptance-dev8`

## Branch readiness observed

- Dev1 `feat/v3-visual-capture-v2`: implementation present.
- Dev2 `feat/v3-gemini36-visual-extractor`: implementation present.
- Dev3 `feat/v3-provider-profiles-checkpoint`: implementation present.
- Dev4 `feat/v3-13col-validator-export`: implementation present.
- Dev5 `test/v3-release-hardening`: release regression tests present.
- Dev6 `bench/v3-live-10url`: benchmark/crawl fixtures and validators present.
- Dev7 `release/v3-vision-first`: CI/release/security work present.
- Dev8 `test/v3-cross-integration-acceptance-dev8`: cross-integration acceptance gate present.
- `integration/v3-vision-first`: not present at audit time.

## Confirmed compatible boundaries

### Dev1 -> Dev2 capture handoff

Dev1 emits `AdaptiveCaptureResult` with:
- `manifest.shots[].shotId`
- `manifest.shots[].resolution` = `high | medium`
- `manifest.shots[].sectionLabel`
- ordered `imagePaths[]`

Dev2 accepts up to six `VisualShot` objects with:
- `shotId`
- `mimeType`
- `base64`
- `resolution` including `high | medium`
- optional `sectionLabel`

The capture loop pushes `manifest.shots` and `imagePaths` together after duplicate-image suppression, so index-based pairing is currently safe.

**Dev0 wiring requirement:** read each PNG path, convert bytes to base64, set `mimeType: "image/png"`, and preserve `shotId/resolution/sectionLabel` from the same manifest entry.

### Dev2 -> Dev4 extraction/validation handoff

Dev4 explicitly mirrors Dev2's extraction payload. Core evidence shape is compatible:
`{ value, rawText, shotId }`.

**Dev0 wiring requirement:** validation context `shotIds` must be constructed from `capture.manifest.shots[].shotId`; `expectedUrl` must use the final rendered URL.

### Dev2 -> Dev3 provider error handoff

`GeminiVisualExtractionHttpError` exposes:
- `status`
- `retryAfter`
- response text inside the error message

Dev3's classifier reads `status`, `retryAfter`, and flattened error message text, so it can distinguish auth, transient errors, rate limit and daily quota without a custom adapter.

## BLOCKER — AI_IN_FLIGHT resume may duplicate Gemini calls

Current Dev3 `resumePlanner.ts` maps both:

`CAPTURED -> AI_EXTRACT`

and

`AI_IN_FLIGHT -> AI_EXTRACT`

For `AI_IN_FLIGHT`, a process may have already sent the Gemini request before crashing but not durably persisted the response. Reissuing `AI_EXTRACT` can therefore create a duplicate AI request.

This conflicts with the Vision-First release acceptance requirement that crash/resume must not duplicate AI calls/rows.

### Required resolution before RC

Dev0 + Dev3 must choose an explicit safe policy before integration is declared green:

1. Recover a durable provider interaction/request identifier and fetch/reconcile the in-flight result without reissuing; or
2. if no provider-side idempotent recovery exists in the implementation, hold `AI_IN_FLIGHT` as `REVIEW_HOLD`/uncertain instead of automatically reissuing; or
3. implement a documented idempotency mechanism and regression test proving the provider honors it.

Do not silently map `AI_IN_FLIGHT` to a fresh semantic call.

## Camera13 header correction in Dev8 gate

Dev8 originally expected column 6 as `Điều kiện thuê`. The official contract and Dev4 workbook use `Điều kiện thuê riêng`. Dev8 corrected its acceptance test in commit `565cc2e`.

## Dev0 integration checklist

Before merging feature branches:

1. Freeze `camera13.ts` shared contract.
2. Wire Dev1 screenshots to Dev2 VisualShot without recapture.
3. Persist `CAPTURED` before entering AI work.
4. Resolve the `AI_IN_FLIGHT` duplicate-call blocker above.
5. Persist extractor result before transitioning to `EXTRACTED`.
6. Build validator context from final URL/domain + manifest shot IDs.
7. Commit XLSX atomically only after VALIDATED.
8. Ensure COMMITTED resumes as skip/no-op.
9. Merge Dev5/Dev8 gates and run targeted tests.
10. Run full suite twice on the latest integration SHA before RC.

## Dev8 status

Dev8 should not modify Dev0/Dev1/Dev2/Dev3/Dev4 owned production files directly. The next Dev8 action after `integration/v3-vision-first` appears is to rebase/retarget the acceptance branch to that integration head, run/inspect the gate, and report any concrete failures by owner.
