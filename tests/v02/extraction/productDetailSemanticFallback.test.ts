import {
  readFile
} from "node:fs/promises";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  extractRawProductFactsFromHtml
} from "../../../src/v02/rawProductExtractor.ts";

import {
  classifySectionHeading
} from "../../../src/v02/sectionizer.ts";

import {
  analyzeRawProduct
} from "../../../src/v02/evidenceEngine.ts";

import {
  processProductHtml
} from "../../../src/v02/pipeline/productPipeline.ts";

describe(
  "product detail semantic fallback regression",
  () => {
    test(
      "keeps primary product price and CTA scoped away from related products",
      async () => {
        expect(
          classifySectionHeading(
            "TH\u00d4NG S\u1ed0 N\u1ed4I B\u1eacT"
          )
        ).toBe(
          "SPECS"
        );

        const html =
          await readFile(
            new URL(
              "../../fixtures/v02/detail/phase7-rental-semantic-scope.html",
              import.meta.url
            ),
            "utf8"
          );

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/equipment/21"
          );

        const specs =
          facts.sections.find(
            section =>
              section.key ===
              "SPECS"
          );

        expect(
          specs
        ).toBeDefined();

        expect(
          specs?.content
        ).toContain(
          "APS-C CMOS 24.2MP"
        );

        const primaryRentalPrice =
          facts.visiblePriceTexts.find(
            value =>
              value.includes(
                "360,000"
              )
          );

        expect(
          primaryRentalPrice
        ).toBeDefined();

        expect(
          primaryRentalPrice
        ).toMatch(
          /\/\s*ng\u00e0y/i
        );

        expect(
          facts.visiblePriceTexts.some(
            value =>
              value.includes(
                "180,000"
              )
          )
        ).toBe(false);

        expect(
          facts.buttons.some(
            value =>
              /THU\u00ca NGAY/i
                .test(
                  value
                )
          )
        ).toBe(true);

        expect(
          facts.buttons
        ).not.toContain(
          "RELATED RENT ACTION"
        );

        expect(
          facts.buttons
        ).not.toContain(
          "GLOBAL BOOKING"
        );

        const analysis =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        expect(
          analysis.entity.type
        ).toBe(
          "CAMERA"
        );

        expect(
          analysis.entity.isCamera
        ).toBe(true);

        expect(
          analysis.offer.rental
        ).toBe(true);

        expect(
          analysis.offer.sale
        ).toBe(false);

        expect(
          analysis.offer.evidence
            .some(
              evidence =>
                evidence.source ===
                  "CTA" ||
                evidence.source ===
                  "PRICE"
            )
        ).toBe(true);

        expect(
          analysis.condition.condition
        ).toBe(
          "UNKNOWN"
        );

        expect(
          analysis.condition.evidence
        ).toEqual([]);

        expect(
          analysis.decision
        ).toBe(
          "ACCEPT"
        );
      }
    );

    test(
      "uses bounded generic description evidence for a rental camera page built on ecommerce controls",
      () => {

        const html = `
          <html>
            <body>
              <main>
                <section class="product-detail">
                  <h1>Body Sony A6400</h1>

                  <div class="current-price">
                    290,000₫
                  </div>

                  <button>
                    Thêm vào giỏ
                  </button>

                  <h2>Mô tả</h2>

                  <div>
                    <p>GIÁ THUÊ: 290.000đ / 1 Ngày</p>
                    <p>GIÁ NIÊM YẾT NÀY LÀ GIÁ CHO THUÊ THEO NGÀY</p>
                    <p>Set thiết bị cho thuê bao gồm: 1 Body Camera, 2 Pin, 1 Sạc Pin.</p>
                    <p>Cảm biến CMOS APS-C 24.2MP.</p>
                    <p>EVF OLED 2.36m-Dot.</p>
                    <p>Hệ thống AF 425 điểm.</p>
                    <p>Chụp liên tiếp 11 fps.</p>
                    <p>ISO 100-102400.</p>
                  </div>

                  <h2>Sản phẩm liên quan</h2>

                  <div class="related-products">
                    <span class="price">49,000₫</span>
                    <a href="/products/unrelated">Phụ kiện khác</a>
                  </div>
                </section>
              </main>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/products/body-sony-a6400",
            "RENTAL"
          );

        expect(
          result.analysis.entity.type
        ).toBe(
          "CAMERA"
        );

        expect(
          result.analysis.offer.rental
        ).toBe(true);

        expect(
          result.analysis.offer.sale
        ).toBe(false);

        expect(
          result.row.rentalPrice
        ).toBe(
          290_000
        );

        expect(
          result.row.form
        ).toBe(
          "RENTAL"
        );

        expect(
          result.validation.decision
        ).toBe(
          "ACCEPT"
        );

        expect(
          result.validation.evidenceCoverage
        ).toBe(
          1
        );
      }
    );

  }
);