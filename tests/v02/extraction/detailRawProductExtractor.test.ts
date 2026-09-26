import {
  describe,
  expect,
  test
} from "vitest";

import {
  extractRawProductFactsFromHtml
} from "../../../src/v02/rawProductExtractor.ts";

import {
  extractRawProductFactsFromAcquisition
} from "../../../src/v02/extraction/detailRawProductExtractor.ts";

import type {
  DetailAcquisitionResult
} from "../../../src/v02/extraction/detailAcquisitionTypes.ts";

describe(
  "RawProductFacts V3 detail extraction",
  () => {
    test(
      "keeps JSON-LD while removing script style noscript and svg text from pageText",
      () => {
        const html = `
          <html>
            <head>
              <style>
                .price::after {
                  content: "FAKE_STYLE_PRICE_999999";
                }
              </style>

              <script type="application/ld+json">
                {
                  "@context": "https://schema.org",
                  "@type": "Product",
                  "name": "Canon R50"
                }
              </script>

              <script>
                window.fake =
                  "FAKE_SCRIPT_STOCK_999";
              </script>
            </head>

            <body>
              <noscript>
                FAKE_NOSCRIPT_PRICE_123
              </noscript>

              <svg>
                <text>
                  FAKE_SVG_RATING_5
                </text>
              </svg>

              <h1>
                Canon R50
              </h1>

              <div>
                Giá bán 15.000.000đ
              </div>
            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/canon-r50"
          );

        expect(
          facts.title
        ).toBe(
          "Canon R50"
        );

        expect(
          facts.jsonLd
        ).toHaveLength(1);

        expect(
          facts.pageText
        ).toContain(
          "Canon R50"
        );

        expect(
          facts.pageText
        ).toContain(
          "Giá bán 15.000.000đ"
        );

        expect(
          facts.pageText
        ).not.toContain(
          "FAKE_STYLE_PRICE_999999"
        );

        expect(
          facts.pageText
        ).not.toContain(
          "FAKE_SCRIPT_STOCK_999"
        );

        expect(
          facts.pageText
        ).not.toContain(
          "FAKE_NOSCRIPT_PRICE_123"
        );

        expect(
          facts.pageText
        ).not.toContain(
          "FAKE_SVG_RATING_5"
        );

        expect(
          facts.networkFacts
        ).toEqual([]);
      }
    );

    test(
      "preserves existing sectionizer output",
      () => {
        const html = `
          <html>
            <body>
              <h1>Canon R50</h1>

              <h2>Thông số kỹ thuật</h2>
              <div>
                Cảm biến APS-C 24.2MP
              </div>

              <h2>Phụ kiện đi kèm</h2>
              <div>
                Pin và sạc
              </div>
            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/canon-r50"
          );

        expect(
          facts.sections.some(
            section =>
              section.key ===
              "SPECS"
          )
        ).toBe(true);

        expect(
          facts.sections.some(
            section =>
              section.key ===
              "ACCESSORIES"
          )
        ).toBe(true);
      }
    );

    test(
      "fuses correlated network evidence into the existing RawProductFacts contract",
      () => {
        const acquisition:
          DetailAcquisitionResult = {
            requestedUrl:
              "https://example.com/products/canon-r50?product-id=42&utm_source=test",

            finalUrl:
              "https://example.com/products/canon-r50",

            canonicalUrl:
              "https://example.com/products/canon-r50",

            html: `
              <html>
                <body>
                  <h1>Canon R50</h1>
                  <div>Visible product content</div>
                </body>
              </html>
            `,

            networkSnapshot: {
              requests: [],

              responses: [],

              outcomes: [],

              apiCandidates: [
                {
                  responseUrl:
                    "https://example.com/api/products",

                  method:
                    "GET",

                  status:
                    200,

                  contentType:
                    "application/json",

                  path:
                    "$.data.products",

                  itemCount:
                    2,

                  score:
                    90,

                  commonKeys: [
                    "id",
                    "name",
                    "price",
                    "url"
                  ],

                  signalKeys: [
                    "id",
                    "name",
                    "price",
                    "url"
                  ],

                  sample: [
                    {
                      id: 42,
                      name:
                        "Canon R50",
                      price:
                        15000000,
                      url:
                        "/products/canon-r50"
                    }
                  ],

                  seenCount:
                    1
                }
              ]
            },

            interactions: [],

            timing: {
              navigationMs:
                100,

              settleMs:
                20,

              interactionMs:
                0,

              totalMs:
                120
            },

            errors: []
          };

        const facts =
          extractRawProductFactsFromAcquisition(
            acquisition
          );

        expect(
          facts.url
        ).toBe(
          "https://example.com/products/canon-r50"
        );

        expect(
          facts.title
        ).toBe(
          "Canon R50"
        );

        expect(
          facts.networkFacts
        ).toHaveLength(1);

        expect(
          facts.networkFacts[0]
            ?.source
        ).toBe(
          "NETWORK_API"
        );

        expect(
          facts.networkFacts[0]
            ?.hints
            .productId
        ).toBe(
          "42"
        );

        expect(
          facts.networkFacts[0]
            ?.correlation
            .reasons
        ).toEqual(
          expect.arrayContaining([
            "SAMPLE_URL_MATCH",
            "PRODUCT_ID_MATCH",
            "SLUG_MATCH"
          ])
        );

        /*
         * Raw acquisition keeps price as evidence only.
         * It does not resolve salePrice here.
         */
        expect(
          facts.networkFacts[0]
            ?.sample
        ).toEqual(
          expect.objectContaining({
            price:
              15000000
          })
        );
      }
    );
  }
);