import {
  describe,
  expect,
  test
} from "vitest";

import {
  collectProductObservationsFromHtml
} from "../../../src/v03/observations/observationCollector.js";


describe(
  "V3 observation-first product collection",
  () => {

    test(
      "preserves conflicting visible and JSON-LD condition observations without selecting a winner",
      () => {

        const html = `
          <html>
            <head>
              <link
                rel="canonical"
                href="/canon-r50"
              >

              <meta
                property="og:title"
                content="Canon EOS R50 official"
              >

              <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "url": "https://example.com/canon-r50",
                "name": "Canon EOS R50",
                "sku": "SP0003",
                "aggregateRating": {
                  "@type": "AggregateRating",
                  "ratingValue": 4.9,
                  "reviewCount": 384
                },
                "offers": {
                  "@type": "Offer",
                  "price": 18000000,
                  "priceCurrency": "VND",
                  "itemCondition": "https://schema.org/UsedCondition",
                  "availability": "https://schema.org/InStock",
                  "inventoryLevel": {
                    "@type": "QuantitativeValue",
                    "value": 5
                  }
                }
              }
              </script>
            </head>

            <body>
              <main class="product-detail">
                <h1>CANON EOS R50 (NEW 100%)</h1>
                <div class="price">
                  18.000.000đ
                </div>
                <button>
                  Mua ngay
                </button>
              </main>
            </body>
          </html>
        `;


        const result =
          collectProductObservationsFromHtml(
            html,
            "https://example.com/canon-r50?p=2",
            "https://example.com/canon-r50?p=2"
          );


        const conditions =
          result.observations.filter(
            observation =>
              observation.field ===
                "CONDITION"
          );


        expect(
          conditions.map(
            observation => [
              observation.sourceKind,
              observation.rawValue
            ]
          )
        ).toEqual(
          expect.arrayContaining([
            [
              "VISIBLE_TEXT",
              "CANON EOS R50 (NEW 100%)"
            ],
            [
              "JSON_LD",
              "https://schema.org/UsedCondition"
            ]
          ])
        );


        expect(
          result.observations.filter(
            observation =>
              observation.field ===
                "PRICE"
          ).map(
            observation =>
              observation.rawValue
          )
        ).toEqual(
          expect.arrayContaining([
            "18.000.000đ",
            "18000000"
          ])
        );


        expect(
          result.observations.filter(
            observation =>
              observation.field ===
                "RATING"
          ).some(
            observation =>
              observation.rawValue ===
                "4.9"
          )
        ).toBe(true);


        expect(
          result.observations.filter(
            observation =>
              observation.field ===
                "REVIEW_COUNT"
          ).some(
            observation =>
              observation.rawValue ===
                "384"
          )
        ).toBe(true);


        expect(
          result.observations.filter(
            observation =>
              observation.field ===
                "INVENTORY_LEVEL"
          ).some(
            observation =>
              observation.rawValue ===
                "5"
          )
        ).toBe(true);
      }
    );


    test(
      "preserves breadcrumb path separately from nearest ancestor category and keeps action-like text raw",
      () => {

        const html = `
          <html>
            <body>
              <nav class="breadcrumb">
                <a>Trang chủ</a>
                <a>Sản phẩm</a>
                <a>MÁY ẢNH CANON</a>
                <a>Canon EOS R50</a>
              </nav>

              <main>
                <h1>Canon EOS R50</h1>
                <button>Black</button>
                <button>Mua ngay</button>
              </main>
            </body>
          </html>
        `;


        const result =
          collectProductObservationsFromHtml(
            html,
            "https://example.com/canon-r50"
          );


        expect(
          result.observations.filter(
            observation =>
              observation.field ===
                "BREADCRUMB"
          ).map(
            observation =>
              observation.rawValue
          )
        ).toEqual([
          "Trang chủ",
          "Sản phẩm",
          "MÁY ẢNH CANON",
          "Canon EOS R50"
        ]);


        expect(
          result.observations.filter(
            observation =>
              observation.field ===
                "CATEGORY"
          ).map(
            observation =>
              observation.rawValue
          )
        ).toEqual([
          "MÁY ẢNH CANON"
        ]);


        expect(
          result.observations.filter(
            observation =>
              observation.field ===
                "ACTION_TEXT"
          ).map(
            observation =>
              observation.rawValue
          )
        ).toEqual(
          expect.arrayContaining([
            "Black",
            "Mua ngay"
          ])
        );
      }
    );


    test(
      "does not absorb a related-product visible price into the primary product",
      () => {

        const html = `
          <html>
            <body>
              <main class="product-detail">
                <h1>Canon EOS R50</h1>
                <div class="price">
                  18.000.000đ
                </div>
                <button>
                  Mua ngay
                </button>

                <section>
                  <h2>
                    Sản phẩm liên quan
                  </h2>

                  <article class="product-card">
                    <h3>
                      Canon R8
                    </h3>
                    <div class="price">
                      32.000.000đ
                    </div>
                  </article>
                </section>
              </main>
            </body>
          </html>
        `;


        const result =
          collectProductObservationsFromHtml(
            html,
            "https://example.com/canon-r50"
          );


        const prices =
          result.observations.filter(
            observation =>
              observation.field ===
                "PRICE" &&
              observation.sourceKind ===
                "VISIBLE_TEXT"
          );


        expect(
          prices.map(
            observation =>
              observation.rawValue
          )
        ).toContain(
          "18.000.000đ"
        );


        expect(
          prices.map(
            observation =>
              observation.rawValue
          )
        ).not.toContain(
          "32.000.000đ"
        );
      }
    );


    test(
      "ambiguous unmatched structured Product objects do not donate field observations",
      () => {

        const html = `
          <html>
            <head>
              <script type="application/ld+json">
              [
                {
                  "@type": "Product",
                  "url": "https://example.com/related-a",
                  "offers": {
                    "@type": "Offer",
                    "price": 111
                  }
                },
                {
                  "@type": "Product",
                  "url": "https://example.com/related-b",
                  "offers": {
                    "@type": "Offer",
                    "price": 222
                  }
                }
              ]
              </script>
            </head>

            <body>
              <main>
                <h1>
                  Canon EOS R50
                </h1>
                <button>
                  Mua ngay
                </button>
              </main>
            </body>
          </html>
        `;


        const result =
          collectProductObservationsFromHtml(
            html,
            "https://example.com/canon-r50"
          );


        expect(
          result.observations.filter(
            observation =>
              observation.sourceKind ===
                "JSON_LD" &&
              observation.field ===
                "PRICE"
          )
        ).toHaveLength(
          0
        );


        expect(
          result.warnings
        ).toHaveLength(
          1
        );
      }
    );


    test(
      "exact duplicate observations collapse while different provenance remains",
      () => {

        const html = `
          <html>
            <head>
              <meta
                property="og:title"
                content="Canon EOS R50"
              >
            </head>

            <body>
              <main>
                <h1>
                  Canon EOS R50
                </h1>
                <button>
                  Mua ngay
                </button>
              </main>
            </body>
          </html>
        `;


        const result =
          collectProductObservationsFromHtml(
            html,
            "https://example.com/canon-r50"
          );


        const names =
          result.observations.filter(
            observation =>
              observation.field ===
                "PRODUCT_NAME"
          );


        expect(
          names
        ).toHaveLength(
          2
        );


        expect(
          new Set(
            names.map(
              observation =>
                observation.sourceKind
            )
          )
        ).toEqual(
          new Set([
            "VISIBLE_TEXT",
            "META"
          ])
        );
      }
    );
  }
);
