import {
  describe,
  expect,
  test
} from "vitest";

import {
  BulkCollector
} from "../../../src/v03/bulk/bulkCollector.js";

import {
  EndpointReplayEngine
} from "../../../src/v03/acquisition/endpointReplayEngine.js";

import type {
  EndpointReplayTransport
} from "../../../src/v03/acquisition/endpointReplayTransport.js";

import type {
  NetworkReconRuntime
} from "../../../src/v03/acquisition/networkReconTypes.js";

import type {
  StaticFetch
} from "../../../src/v03/acquisition/staticHttpBackend.js";

import {
  collectProductObservationsFromHtml
} from "../../../src/v03/observations/observationCollector.js";

import {
  buildMainPresentationRow
} from "../../../src/v03/export/mainPresentation.js";

import {
  routeEntityFromObservations
} from "../../../src/v03/entities/entityRouting.js";

import type {
  BulkProductRecord
} from "../../../src/v03/bulk/bulkTypes.js";

import type {
  ProductObservation
} from "../../../src/v03/observations/observationTypes.js";


const rootUrl =
  "https://example.com/";


type ObservationExtras =
  Partial<
    Pick<
      ProductObservation,
      | "sourceKind"
      | "locator"
      | "semanticRole"
      | "ownership"
      | "contextKind"
      | "context"
    >
  >;


function observation(
  field:
    ProductObservation["field"],
  rawValue:
    string,
  extras:
    ObservationExtras = {}
): ProductObservation {

  return {
    productIdentity:
      "URL:https://example.com/canon-r50",

    field,

    rawValue,

    sourceKind:
      "VISIBLE_TEXT",

    sourceUrl:
      "https://example.com/canon-r50",

    locator:
      "test",

    ...extras
  };
}


function product(
  observations:
    readonly ProductObservation[]
): BulkProductRecord {

  return {
    identity: {
      identityId:
        "URL:https://example.com/canon-r50",

      memberUrls: [
        "https://example.com/canon-r50"
      ],

      tokens: [
        {
          kind:
            "CANONICAL",

          value:
            "https://example.com/canon-r50",

          token:
            "URL:https://example.com/canon-r50"
        }
      ],

      records:
        []
    },

    observations,

    entity: {
      route:
        "CAMERA",

      subtype:
        "CAMERA",

      classifier: {
        type:
          "CAMERA",

        isCamera:
          true,

        confidence:
          "MEDIUM",

        evidence:
          []
      },

      input: {
        title:
          "Canon EOS R50",

        category:
          "MÁY ẢNH CANON",

        specs:
          "",

        description:
          ""
      }
    }
  };
}


function cameraDetailHtml():
  string {

  return `
    <html>
      <head>
        <link
          rel="canonical"
          href="/canon-r50"
        >

        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Product",
          "url": "https://example.com/canon-r50",
          "name": "Canon EOS R50",
          "sku": "R50-001",
          "offers": {
            "@type": "Offer",
            "price": 18900000,
            "priceCurrency": "VND",
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
        <nav class="breadcrumb">
          <a>Trang chủ</a>
          <a>Sản phẩm</a>
          <a>MÁY ẢNH CANON</a>
          <a>Canon EOS R50</a>
        </nav>

        <main class="product-detail">
          <h1>Canon EOS R50</h1>

          <div class="current-price">
            18.900.000đ
          </div>

          <button>
            Mua ngay
          </button>
        </main>
      </body>
    </html>
  `;
}


describe(
  "Phase 13C BIG RED semantic hardening",
  () => {

    /*
     * =====================================================
     * 1. RESOURCE GATE
     * =====================================================
     */

    test(
      "asset URLs are preserved in discovery accounting but never consume detail-attempt quota",
      async () => {

        const listingBody = [
          '<a href="/canon-r50">Canon R50</a>',
          '<a href="/assets/canon-r50.jpg">Image</a>'
        ].join(
          ""
        );


        const networkRuntime:
          NetworkReconRuntime = {

            async probe() {

              return {
                available:
                  true,

                reason:
                  "ready"
              };
            },


            async observe() {

              return {
                rootUrl,

                finalPageUrl:
                  rootUrl,

                observationWindowMs:
                  1,

                exchanges: [
                  {
                    sequence:
                      1,

                    url:
                      "https://example.com/api/list",

                    method:
                      "POST",

                    resourceType:
                      "xhr",

                    requestContentType:
                      "application/x-www-form-urlencoded",

                    requestBodyRedacted:
                      "category=6",

                    status:
                      200,

                    responseContentType:
                      "text/html",

                    responseBodyPreview:
                      listingBody,

                    responseBodyTruncated:
                      false,

                    failed:
                      false,

                    failureText:
                      null
                  },

                  {
                    sequence:
                      2,

                    url:
                      "https://example.com/api/list",

                    method:
                      "POST",

                    resourceType:
                      "xhr",

                    requestContentType:
                      "application/x-www-form-urlencoded",

                    requestBodyRedacted:
                      "category=7",

                    status:
                      200,

                    responseContentType:
                      "text/html",

                    responseBodyPreview:
                      listingBody,

                    responseBodyTruncated:
                      false,

                    failed:
                      false,

                    failureText:
                      null
                  }
                ]
              };
            }
          };


        const transport:
          EndpointReplayTransport = {

            async execute(
              request
            ) {

              return {
                request,

                finalUrl:
                  request.url,

                status:
                  200,

                contentType:
                  "text/html",

                body:
                  listingBody,

                challengeState:
                  "NONE"
              };
            }
          };


        let assetFetches =
          0;


        const fetchFn:
          StaticFetch =
            async (
              input:
                string
            ) => {

              const url =
                String(
                  input
                );


              const isAsset =
                url.endsWith(
                  ".jpg"
                );


              if (
                isAsset
              ) {
                assetFetches +=
                  1;
              }


              return {
                status:
                  200,

                ok:
                  true,

                url,

                headers: {

                  get(
                    name:
                      string
                  ) {

                    if (
                      name.toLowerCase() ===
                        "content-type"
                    ) {

                      return isAsset
                        ? "image/jpeg"
                        : "text/html";
                    }


                    return null;
                  }
                },

                async text() {

                  return isAsset
                    ? "binary-image-data"
                    : cameraDetailHtml();
                }
              };
            };


        const collector =
          new BulkCollector({

            concurrency:
              1,

            maxProducts:
              20,

            discovery: {

              supplementalEnabled:
                false,

              endpoint: {

                networkRuntime,

                replayEngine:
                  new EndpointReplayEngine({
                    transport
                  })
              }
            },

            observation: {

              staticHttp: {
                fetchFn
              }
            }
          });


        const result =
          await collector.collect(
            rootUrl
          );


        expect(
          result.candidateUrls
        ).toContain(
          "https://example.com/assets/canon-r50.jpg"
        );


        expect(
          result.attemptedUrls
        ).not.toContain(
          "https://example.com/assets/canon-r50.jpg"
        );


        expect(
          assetFetches
        ).toBe(
          0
        );


        expect(
          result.errors
        ).toHaveLength(
          0
        );
      }
    );


    /*
     * =====================================================
     * 2. OBSERVATION SEMANTICS
     * =====================================================
     */

    test(
      "primary product prices receive semantic role ownership and sale context",
      () => {

        const result =
          collectProductObservationsFromHtml(
            cameraDetailHtml(),
            "https://example.com/canon-r50"
          );


        const prices =
          result.observations.filter(
            item =>
              item.field ===
                "PRICE"
          );


        expect(
          prices.length
        ).toBeGreaterThan(
          0
        );


        for (
          const price
          of prices
        ) {

          expect(
            price.semanticRole
          ).toBe(
            "CURRENT_PRODUCT_PRICE"
          );


          expect(
            price.ownership
          ).toBe(
            "PRIMARY_PRODUCT"
          );


          expect(
            price.contextKind
          ).toBe(
            "SALE"
          );
        }
      }
    );


    /*
     * =====================================================
     * 3. PRICE PRESENTATION
     * =====================================================
     */

    test(
      "sale price excludes old gift and installment amounts",
      () => {

        const row =
          buildMainPresentationRow(
            product([
              observation(
                "PRODUCT_NAME",
                "Canon EOS R50"
              ),

              observation(
                "PRICE",
                "18.900.000đ",
                {
                  semanticRole:
                    "CURRENT_PRODUCT_PRICE",

                  ownership:
                    "PRIMARY_PRODUCT",

                  contextKind:
                    "SALE"
                }
              ),

              observation(
                "PRICE",
                "22.000.000đ",
                {
                  semanticRole:
                    "OLD_PRICE",

                  ownership:
                    "PRIMARY_PRODUCT",

                  contextKind:
                    "SALE"
                }
              ),

              observation(
                "PRICE",
                "500.000đ",
                {
                  semanticRole:
                    "GIFT_VALUE",

                  ownership:
                    "RELATED",

                  contextKind:
                    "GIFT"
                }
              ),

              observation(
                "PRICE",
                "1.575.000đ/tháng",
                {
                  semanticRole:
                    "INSTALLMENT_AMOUNT",

                  ownership:
                    "PRIMARY_PRODUCT",

                  contextKind:
                    "INSTALLMENT"
                }
              ),

              observation(
                "PRICE_CURRENCY",
                "VND"
              )
            ]),
            rootUrl
          );


        expect(
          row.salePrice
        ).toBe(
          "18.900.000 VND"
        );
      }
    );


    test(
      "variant prices form the sale range while old price is excluded",
      () => {

        const row =
          buildMainPresentationRow(
            product([
              observation(
                "PRODUCT_NAME",
                "Canon EOS R50"
              ),

              observation(
                "PRICE",
                "16.890.000đ",
                {
                  semanticRole:
                    "VARIANT_PRICE",

                  ownership:
                    "PRIMARY_PRODUCT",

                  contextKind:
                    "SALE"
                }
              ),

              observation(
                "PRICE",
                "23.390.000đ",
                {
                  semanticRole:
                    "VARIANT_PRICE",

                  ownership:
                    "PRIMARY_PRODUCT",

                  contextKind:
                    "SALE"
                }
              ),

              observation(
                "PRICE",
                "25.000.000đ",
                {
                  semanticRole:
                    "OLD_PRICE",

                  ownership:
                    "PRIMARY_PRODUCT",

                  contextKind:
                    "SALE"
                }
              ),

              observation(
                "PRICE_CURRENCY",
                "VND"
              )
            ]),
            rootUrl
          );


        expect(
          row.salePrice
        ).toBe(
          "16.890.000 VND - 23.390.000 VND"
        );
      }
    );


    /*
     * =====================================================
     * 4. STOCK OWNERSHIP
     * =====================================================
     */

    test(
      "related-product stock cannot contaminate primary-product stock",
      () => {

        const row =
          buildMainPresentationRow(
            product([
              observation(
                "PRODUCT_NAME",
                "Canon EOS R50"
              ),

              observation(
                "AVAILABILITY",
                "Còn lại 5 sản phẩm",
                {
                  ownership:
                    "PRIMARY_PRODUCT",

                  contextKind:
                    "AVAILABILITY"
                }
              ),

              observation(
                "AVAILABILITY",
                "Còn lại 2 sản phẩm",
                {
                  ownership:
                    "RELATED",

                  contextKind:
                    "AVAILABILITY"
                }
              )
            ]),
            rootUrl
          );


        expect(
          row.stock
        ).toBe(
          "5"
        );
      }
    );


    /*
     * =====================================================
     * 5. CONDITION / VARIANTS
     * =====================================================
     */

    test(
      "condition variants from visible controls are preserved as condition observations",
      () => {

        const html = `
          <html>
            <body>
              <main class="product-detail">
                <h1>
                  Sony A7 III
                </h1>

                <div class="price">
                  25.000.000đ
                </div>

                <label>
                  Tình trạng
                </label>

                <select
                  name="condition"
                >
                  <option>
                    Hàng Mới Chính Hãng
                  </option>

                  <option>
                    Hàng Cũ Likenew
                  </option>
                </select>

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
            "https://example.com/sony-a7iii"
          );


        const conditions =
          result.observations
            .filter(
              item =>
                item.field ===
                  "CONDITION"
            )
            .map(
              item =>
                item.rawValue
            );


        expect(
          conditions
        ).toEqual(
          expect.arrayContaining([
            "Hàng Mới Chính Hãng",
            "Hàng Cũ Likenew"
          ])
        );
      }
    );


    /*
     * =====================================================
     * 6. ENTITY SENTINELS
     * =====================================================
     */

    test.each([
      [
        "Fujifilm X-T5",
        "MÁY ẢNH FUJIFILM",
        "CAMERA"
      ],

      [
        "Nikon D850",
        "MÁY ẢNH NIKON",
        "CAMERA"
      ],

      [
        "Leica Q3",
        "MÁY ẢNH LEICA",
        "CAMERA"
      ],

      [
        "Sony FE 24-70mm F2.8 GM II",
        "ỐNG KÍNH SONY",
        "NON_CAMERA"
      ],

      [
        "Ezviz C6N Camera WiFi",
        "CAMERA GIÁM SÁT",
        "NON_CAMERA"
      ]
    ])(
      "routes sentinel entity %s as %s",
      (
        title,
        category,
        expectedRoute
      ) => {

        const result =
          routeEntityFromObservations([
            observation(
              "PRODUCT_NAME",
              title
            ),

            observation(
              "CATEGORY",
              category
            )
          ]);


        expect(
          result.route
        ).toBe(
          expectedRoute
        );
      }
    );


    /*
     * =====================================================
     * 7. STRUCTURED VISIBLE SPECS
     * =====================================================
     */

    test(
      "visible table and definition-list specs become structured spec observations",
      () => {

        const html = `
          <html>
            <body>
              <main class="product-detail">
                <h1>
                  Fujifilm X-T5
                </h1>

                <div class="price">
                  39.900.000đ
                </div>

                <button>
                  Mua ngay
                </button>

                <section>
                  <h2>
                    Thông số kỹ thuật
                  </h2>

                  <table>
                    <tr>
                      <th>
                        Cảm biến
                      </th>

                      <td>
                        40.2 MP APS-C
                      </td>
                    </tr>

                    <tr>
                      <th>
                        ISO
                      </th>

                      <td>
                        125-12800
                      </td>
                    </tr>
                  </table>

                  <dl>
                    <dt>
                      Video
                    </dt>

                    <dd>
                      6.2K
                    </dd>
                  </dl>
                </section>
              </main>
            </body>
          </html>
        `;


        const result =
          collectProductObservationsFromHtml(
            html,
            "https://example.com/fujifilm-x-t5"
          );


        const specs =
          result.observations
            .filter(
              item =>
                item.field ===
                  "SPECS"
            )
            .map(
              item =>
                item.rawValue
            );


        expect(
          specs
        ).toEqual(
          expect.arrayContaining([
            "Cảm biến: 40.2 MP APS-C",
            "ISO: 125-12800",
            "Video: 6.2K"
          ])
        );
      }
    );


    /*
     * =====================================================
     * 8. VISIBLE RATING + REVIEW COUNT
     * =====================================================
     */

    test(
      "explicit visible rating and review count become typed observations",
      () => {

        const html = `
          <html>
            <body>
              <main class="product-detail">
                <h1>
                  Canon EOS R50
                </h1>

                <div class="price">
                  18.900.000đ
                </div>

                <div class="rating">
                  4.8/5
                </div>

                <span class="review-count">
                  125 đánh giá
                </span>

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


        const ratings =
          result.observations
            .filter(
              item =>
                item.field ===
                  "RATING"
            )
            .map(
              item =>
                item.rawValue
            );


        const reviewCounts =
          result.observations
            .filter(
              item =>
                item.field ===
                  "REVIEW_COUNT"
            )
            .map(
              item =>
                item.rawValue
            );


        expect(
          ratings
        ).toContain(
          "4.8"
        );


        expect(
          reviewCounts
        ).toContain(
          "125"
        );
      }
    );

    /*
     * =====================================================
     * 9. BLUEPRINT SENTINELS
     * =====================================================
     */

    test(
      "visible NEW title outranks contradictory JSON-LD UsedCondition in presentation",
      () => {

        const row =
          buildMainPresentationRow(
            product([
              observation(
                "PRODUCT_NAME",
                "Canon EOS R50 (NEW 100%)"
              ),
              observation(
                "CONDITION",
                "Canon EOS R50 (NEW 100%)",
                {
                  ownership:
                    "PRIMARY_PRODUCT"
                }
              ),
              {
                ...observation(
                  "CONDITION",
                  "https://schema.org/UsedCondition",
                  {
                    ownership:
                      "PRIMARY_PRODUCT"
                  }
                ),
                sourceKind:
                  "JSON_LD" as const,
                locator:
                  "Product.offers[0].itemCondition"
              }
            ]),
            rootUrl
          );


        expect(
          row.form
        ).toBe(
          "Hàng mới"
        );
      }
    );


    test(
      "selected condition control outranks other available condition options",
      () => {

        const row =
          buildMainPresentationRow(
            product([
              {
                ...observation(
                  "CONDITION",
                  "Hàng Mới Chính Hãng",
                  {
                    ownership:
                      "PRIMARY_PRODUCT"
                  }
                ),
                locator:
                  "condition-select[0].option[0]",
                context:
                  "selected=true"
              },
              {
                ...observation(
                  "CONDITION",
                  "Hàng Cũ Likenew",
                  {
                    ownership:
                      "PRIMARY_PRODUCT"
                  }
                ),
                locator:
                  "condition-select[0].option[1]",
                context:
                  "selected=false"
              }
            ]),
            rootUrl
          );


        expect(
          row.form
        ).toBe(
          "Hàng mới"
        );
      }
    );


    test(
      "variant deltas never expand current sale price",
      () => {

        const row =
          buildMainPresentationRow(
            product([
              observation(
                "PRODUCT_NAME",
                "Nikon Zf Body Only Black"
              ),
              observation(
                "PRICE",
                "40.990.000đ",
                {
                  semanticRole:
                    "CURRENT_PRODUCT_PRICE",
                  ownership:
                    "PRIMARY_PRODUCT",
                  contextKind:
                    "SALE"
                }
              ),
              observation(
                "PRICE",
                "+1.500.000đ",
                {
                  semanticRole:
                    "VARIANT_DELTA",
                  ownership:
                    "PRIMARY_PRODUCT",
                  contextKind:
                    "SALE"
                }
              ),
              observation(
                "PRICE",
                "+6.000.000đ",
                {
                  semanticRole:
                    "VARIANT_DELTA",
                  ownership:
                    "PRIMARY_PRODUCT",
                  contextKind:
                    "SALE"
                }
              ),
              observation(
                "PRICE_CURRENCY",
                "VND"
              )
            ]),
            rootUrl
          );


        expect(
          row.salePrice
        ).toBe(
          "40.990.000 VND"
        );
      }
    );


    test(
      "AggregateOffer low and high prices are preserved as full variant prices",
      () => {

        const html = `
          <html>
            <head>
              <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "url": "https://example.com/canon-r50",
                "name": "Canon EOS R50",
                "offers": {
                  "@type": "AggregateOffer",
                  "lowPrice": 16890000,
                  "highPrice": 23390000,
                  "priceCurrency": "VND"
                }
              }
              </script>
            </head>
            <body>
              <main>
                <h1>Canon EOS R50</h1>
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


        const variantPrices =
          result.observations
            .filter(
              item =>
                item.field ===
                  "PRICE" &&
                item.semanticRole ===
                  "VARIANT_PRICE"
            )
            .map(
              item =>
                item.rawValue
            );


        expect(
          variantPrices
        ).toEqual(
          expect.arrayContaining([
            "16890000",
            "23390000"
          ])
        );
      }
    );


    test(
      "related recommendation rating and stock do not become primary typed evidence",
      () => {

        const html = `
          <html>
            <body>
              <main class="product-detail">
                <h1>Canon EOS R50</h1>
                <div class="current-price">18.900.000đ</div>
                <div class="rating">4.8/5</div>
                <div class="stock">Còn lại 5 sản phẩm</div>
                <button>Mua ngay</button>

                <section class="related-products">
                  <article class="product-card">
                    <h2>Related Lens</h2>
                    <div class="rating">2.0/5</div>
                    <div class="stock">Còn lại 99 sản phẩm</div>
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


        const primaryRatings =
          result.observations
            .filter(
              item =>
                item.field ===
                  "RATING" &&
                item.ownership ===
                  "PRIMARY_PRODUCT"
            )
            .map(
              item =>
                item.rawValue
            );


        const primaryAvailability =
          result.observations
            .filter(
              item =>
                item.field ===
                  "AVAILABILITY" &&
                item.ownership ===
                  "PRIMARY_PRODUCT"
            )
            .map(
              item =>
                item.rawValue
            );


        expect(
          primaryRatings
        ).toContain(
          "4.8"
        );


        expect(
          primaryRatings
        ).not.toContain(
          "2.0"
        );


        expect(
          primaryAvailability.join(
            " | "
          )
        ).not.toContain(
          "99"
        );
      }
    );

  }
);
