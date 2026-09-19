import {
  describe,
  expect,
  test
} from "vitest";

import {
  BulkCollector
} from "../../../src/v03/bulk/bulkCollector.js";

import type {
  NetworkReconRuntime
} from "../../../src/v03/acquisition/networkReconTypes.js";

import type {
  StaticFetch
} from "../../../src/v03/acquisition/staticHttpBackend.js";


function response(
  url:
    string,
  status:
    number,
  body:
    string,
  contentType:
    string
): Response {

  const result =
    new Response(
      body,
      {
        status,
        headers: {
          "content-type":
            contentType
        }
      }
    );


  Object.defineProperty(
    result,
    "url",
    {
      value:
        url
    }
  );


  return result;
}


describe(
  "V3 bulk collection with non-XHR discovery",
  () => {

    test(
      "finds and exports a camera through static category traversal when endpoint replay finds nothing",
      async () => {

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

            async observe(
              rootUrl:
                string
            ) {
              return {
                rootUrl,
                finalPageUrl:
                  rootUrl,
                observationWindowMs:
                  1,
                exchanges:
                  []
              };
            }
          };


        const fetchFn:
          typeof fetch =
            async (
              input
            ) => {

              const url =
                String(
                  input
                );


              if (
                url ===
                  "https://example.com/"
              ) {
                return response(
                  url,
                  200,
                  '<a href="/may-anh">Máy ảnh</a>',
                  "text/html"
                );
              }


              if (
                url ===
                  "https://example.com/may-anh"
              ) {
                return response(
                  url,
                  200,
                  `
                    <html>
                      <body>
                        <h1>Máy ảnh</h1>
                        <a href="/may-anh/canon-eos-r50">Canon EOS R50</a>
                      </body>
                    </html>
                  `,
                  "text/html"
                );
              }


              if (
                url ===
                  "https://example.com/may-anh/canon-eos-r50"
              ) {
                return response(
                  url,
                  200,
                  `
                    <html>
                      <head>
                        <script type="application/ld+json">
                        {
                          "@type": "Product",
                          "url": "https://example.com/may-anh/canon-eos-r50",
                          "name": "Canon EOS R50",
                          "sku": "R50",
                          "offers": {
                            "@type": "Offer",
                            "price": 18000000,
                            "priceCurrency": "VND"
                          }
                        }
                        </script>
                      </head>
                      <body>
                        <nav class="breadcrumb">
                          <a>Trang chủ</a>
                          <a>Máy ảnh</a>
                          <a>Máy ảnh Canon</a>
                          <a>Canon EOS R50</a>
                        </nav>

                        <h1>Canon EOS R50</h1>
                        <div class="price">18.000.000đ</div>
                        <button>Mua ngay</button>
                      </body>
                    </html>
                  `,
                  "text/html"
                );
              }


              if (
                url.endsWith(
                  "/robots.txt"
                ) ||
                url.includes(
                  "sitemap"
                )
              ) {
                return response(
                  url,
                  404,
                  "",
                  "text/plain"
                );
              }


              return response(
                url,
                404,
                "",
                "text/html"
              );
            };


        const collector =
          new BulkCollector({
            concurrency:
              2,

            maxProducts:
              10,

            discovery: {
              endpoint: {
                networkRuntime
              },

              staticTraversal: {
                staticHttp: {
                  fetchFn:
                    fetchFn as
                      StaticFetch
                }
              },

              sitemap: {
                fetchFn
              },

              renderedFallbackThreshold:
                1
            },

            observation: {
              staticHttp: {
                fetchFn:
                  fetchFn as
                    StaticFetch
              }
            }
          });


        const result =
          await collector.collect(
            "https://example.com/"
          );


        expect(
          result.discovery.channelCounts.ENDPOINT_REPLAY
        ).toBe(
          0
        );


        expect(
          result.discovery.channelCounts.STATIC_HTML
        ).toBeGreaterThan(
          0
        );


        expect(
          result.cameras
        ).toHaveLength(
          1
        );


        expect(
          result.cameras[0]
            ?.identity.memberUrls
        ).toContain(
          "https://example.com/may-anh/canon-eos-r50"
        );


        expect(
          result.skippedPages.some(
            page =>
              page.url ===
                "https://example.com/may-anh"
          )
        ).toBe(true);


        expect(
          result.errors
        ).toHaveLength(
          0
        );
      }
    );
  }
);
