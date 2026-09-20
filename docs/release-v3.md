# Camera Intelligence V3 Vision-First Release Procedure

This document is the Dev7 release/security handoff for `v3.0.0-rc1`.

## Release safety rules

- Release target is `integration/v3-vision-first` only.
- Do not merge `main` without explicit user approval.
- Do not publish an RC unless all required gates below are green at the exact target SHA.
- Do not treat rerunning a flaky test as evidence. A flaky failure must be root-caused or the RC remains blocked.
- Do not commit or upload Gemini/Auth keys, `.env` files, local provider stores, run-state files, capture spools, or live workbooks containing secrets.
- A quota pause/resume path is valid; quota-circumvention account/project hopping is not part of this release.

## Required gates before `v3.0.0-rc1`

1. `npm.cmd run check` PASS.
2. `npm.cmd test` PASS — full suite run 1.
3. `npm.cmd run build` PASS.
4. `git diff --check` PASS.
5. `node scripts/release/verify-no-secrets.mjs --tracked` PASS.
6. `npm.cmd test` PASS — independent full suite run 2.
7. Dev6 10-URL live benchmark PASS with timestamped ground truth.
8. Dev6 3-site crawl smoke PASS for `zshop.vn`, `vjshop.vn`, and `mayanhtop1.com`.
9. Crash/resume evidence shows no duplicate AI call for already COMMITTED URLs and no duplicate workbook row.
10. Provider failure-injection evidence covers 401/403, 503/network, 429 rate-limit, and 429 quota-exceeded behavior.
11. Final workbook passes:

   ```powershell
   node scripts/release/verify-camera13-workbook.mjs .\CameraIntelligence_V3_RC.xlsx
   ```

12. Final GitHub Actions release gate is green at the exact RC SHA.

## Exact Camera Data contract

`Camera Data` must contain exactly these 13 columns in this order:

1. Website
2. Tên sản phẩm
3. Hàng cũ/Hàng mới
4. Thông số mô tả
5. Giá thuê/ngày
6. Điều kiện thuê riêng
7. Phụ kiện đi kèm
8. Combo/gói đi kèm
9. Điểm đánh giá
10. Số lượt đánh giá/review
11. Tồn kho
12. Giá bán
13. URL

Technical metadata belongs in Decision Audit or another technical sheet, not in `Camera Data`.

## Evidence bundle

For the target SHA, retain:

- GitHub Actions run URL/ID for the two-full-green release gate.
- Dev6 benchmark report and timestamped manual ground truth.
- 3-site smoke report.
- failure-injection/resume evidence.
- final workbook verification output.
- release notes with changed files, known risks, rollback, and reproducible commands.

No secrets may appear in logs, workbook cells, release notes, artifacts, or git diff.

## RC publication checklist

Only after every gate is green:

```powershell
git switch integration/v3-vision-first
git pull --ff-only
git status --short
git rev-parse HEAD
npm.cmd run check
npm.cmd test
npm.cmd run build
npm.cmd test
node scripts/release/verify-no-secrets.mjs --tracked
node scripts/release/verify-camera13-workbook.mjs .\CameraIntelligence_V3_RC.xlsx
```

Verify the printed SHA matches the SHA covered by benchmark and CI evidence. Then create `v3.0.0-rc1` at that exact SHA and publish it as a prerelease with the evidence bundle. Do not force-push or move the tag after publication.

## Rollback

- Keep the existing `smart-batch` path intact; Vision-First uses the new path/flag provided by integration.
- Release tags must point to immutable SHAs.
- If the RC fails a post-publication verification, mark it superseded and produce a new RC tag; do not move the existing tag.
- `main` remains untouched until explicit approval.
