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

          <div class="price">
            288.000&#273;/ng&#224;y
          </div>

          <button>
            THU&#202; NGAY
          </button>

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

        expect(
          analysis.offer.rental
        ).toBe(true);

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


describe(
  "Phase 8 resolver contract",
  () => {

    test(
      "rental-only product cannot leak a sale listing price",
      () => {

        const html = `
          <html>
            <body>
              <h1>
                Sony A6400
              </h1>

              <div class="price">
                360.000&#273;/ng&#224;y
              </div>

              <button>
                THU&#202; NGAY
              </button>

              <h2>
                TH&#212;NG S&#7888; K&#7928; THU&#7852;T
              </h2>

              <div>
                Mirrorless.
                Cam bien APS-C 24.2MP.
                ISO 100-32000.
                AF 425 diem.
                EVF.
                Video 4K.
              </div>
            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/rental/a6400"
          );

        const analysis =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        expect(
          analysis.offer.rental
        ).toBe(true);

        expect(
          analysis.offer.sale
        ).toBe(false);

        const fields =
          resolveProductFields(
            {
              ...facts,

              /*
               * Simulate stale / unrelated listing context.
               * Resolver must not promote it into SALE truth.
               */
              listingPriceText:
                "18.000.000\u0111"
            },
            analysis
          );

        expect(
          fields.rentalPrice.amount
        ).toBe(360000);

        expect(
          fields.rentalPrice.confidence
        ).toBe(1);

        expect(
          fields.salePrice.amount
        ).toBeNull();

        expect(
          fields.salePrice.contact
        ).toBe(false);

        expect(
          fields.salePrice.evidence
        ).toEqual([]);

        expect(
          fields.salePrice.confidence
        ).toBe(0);
      }
    );


    test(
      "sale-only product cannot leak rental-only fields",
      () => {

        const html = `
          <html>
            <body>
              <h1>
                Canon Camera H&#192;NG C&#360;
              </h1>

              <div class="price">
                18.000.000&#273;
              </div>

              <button>
                MUA NGAY
              </button>

              <h2>
                TH&#212;NG S&#7888; K&#7928; THU&#7852;T
              </h2>

              <div>
                Mirrorless.
                Cam bien APS-C.
                ISO 100-32000.
                AF.
                EVF.
                Video 4K.
              </div>

              <h2>
                &#272;I&#7872;U KI&#7878;N THU&#202;
              </h2>

              <div>
                This section is stray rental content.
              </div>
            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/sale/camera"
          );

        const analysis =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        expect(
          analysis.offer.sale
        ).toBe(true);

        expect(
          analysis.offer.rental
        ).toBe(false);

        const fields =
          resolveProductFields(
            {
              ...facts,

              /*
               * Simulate an unrelated rental-looking raw fact.
               * Phase 8 must still obey Phase 7 transaction truth.
               */
              visiblePriceTexts: [
                ...facts.visiblePriceTexts,
                "288.000\u0111/ng\u00e0y"
              ]
            },
            analysis
          );

        expect(
          fields.salePrice.amount
        ).toBe(18000000);

        expect(
          fields.rentalPrice.amount
        ).toBeNull();

        expect(
          fields.rentalPrice.evidence
        ).toEqual([]);

        expect(
          fields.rentalPrice.confidence
        ).toBe(0);

        expect(
          fields.rentalConditions.value
        ).toBe("");

        expect(
          fields.rentalConditions.evidence
        ).toEqual([]);

        expect(
          fields.rentalConditions.confidence
        ).toBe(0);
      }
    );


    test(
      "price conflict keeps priority value and lowers confidence",
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
                    "19000000.00",

                  "priceCurrency":
                    "VND"
                }
              }
              </script>
            </head>

            <body>
              <h1>
                Canon Camera H&#192;NG C&#360;
              </h1>

              <div class="price">
                18.000.000&#273;
              </div>

              <button>
                MUA NGAY
              </button>

              <h2>
                TH&#212;NG S&#7888; K&#7928; THU&#7852;T
              </h2>

              <div>
                Mirrorless.
                Cam bien APS-C.
                ISO 100-32000.
                AF.
                EVF.
                Video 4K.
              </div>
            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/conflict"
          );

        const analysis =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        expect(
          analysis.offer.sale
        ).toBe(true);

        const fields =
          resolveProductFields(
            facts,
            analysis
          );

        /*
         * Priority remains:
         * visible detail > structured Offer > listing.
         */
        expect(
          fields.salePrice.amount
        ).toBe(18000000);

        expect(
          fields.salePrice.conflict
        ).toBe(true);

        expect(
          fields.salePrice.confidence
        ).toBe(0.5);

        expect(
          fields.salePrice.evidence.some(
            evidence =>
              evidence.source ===
                "VISIBLE"
          )
        ).toBe(true);

        expect(
          fields.salePrice.evidence.some(
            evidence =>
              evidence.source ===
                "JSON_LD"
          )
        ).toBe(true);
      }
    );


    test(
      "spec numbers never populate unrelated fields",
      () => {

        const html = `
          <html>
            <body>
              <h1>
                Camera Body
              </h1>

              <h2>
                TH&#212;NG S&#7888; K&#7928; THU&#7852;T
              </h2>

              <div>
                Mirrorless.
                Cam bien APS-C.
                ISO 100-32000.
                91 diem AF.
                16 fps.
                17 custom modes.
                EVF.
                Video 4K.
              </div>
            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/spec-only"
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
          fields.specs.value
        ).toContain(
          "91"
        );

        expect(
          fields.specs.value
        ).toContain(
          "16 fps"
        );

        expect(
          fields.specs.confidence
        ).toBe(1);

        expect(
          fields.rentalPrice.amount
        ).toBeNull();

        expect(
          fields.salePrice.amount
        ).toBeNull();

        expect(
          fields.rentalConditions.value
        ).toBe("");

        expect(
          fields.combo.value
        ).toBe("");

        expect(
          fields.accessories.value
        ).toBe("");

        expect(
          fields.stock.value
        ).toBe("");

        expect(
          fields.combo.confidence
        ).toBe(0);

        expect(
          fields.stock.confidence
        ).toBe(0);
      }
    );


    test(
      "view count is not review count",
      () => {

        const html = `
          <html>
            <body>
              <h1>
                Sony A6400
              </h1>

              <div class="review-count">
                127 luot xem
              </div>
            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/views"
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
          fields.reviewCount.value
        ).toBeNull();

        expect(
          fields.reviewCount.evidence
        ).toEqual([]);

        expect(
          fields.reviewCount.confidence
        ).toBe(0);
      }
    );

    test(
      "primary sale price outranks gift values discounts and configuration deltas from the same product scope",
      () => {

        const facts = {
          url:
            "https://example.com/products/sony-a6400-sigma-18-50",

          title:
            "Máy ảnh Sony Alpha A6400 (Black) + Lens Sigma 18-50mm f/2.8 | Chính hãng",

          breadcrumbs:
            [],

          listingCategory:
            "",

          jsonLd:
            [],

          visiblePriceTexts: [
            "Quà tặng kèm trị giá: 590.000đ",
            "390.000 ₫",
            "27.480.000đ30.990.000đGiảm: 3.510.000đ",
            "30.990.000đGiảm: 3.510.000đ",
            "Giảm: 3.510.000đ",
            "Body Only-9.817.091đ",
            "+ Lens E 18-135mm F3.5-5.6-1.962.546đ",
            "+ Lens Tamron 17-70mm f/2.8+1.000.000đ",
            "12.753.818 ₫Giảm 2.753.818 ₫",
            "350.000 ₫"
          ],

          buttons: [
            "MUA NGAY",
            "Đặt mua"
          ],

          sections:
            [],

          ratingTexts:
            [],

          stockTexts:
            [],

          listingPriceText:
            "",

          networkFacts:
            [],

          pageText:
            "Máy ảnh Sony Alpha A6400. MUA NGAY."
        };

        const analysis =
          analyzeRawProduct(
            facts,
            "SALE_NEW"
          );

        const fields =
          resolveProductFields(
            facts,
            analysis
          );

        expect(
          fields.salePrice.amount
        ).toBe(
          27_480_000
        );
      }
    );

  }
);