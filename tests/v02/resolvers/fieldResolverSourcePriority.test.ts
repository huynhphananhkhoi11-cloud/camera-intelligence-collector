import {
  describe,
  expect,
  test
} from "vitest";

import {
  processProductHtml
} from "../../../src/v02/pipeline/productPipeline.ts";


describe(
  "Phase 8C field source priority",
  () => {

    test(
      "product name prefers H1 over JSON-LD and og:title",
      () => {

        const html = `
          <html>
            <head>
              <meta
                property="og:title"
                content="OG Canon EOS R50"
              >

              <script type="application/ld+json">
              {
                "@context":
                  "https://schema.org",

                "@type":
                  "Product",

                "name":
                  "JSON Canon EOS R50"
              }
              </script>
            </head>

            <body>
              <h1>
                H1 Canon EOS R50
              </h1>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/product/h1-priority",
            "UNKNOWN"
          );

        expect(
          result.row.productName
        ).toBe(
          "H1 Canon EOS R50"
        );
      }
    );


    test(
      "product name falls back to JSON-LD before og:title",
      () => {

        const html = `
          <html>
            <head>
              <meta
                property="og:title"
                content="OG Canon EOS R50"
              >

              <script type="application/ld+json">
              {
                "@context":
                  "https://schema.org",

                "@type":
                  "Product",

                "name":
                  "JSON Canon EOS R50"
              }
              </script>
            </head>

            <body>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/product/json-name",
            "UNKNOWN"
          );

        expect(
          result.row.productName
        ).toBe(
          "JSON Canon EOS R50"
        );
      }
    );


    test(
      "generic HTML title is not product-name truth",
      () => {

        const html = `
          <html>
            <head>
              <title>
                Camera Shop - Home
              </title>
            </head>

            <body>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/product/no-name-evidence",
            "UNKNOWN"
          );

        expect(
          result.row.productName
        ).toBe("");
      }
    );


    test(
      "SPECS section has priority over structured attributes",
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
                  "Canon EOS R50",

                "additionalProperty": [
                  {
                    "@type":
                      "PropertyValue",

                    "name":
                      "Sensor",

                    "value":
                      "Full Frame"
                  }
                ]
              }
              </script>
            </head>

            <body>
              <h1>
                Canon EOS R50
              </h1>

              <h2>
                TH&#212;NG S&#7888; K&#7928; THU&#7852;T
              </h2>

              <div>
                Sensor: APS-C
                Resolution: 24.2 MP
              </div>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/product/spec-section",
            "UNKNOWN"
          );

        expect(
          result.fields.specs.value
        ).toContain(
          "Sensor: APS-C"
        );

        expect(
          result.fields.specs.value
        ).not.toContain(
          "Full Frame"
        );
      }
    );


    test(
      "structured Product attributes fill specs when SPECS section is absent",
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
                  "Canon EOS R50",

                "additionalProperty": [
                  {
                    "@type":
                      "PropertyValue",

                    "name":
                      "Sensor",

                    "value":
                      "APS-C"
                  },

                  {
                    "@type":
                      "PropertyValue",

                    "name":
                      "Resolution",

                    "value":
                      "24.2 MP"
                  }
                ]
              }
              </script>
            </head>

            <body>
              <h1>
                Canon EOS R50
              </h1>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/product/structured-specs",
            "UNKNOWN"
          );

        expect(
          result.fields.specs.value
        ).toContain(
          "Sensor"
        );

        expect(
          result.fields.specs.value
        ).toContain(
          "APS-C"
        );

        expect(
          result.fields.specs.value
        ).toContain(
          "Resolution"
        );

        expect(
          result.fields.specs.value
        ).toContain(
          "24.2 MP"
        );

        expect(
          result.fields.specs.evidence.some(
            evidence =>
              evidence.source ===
                "JSON_LD"
          )
        ).toBe(true);
      }
    );


    test(
      "aggregateRating keeps priority while visible mismatch remains conflict evidence",
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
                  "Sony A6400",

                "aggregateRating": {
                  "@type":
                    "AggregateRating",

                  "ratingValue":
                    "4.8",

                  "reviewCount":
                    "87"
                }
              }
              </script>
            </head>

            <body>
              <h1>
                Sony A6400
              </h1>

              <div class="rating">
                4.5/5
              </div>

              <div class="review-count">
                50 reviews
              </div>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/product/rating-priority",
            "UNKNOWN"
          );

        expect(
          result.fields.rating.value
        ).toBe(4.8);

        expect(
          result.fields.rating.conflict
        ).toBe(true);

        expect(
          result.fields.rating.confidence
        ).toBe(0.5);

        expect(
          result.fields.rating.evidence.some(
            evidence =>
              evidence.source ===
                "JSON_LD"
          )
        ).toBe(true);

        expect(
          result.fields.rating.evidence.some(
            evidence =>
              evidence.source ===
                "VISIBLE"
          )
        ).toBe(true);

        expect(
          result.fields.reviewCount.value
        ).toBe(87);

        expect(
          result.fields.reviewCount.conflict
        ).toBe(true);
      }
    );


    test(
      "Offer availability has priority and contradictory visible stock remains conflict",
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
                  "Canon EOS R50",

                "offers": {
                  "@type":
                    "Offer",

                  "availability":
                    "https://schema.org/InStock"
                }
              }
              </script>
            </head>

            <body>
              <h1>
                Canon EOS R50
              </h1>

              <div class="stock">
                H&#7871;t h&#224;ng
              </div>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/product/stock-conflict",
            "UNKNOWN"
          );

        expect(
          result.fields.stock.value
        ).toBe(
          "IN_STOCK"
        );

        expect(
          result.fields.stock.conflict
        ).toBe(true);

        expect(
          result.fields.stock.confidence
        ).toBe(0.5);

        expect(
          result.fields.stock.evidence.some(
            evidence =>
              evidence.source ===
                "JSON_LD"
          )
        ).toBe(true);

        expect(
          result.fields.stock.evidence.some(
            evidence =>
              evidence.source ===
                "VISIBLE"
          )
        ).toBe(true);
      }
    );


    test(
      "visible preorder maps to PREORDER with raw evidence",
      () => {

        const html = `
          <html>
            <body>
              <h1>
                Canon EOS R50
              </h1>

              <div class="stock">
                Preorder
              </div>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/product/preorder",
            "UNKNOWN"
          );

        expect(
          result.fields.stock.value
        ).toBe(
          "PREORDER"
        );

        expect(
          result.fields.stock.evidence.some(
            evidence =>
              evidence.source ===
                "VISIBLE" &&
              /preorder/i.test(
                evidence.raw
              )
          )
        ).toBe(true);

        expect(
          result.fields.stock.confidence
        ).toBe(1);
      }
    );

    test(
      "gift values and configuration money do not outrank the primary sale price",
      () => {

        const html = `
          <html>
            <body>
              <main>
                <section class="product-detail">
                  <h1>
                    Máy ảnh Sony Alpha A6400 (Black) + Lens Sigma 18-50mm f/2.8
                  </h1>

                  <div class="gift-price">
                    Quà tặng kèm trị giá: 590.000đ
                  </div>

                  <div class="gift-price">
                    390.000 ₫
                  </div>

                  <div class="sale-price">
                    27.480.000đ 30.990.000đ Giảm: 3.510.000đ
                  </div>

                  <div class="discount-price">
                    Giảm: 3.510.000đ
                  </div>

                  <div class="variant-price">
                    + Lens Tamron 17-70mm f/2.8 +1.000.000đ
                  </div>

                  <button>
                    MUA NGAY
                  </button>
                </section>
              </main>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/products/sony-a6400-sigma-18-50",
            "SALE_NEW"
          );

        expect(
          result.row.salePrice
        ).toBe(
          27_480_000
        );

        expect(
          result.fields.salePrice.evidence.some(
            evidence =>
              evidence.raw.includes(
                "27.480.000đ"
              )
          )
        ).toBe(true);
      }
    );

  }
);