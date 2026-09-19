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


const rootUrl =
  "https://example.com/";


function listingBody():
  string {

  return [
    '<a href="/canon-r50">R50</a>',
    '<a href="/canon-r50?p=2">R50 page variant</a>',
    '<a href="/canon-ef-50mm">Lens</a>',
    '<a href="/other-a">A</a>',
    '<a href="/other-b">B</a>'
  ].join(
    ""
  );
}


function cameraHtml(
  requestedUrl:
    string
): string {

  return `
    <html>
      <head>
        <link
          rel="canonical"
          href="/canon-r50"
        >

        <script type="application/ld+json">
        {
          "@type": "Product",
          "url": "https://example.com/canon-r50",
          "name": "Canon EOS R50",
          "sku": "SP0003",
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
          <a>Sản phẩm</a>
          <a>MÁY ẢNH CANON</a>
          <a>Canon EOS R50</a>
        </nav>

        <main>
          <h1>Canon EOS R50</h1>
          <div class="price">18.000.000đ</div>
          <button>Mua ngay</button>
          <div data-requested="${requestedUrl}"></div>
        </main>
      </body>
    </html>
  `;
}


function lensHtml():
  string {

  return `
    <html>
      <body>
        <nav class="breadcrumb">
          <a>Trang chủ</a>
          <a>Sản phẩm</a>
          <a>ỐNG KÍNH CANON</a>
          <a>Canon EF 50mm f/1.8</a>
        </nav>

        <main>
          <h1>Canon EF 50mm f/1.8</h1>
          <div class="price">3.000.000đ</div>
          <button>Mua ngay</button>
        </main>
      </body>
    </html>
  `;
}


function unknownHtml(
  title:
    string
): string {

  return `
    <html>
      <body>
        <main>
          <h1>${title}</h1>
          <button>Mua ngay</button>
        </main>
      </body>
    </html>
  `;
}


describe(
  "V3 bulk collector",
  () => {

    test(
      "discovers, collects, identity-dedupes and routes cameras separately from non-cameras",
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
                      listingBody(),
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
                      listingBody(),
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
                  listingBody(),
                challengeState:
                  "NONE"
              };
            }
          };


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


              let html:
                string;


              if (
                url.includes(
                  "canon-r50"
                )
              ) {
                html =
                  cameraHtml(
                    url
                  );
              }
              else if (
                url.includes(
                  "canon-ef-50mm"
                )
              ) {
                html =
                  lensHtml();
              }
              else {
                html =
                  unknownHtml(
                    url.includes(
                      "other-a"
                    )
                      ? "Other A"
                      : "Other B"
                  );
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
                    return name.toLowerCase() ===
                      "content-type"
                      ? "text/html"
                      : null;
                  }
                },
                async text() {
                  return html;
                }
              };
            };


        const collector =
          new BulkCollector({
            concurrency:
              2,

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
        ).toHaveLength(
          5
        );


        expect(
          result.products
        ).toHaveLength(
          2
        );


        expect(
          result.cameras
        ).toHaveLength(
          1
        );


        expect(
          result.cameras[0]
            ?.identity.memberUrls
        ).toEqual([
          "https://example.com/canon-r50",
          "https://example.com/canon-r50?p=2"
        ]);


        expect(
          result.nonCameras
        ).toHaveLength(
          1
        );

        expect(
          result.nonCameras[0]
            ?.entity.subtype
        ).toBe(
          "LENS"
        );


        expect(
          result.uncertain
        ).toHaveLength(
          0
        );


        expect(
          result.skippedPages
        ).toHaveLength(
          2
        );


        expect(
          result.errors
        ).toHaveLength(
          0
        );
      }
    );
  }
);
