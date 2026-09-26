import {
  describe,
  expect,
  test
} from "vitest";

import {
  profileSite
} from "../../../src/v02/profiling/siteProfiler.ts";

import {
  detectPlatform
} from "../../../src/v02/profiling/platformDetector.ts";

import type {
  NetworkObserverSnapshot
} from "../../../src/v02/network/networkObserver.ts";


describe(
  "Platform Detector V2",
  () => {

    test(
      "detects Shopify from HTML and network hints",
      () => {

        const result =
          detectPlatform(
            `
              <html>
                <script>
                  window.Shopify = {};
                </script>

                <div class="shopify-section">
                  Shop
                </div>
              </html>
            `,
            [
              "https://cdn.shopify.com/assets/theme.js"
            ]
          );


        expect(
          result.platform
        ).toBe(
          "SHOPIFY"
        );


        expect(
          result.scores.SHOPIFY
        ).toBeGreaterThan(0);
      }
    );


    test(
      "falls back to CUSTOM without platform evidence",
      () => {

        expect(
          detectPlatform(
            "<html><body>Hello</body></html>"
          ).platform
        ).toBe(
          "CUSTOM"
        );
      }
    );

  }
);


describe(
  "Site Profiler V2",
  () => {

    test(
      "infers rental as weak site prior",
      () => {

        const profile =
          profileSite({
            url:
              "https://example.com/",

            html: `
              <html>
                <head>
                  <title>
                    Camera Rental
                  </title>
                </head>

                <body>

                  <nav>
                    Thuê máy ảnh
                  </nav>

                  <button>
                    THUÊ NGAY
                  </button>

                  <div>
                    400.000đ/ngày
                  </div>

                </body>
              </html>
            `
          });


        expect(
          profile.suggestedSiteMode
        ).toBe(
          "RENTAL"
        );


        expect(
          profile.rentalScore
        ).toBeGreaterThan(
          profile.saleScore
        );
      }
    );


    test(
      "infers mixed when independent rental and sale signals are strong",
      () => {

        const profile =
          profileSite({
            url:
              "https://example.com/",

            html: `
              <html>
                <body>

                  <nav>
                    Cho thuê
                    Sản phẩm
                  </nav>

                  <button>
                    THUÊ NGAY
                  </button>

                  <div>
                    450.000đ/ngày
                  </div>

                  <button>
                    MUA NGAY
                  </button>

                  <script type="application/ld+json">
                  {
                    "@type":
                      "Offer",

                    "businessFunction":
                      "Sell"
                  }
                  </script>

                </body>
              </html>
            `
          });


        expect(
          profile.suggestedSiteMode
        ).toBe(
          "MIXED"
        );


        expect(
          profile.rentalScore
        ).toBeGreaterThanOrEqual(
          25
        );


        expect(
          profile.saleScore
        ).toBeGreaterThanOrEqual(
          25
        );
      }
    );


    test(
      "includes network/API diagnostics without treating API candidate as offer truth",
      () => {

        const network:
          NetworkObserverSnapshot = {

          requests: [
            {
              url:
                "https://cdn.shopify.com/theme.js",

              method:
                "GET",

              resourceType:
                "script",

              frameUrl:
                "https://example.com/",

              timestamp:
                "2026-09-17T12:00:00.000Z"
            }
          ],

          responses: [
            {
              url:
                "https://example.com/api/products",

              method:
                "GET",

              resourceType:
                "xhr",

              status:
                200,

              contentType:
                "application/json",

              declaredContentLength:
                100,

              actualBodyBytes:
                100,

              bodyState:
                "INSPECTED",

              candidateCount:
                1,

              timestamp:
                "2026-09-17T12:00:00.000Z",

              error:
                null
            }
          ],

          outcomes: [
            {
              url:
                "https://example.com/api/products",

              method:
                "GET",

              state:
                "FINISHED",

              failureText:
                null,

              timestamp:
                "2026-09-17T12:00:00.000Z"
            }
          ],

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
                "$.products",

              itemCount:
                10,

              score:
                90,

              commonKeys: [
                "id",
                "name",
                "price"
              ],

              signalKeys: [
                "id",
                "name",
                "price"
              ],

              sample: [],

              seenCount:
                1
            }
          ]
        };


        const profile =
          profileSite({
            url:
              "https://example.com/",

            html:
              "<html><body>Hello</body></html>",

            network
          });


        expect(
          profile.platform
        ).toBe(
          "SHOPIFY"
        );


        expect(
          profile.network
            .apiCandidateCount
        ).toBe(
          1
        );


        expect(
          profile.suggestedSiteMode
        ).toBe(
          "UNKNOWN"
        );
      }
    );

  }
);