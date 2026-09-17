import {
  describe,
  expect,
  test
} from "vitest";

import {
  extractRawProductFactsFromHtml
} from "../../../src/v02/rawProductExtractor.ts";

import {
  analyzeRawProduct
} from "../../../src/v02/evidenceEngine.ts";

import {
  resolveProductFields
} from "../../../src/v02/resolvers/fieldResolvers.ts";


describe(
  "Field Resolvers V2",
  () => {

    test(
      "651 AF points never becomes rental price",
      () => {

        const html = `
          <html>
            <body>

              <nav class="breadcrumb">
                <a>Home</a>
                <a>THUÊ MÁY ẢNH</a>
                <a>Canon R50</a>
              </nav>

              <h1>Canon R50</h1>

              <div class="price">
                288.000đ/ngày
              </div>

              <button>
                THUÊ NGAY
              </button>

              <h2>
                THÔNG SỐ KỸ THUẬT
              </h2>

              <div>
                Mirrorless.
                Cảm biến APS-C.
                ISO 100-32000.
                651 điểm lấy nét.
                EVF.
                Quay video 4K.
              </div>

            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/equipment/30"
          );

        const analysis =
          analyzeRawProduct(
            facts,
            "RENTAL"
          );

        const fields =
          resolveProductFields(
            facts,
            analysis
          );

        expect(
          fields.rentalPrice.amount
        ).toBe(288000);

        expect(
          fields.rentalPrice.amount
        ).not.toBe(651);
      }
    );


    test(
      "structured 180000.00 remains 180000",
      () => {

        const html = `
          <html>
            <head>

              <script type="application/ld+json">
              {
                "@context":
                  "https://schema.org",
                "@type":
                  "Product",
                "name":
                  "Canon Camera",
                "offers": {
                  "@type":
                    "Offer",
                  "price":
                    "180000.00",
                  "priceCurrency":
                    "VND"
                }
              }
              </script>

            </head>

            <body>

              <nav class="breadcrumb">
                <a>Home</a>
                <a>MÁY ẢNH CŨ</a>
                <a>Canon Camera</a>
              </nav>

              <h1>
                Canon Camera HÀNG CŨ
              </h1>

              <button>
                MUA NGAY
              </button>

              <h2>
                THÔNG SỐ KỸ THUẬT
              </h2>

              <div>
                Mirrorless.
                Cảm biến APS-C.
                ISO 100-32000.
                AF.
                EVF.
                Quay video 4K.
              </div>

            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/product/1"
          );

        const analysis =
          analyzeRawProduct(
            facts,
            "SALE_MIXED"
          );

        const fields =
          resolveProductFields(
            facts,
            analysis
          );

        expect(
          fields.salePrice.amount
        ).toBe(180000);
      }
    );


    test(
      "rental conditions are section scoped",
      () => {

        const html = `
          <h1>Canon R50</h1>

          <h2>
            THÔNG SỐ KỸ THUẬT
          </h2>

          <div>
            651 điểm lấy nét.
            16 fps.
          </div>

          <h2>
            ĐIỀU KIỆN THUÊ
          </h2>

          <div>
            Cọc CCCD.
          </div>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/x"
          );

        const analysis =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        const fields =
          resolveProductFields(
            facts,
            analysis
          );

        expect(
          fields.rentalConditions.value
        ).toContain(
          "Cọc CCCD"
        );

        expect(
          fields.rentalConditions.value
        ).not.toContain(
          "651"
        );

        expect(
          fields.rentalConditions.value
        ).not.toContain(
          "16 fps"
        );
      }
    );


    test(
      "rating and review count resolve correctly",
      () => {

        const html = `
          <h1>Sony A6400</h1>

          <div class="rating">
            4.9/5
          </div>

          <div class="review-count">
            127 đánh giá
          </div>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/x"
          );

        const analysis =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        const fields =
          resolveProductFields(
            facts,
            analysis
          );

        expect(
          fields.rating.value
        ).toBe(4.9);

        expect(
          fields.reviewCount.value
        ).toBe(127);
      }
    );


    test(
      "accessories and combo never contaminate each other",
      () => {

        const html = `
          <h1>Camera</h1>

          <h2>
            PHỤ KIỆN ĐI KÈM
          </h2>

          <div>
            Pin, sạc, dây đeo
          </div>

          <h2>
            COMBO
          </h2>

          <div>
            Body + Lens Kit
          </div>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/x"
          );

        const analysis =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        const fields =
          resolveProductFields(
            facts,
            analysis
          );

        expect(
          fields.accessories.value
        ).toContain(
          "Pin, sạc"
        );

        expect(
          fields.accessories.value
        ).not.toContain(
          "Body + Lens"
        );

        expect(
          fields.combo.value
        ).toContain(
          "Body + Lens Kit"
        );
      }
    );
  }
);
