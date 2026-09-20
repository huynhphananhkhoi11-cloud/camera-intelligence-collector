# Camera Intelligence V3 — Dev6 Live Benchmark

Branch: `bench/v3-live-10url`

Baseline used for scaffolding: `integration/v3-live-ai @ 39b941813267ab2b05ebba3168c4aa5b29d298ac`.

> Dev6 owns benchmark/test/report paths only. No production source files are modified here.

## Status

- [x] 10 sentinel URLs frozen in `benchmarks/v3/sentinel_10_urls.txt`
- [x] Ground-truth contract created in `benchmarks/v3/ground_truth.json`
- [x] Three-site crawl smoke scopes created in `benchmarks/v3/crawl_smoke.json`
- [x] Exact 13-column workbook comparator added under `tests/live/v3/`
- [ ] Rebase/merge Dev0 contract freeze from `integration/v3-vision-first`
- [x] Initial web refresh of dynamic sentinel references completed
- [ ] Refresh all dynamic fields in the benchmark browser immediately before each live run
- [ ] Run 10-URL benchmark pass #1
- [ ] Run 3-site crawl smoke (cap 15/site)
- [ ] Run benchmark pass #2 after fixes
- [ ] Attach final field-by-field mismatch evidence

## Exact Camera Data contract

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

Technical metadata belongs in Decision Audit, never as extra Camera Data columns.

## Ground-truth policy

Live commerce fields are refreshed immediately before each benchmark run. Price, stock, rating and review count must never be treated as timeless fixtures.

Stable assertions are used for:

- camera vs non-camera/non-product disposition;
- product identity;
- NEW/USED normalization where explicit;
- selected variation identity;
- contamination guards.

Dynamic assertions are used for:

- selected current sale price;
- rental price/day;
- stock;
- rating/review count;
- currently visible accessories.

A null is correct when a target field is not visible or explicit.

## Sentinel notes

### S01 — zShop R50 body
CAMERA / NEW / Body Only. Current web observation on 2026-09-20 shows 15,990,000 VND and rental 1 day +400,000 VND. “KHÁCH THƯỜNG MUA THÊM” is not a bundle.

### S02 — zShop R50 variation 65130
CAMERA / NEW / Kit 18-45. Preserve the variation query in the final URL. Refresh selected current price in browser before run.

### S03 — zShop R50 Likenew
CAMERA / USED. “Hàng Likenew” normalizes to USED. “Bảo hành 06 tháng” must not become an accessory.

### S04 — zShop R50 variation 70768
CAMERA / NEW / Tamron 17-70. Current web observation on 2026-09-20 shows 32,480,000 VND and rental 1 day +400,000 VND.

### S05 — zShop Sony FE 50mm f/1.8
NON_CAMERA_LENS. Must never create a Camera Data row.

### S06 — zShop workshop article
NON_PRODUCT. Must never create a Camera Data row.

### S07 — VJShop Sony A7 IV body
CAMERA / NEW / Body Only. Refreshed web evidence on 2026-09-20 shows 53,990,182 VND for the primary body-only listing and 7 reviews. Refresh again in the browser immediately before the benchmark run.

### S08 — VJShop Canon R50 body
CAMERA / NEW / Body. Refresh price and availability in the browser before run; exclude related-card commerce data.

### S09 — VJShop Canon R50 + RF 50mm f/1.8
CAMERA. The lens in the product title is part of the camera bundle and must not make the page lens-only. Current web observation on 2026-09-20 shows 20,290,000 VND.

### S10 — Máy Ảnh Top 1 Canon R50 NEW
CAMERA / NEW. Current web observation shows 18,000,000 VND, “Còn hàng”, and explicit accessories: Thân máy, Pin, Sạc, Dây đeo, Hộp, Sách.

## Comparator usage after Dev0 integration

After `smart-batch:v2` exists, run the 10 URLs and produce the workbook, then use the Dev6 comparator tests as the executable contract for:

- exact 13 headers and order;
- negative sentinel leakage;
- product identity;
- condition;
- current sale price;
- rental price/day;
- stock and explicit accessories.

The final report must include, for every mismatch:

`sentinel ID | URL | field | expected | actual | rawText | shotId | screenshot/evidence | disposition`

## Three-site smoke

- zshop.vn — cap 15: camera variants, rental and kit mapping, no duplicate selected variants.
- vjshop.vn — cap 15: current price/review/availability, no related-card contamination.
- mayanhtop1.com — cap 15: NEW/USED/stock/accessories, no related-product contamination.

This smoke is intentionally not a full-domain production crawl.


## Pre-integration contract observation

Dev6 compared the current feature branches before Dev0 wiring:

- Dev2 `feat/v3-gemini36-visual-extractor @ 677e66a` currently defines `website` as a plain string in `VisualExtractionSchema`.
- Dev4 `feat/v3-13col-validator-export` currently expects `website` as `EvidenceValue<string> | null`, including `rawText + shotId`.
- Dev2 currently represents `accessoriesIncluded` and `bundleIncluded` as arrays of evidence objects.
- Dev4 currently represents each of those fields as one evidence object whose `value` is a string array.

These are integration-shape differences, not Dev6 production fixes. Dev0 should adapt/freeze the shared contract before wiring. Dev6 will benchmark the final integrated shape and should not modify either production module.
