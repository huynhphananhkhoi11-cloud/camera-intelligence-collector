# V3 AI-Owned Semantics / Direct 13-Column Decision Design

Date: 2026-09-21
Status: Approved architecture

## Goal
Gemini owns semantic interpretation and decides which visible facts belong in the existing 13 workbook columns. Local code owns only structure, provenance, durability, authoritative website/URL metadata, deterministic serialization, quota/error handling, and checkpoint/resume.

## Preserve
Keep adaptive visual capture, Gemini 3.5 Flash Lite, one AI call per product, plain JSON, provider profiles, durable run state, resume without duplicate AI calls/rows, artifacts, workbook infrastructure, and sentinel benchmarks. Do not add DOM product-data extraction.

## Canonical decision
Gemini returns one plain JSON object with classification = CAMERA_PRODUCT | NON_CAMERA | REVIEW, a canonical row, evidence per populated semantic field, and optional reviewReason.

Canonical row fields map one-to-one to the 13 columns:
website, productName, condition, specs, rentalPricePerDay, rentalTerms, accessoriesIncluded, bundleIncluded, rating, reviewCount, stock, salePrice, url.

## Semantic ownership
Gemini decides selected product/variant, NEW/USED, specs, rental vs sale, rental terms, accessory vs bundle, rating, review count, stock, and non-camera classification.

Application code MUST NOT move model output between semantic fields or add retailer-specific semantic rules such as matching “Thuê 1 Ngày”, “Body Only”, “Tặng”, or “Combo” to fields.

## Evidence
Each populated semantic field except authoritative website/url requires evidence with shotId and rawText. Local validation checks only shape, valid shotId, non-empty rawText, and required evidence. Invalid provenance becomes REVIEW; code does not semantically repair.

## Authoritative metadata
website comes from the known page host and url from final browser URL.

## One-call rule
At most one semantic Gemini call per product. No second AI repair/classification call. Malformed or unsupported output becomes REVIEW.

## Workbook
Workbook stays exactly:
1 Website
2 Tên sản phẩm
3 Hàng cũ/Hàng mới
4 Thông số mô tả
5 Giá thuê/ngày
6 Điều kiện thuê riêng
7 Phụ kiện đi kèm
8 Combo/gói đi kèm
9 Điểm đánh giá
10 Số lượt đánh giá/review
11 Tồn kho
12 Giá bán
13 URL

Exporter performs deterministic representation only and does not reinterpret semantics.

## Prompt responsibilities
Tell Gemini to inspect all screenshots, reason across the page, identify the selected primary camera, assign each visible fact to the most appropriate workbook field, avoid duplicate/unrelated placement, preserve variant identity, distinguish rental/sale/accessory/bundle/spec/condition/stock/rating/reviews by meaning, use null when absent, never fabricate, and cite shotId/rawText.

## Acceptance
Fresh Sentinel-10 must yield 10 total URLs, 8 camera rows, 2 non-camera skips, 0 unexpected REVIEW, 0 errors, and 0 workbook mismatches. S01 must preserve Canon EOS R50 Body Only, NEW, sale price, explicit one-day rental price when visible, accessories in Phụ kiện đi kèm, and no false bundle.

## Release gate
Before publish: targeted tests, TypeScript, fresh S01, fresh Sentinel-10, comparator zero mismatches, full suite, build if present, git diff --check, secret scan, and final git status/diff review must all pass.

## Migration
Preserve capture/provider/CLI/durable/workbook/benchmark infrastructure. Replace only the semantic boundary with:
screenshots -> AI-owned 13-column semantic decision + evidence -> thin structural/provenance validation -> deterministic workbook serialization.

## 2026-09-21 amendment: best-effort semantic rows

The human-approved operating rule is best-effort semantics for a clearly identified camera product.

- Gemini still owns all semantic interpretation and mapping into the 13 workbook columns.
- If screenshots clearly show a camera product and its base identity is readable, missing or uncertain optional fields do not by themselves force REVIEW.
- Each optional field is independent: keep supported values; use `null` or `[]` only for the field that is absent or uncertain.
- A structural normalizer may canonicalize recoverable representation differences only: missing optional row keys to `null`, missing specs to `[]`, one string where a string array is expected to a one-item array, and evidence `null`/single-entry objects to arrays.
- Structural normalization must not infer camera semantics, change classifications, derive prices, select variants, or invent evidence text.
- REVIEW is reserved for unusable or contradictory screenshots, invalid/unrecoverable model output, or cases where the primary page cannot be identified as a camera product or a clear non-camera page.

