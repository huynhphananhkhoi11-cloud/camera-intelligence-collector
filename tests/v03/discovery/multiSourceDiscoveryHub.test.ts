import {
  describe,
  expect,
  test
} from "vitest";

import {
  MultiSourceDiscoveryHub
} from "../../../src/v03/discovery/multiSourceDiscoveryHub.js";

import type {
  NetworkReconRuntime
} from "../../../src/v03/acquisition/networkReconTypes.js";

import type {
  RenderedDomRuntime
} from "../../../src/v03/discovery/renderedDomDiscovery.js";


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


function quietNetwork():
  NetworkReconRuntime {

  return {
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
}


describe(
  "V3 multi-source discovery hub",
  () => {

    test(
      "unions static HTML and sitemap URLs even when endpoint replay discovers nothing",
      async () => {

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
                  '<a href="/may-anh/canon-r50">Canon R50</a>',
                  "text/html"
                );
              }


              if (
                url.endsWith(
                  "/robots.txt"
                )
              ) {
                return response(
                  url,
                  200,
                  "Sitemap: https://example.com/products.xml",
                  "text/plain"
                );
              }


              if (
                url ===
                  "https://example.com/products.xml"
              ) {
                return response(
                  url,
                  200,
                  `<urlset>
                    <url>
                      <loc>https://example.com/may-anh/sony-a7c-ii</loc>
                    </url>
                  </urlset>`,
                  "application/xml"
                );
              }


              return response(
                url,
                404,
                "",
                "text/plain"
              );
            };


        let renderedCalls =
          0;


        const renderedRuntime:
          RenderedDomRuntime = {
            async collectLinks() {
              renderedCalls +=
                1;

              return [];
            }
          };


        const hub =
          new MultiSourceDiscoveryHub({
            endpoint: {
              networkRuntime:
                quietNetwork()
            },

            staticTraversal: {
              staticHttp: {
                fetchFn:
                  fetchFn as
                    import("../../../src/v03/acquisition/staticHttpBackend.js").StaticFetch
              }
            },

            sitemap: {
              fetchFn
            },

            renderedRuntime,

            renderedFallbackThreshold:
              1
          });


        const result =
          await hub.discover(
            "https://example.com/"
          );


        expect(
          result.allDiscoveredUrls
        ).toEqual(
          expect.arrayContaining([
            "https://example.com/may-anh/canon-r50",
            "https://example.com/may-anh/sony-a7c-ii"
          ])
        );


        expect(
          result.channelCounts.STATIC_HTML
        ).toBeGreaterThan(
          0
        );


        expect(
          result.channelCounts.SITEMAP
        ).toBeGreaterThan(
          0
        );


        expect(
          result.channelCounts.ENDPOINT_REPLAY
        ).toBe(
          0
        );


        expect(
          renderedCalls
        ).toBe(
          0
        );
      }
    );


    test(
      "uses the final redirected site origin for supplemental discovery",
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
                  "https://www.example.com/",
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
                  "https://www.example.com/"
              ) {
                return response(
                  url,
                  200,
                  '<a href="/may-anh/canon-r50">Canon R50</a>',
                  "text/html"
                );
              }


              return response(
                url,
                404,
                "",
                "text/plain"
              );
            };


        const hub =
          new MultiSourceDiscoveryHub({
            endpoint: {
              networkRuntime
            },

            staticTraversal: {
              staticHttp: {
                fetchFn:
                  fetchFn as
                    import("../../../src/v03/acquisition/staticHttpBackend.js").StaticFetch
              }
            },

            sitemap: {
              fetchFn
            },

            renderedFallbackThreshold:
              1
          });


        const result =
          await hub.discover(
            "https://example.com/"
          );


        expect(
          result.allDiscoveredUrls
        ).toContain(
          "https://www.example.com/may-anh/canon-r50"
        );
      }
    );


    test(
      "uses rendered DOM as fallback when other channels yield too few URLs",
      async () => {

        const fetchFn:
          typeof fetch =
            async (
              input
            ) =>
              response(
                String(
                  input
                ),
                404,
                "",
                "text/plain"
              );


        const renderedRuntime:
          RenderedDomRuntime = {
            async collectLinks() {
              return [
                {
                  url:
                    "https://example.com/may-anh/canon-r50",
                  text:
                    "Canon EOS R50"
                }
              ];
            }
          };


        const hub =
          new MultiSourceDiscoveryHub({
            endpoint: {
              networkRuntime:
                quietNetwork()
            },

            staticTraversal: {
              staticHttp: {
                fetchFn:
                  fetchFn as
                    import("../../../src/v03/acquisition/staticHttpBackend.js").StaticFetch
              }
            },

            sitemap: {
              fetchFn
            },

            renderedRuntime,

            renderedFallbackThreshold:
              25
          });


        const result =
          await hub.discover(
            "https://example.com/"
          );


        expect(
          result.renderedDom.used
        ).toBe(true);


        expect(
          result.allDiscoveredUrls
        ).toContain(
          "https://example.com/may-anh/canon-r50"
        );


        expect(
          result.channelCounts.RENDERED_DOM
        ).toBe(
          1
        );
      }
    );
  }
);
