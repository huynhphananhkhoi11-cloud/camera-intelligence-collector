# Minimal Gemini 13-Column Semantic Layer — Approved Design

**Date:** 2026-09-21
**Branch:** `integration/v3-vision-first`

## Goal

Keep the system simple:

**screenshots → Gemini understands the page → Gemini matches visible information to the 13 workbook columns → JSON → structural normalization → validation → Excel**

Gemini owns semantic understanding. Local code must not try to outsmart Gemini with retailer rules, keyword mappings, or field-specific repair logic.

## Core Principle

The prompt gives Gemini:

- all screenshots for the page;
- the authoritative website and final URL;
- the 13 workbook column names and JSON keys;
- the required JSON shape.

Gemini uses its own visual and language understanding to decide which visible information belongs in which column.

For each column:

- if Gemini can see a supported value, fill it;
- if it cannot see a supported value, use `null` or `[]` as appropriate.

## 13 Columns

1. Website → `website`
2. Tên sản phẩm → `productName`
3. Hàng cũ/Hàng mới → `condition`
4. Thông số mô tả → `specs`
5. Giá thuê/ngày → `rentalPricePerDay`
6. Điều kiện thuê riêng → `rentalTerms`
7. Phụ kiện đi kèm → `accessoriesIncluded`
8. Combo/gói đi kèm → `bundleIncluded`
9. Điểm đánh giá → `rating`
10. Số lượt đánh giá/review → `reviewCount`
11. Tồn kho → `stock`
12. Giá bán → `salePrice`
13. URL → `url`

## Classification

Gemini returns one of:

- `CAMERA_PRODUCT`
- `NON_CAMERA`
- `REVIEW`

`REVIEW` is only for genuinely unusable, contradictory, or unidentifiable input. Missing optional fields do not make a clear camera product REVIEW.

## Structural Rules Only

Local code may normalize representation:

- missing optional field → `null`
- missing `specs` → `[]`
- one string where an array is required → one-item array
- evidence `null` → `[]`
- one evidence object → one-item array

Local code must not:

- infer stock;
- infer prices;
- infer selected variants;
- move text between semantic fields;
- parse retailer wording;
- hardcode products, prices, or retailers.

## Evidence

Evidence is traceability only. It does not decide semantics.

Evidence may contain short `{shotId, rawText}` entries. `rawText` stays short to reduce copyright/recitation risk. Missing evidence must not force a visible semantic value to be omitted.

## Module Boundary

Create:

`src/v03/ai/simpleSemantic13Prompt.ts`

This small module owns the complete prompt.

`gemini36VisualExtractor.ts` only:

- builds provider request;
- attaches screenshots;
- calls Gemini;
- decodes JSON;
- structurally normalizes;
- validates;
- overwrites authoritative website/url;
- returns the decision.

The old embedded semantic prompt is removed from the extractor.

## Non-Goals

No:

- retailer-specific parsers;
- retailer-specific prompt rules;
- DOM semantic extraction;
- OCR preprocessing;
- second Gemini semantic call;
- semantic repair pass;
- benchmark weakening;
- hardcoded `Body Only`, stock phrases, prices, or retailer names.

## Acceptance

Before Sentinel10, run Smoke4:

- S01
- S07
- S08
- S10

Smoke4 must produce 4 validated camera rows and comparator mismatches = 0.

Then Sentinel10 must produce:

- total = 10
- validated = 8
- skippedNonCamera = 2
- review = 0
- errors = 0
- comparator mismatches = 0

Then full tests, TypeScript, build, diff check, secret scan, clean status, push, and local/remote SHA parity.
