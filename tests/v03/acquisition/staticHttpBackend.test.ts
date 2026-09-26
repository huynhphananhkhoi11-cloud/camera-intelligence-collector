import {
  describe,
  expect,
  test
} from "vitest";

import {
  createAcquisitionContext
} from "../../../src/v03/acquisition/acquisitionContext.js";

import {
  StaticHttpBackend
} from "../../../src/v03/acquisition/staticHttpBackend.js";

import type {
  StaticFetch
} from "../../../src/v03/acquisition/staticHttpBackend.js";


function fakeResponse(
  options:
    {
      readonly status?:
        number;

      readonly url?:
        string;

      readonly contentType?:
        string |
        null;

      readonly body:
        string;

      readonly extraHeaders?:
        Readonly<
          Record<
            string,
            string
          >
        >;
    }
):
  Awaited<
    ReturnType<
      StaticFetch
    >
  > {

  const status =
    options.status ??
    200;


  const headers =
    new Map<
      string,
      string
    >();


  if (
    options.contentType !==
      null
  ) {
    headers.set(
      "content-type",
      options.contentType ??
        "text/html; charset=utf-8"
    );
  }


  for (
    const [
      key,
      value
    ]
    of Object.entries(
      options.extraHeaders ??
        {}
    )
  ) {
    headers.set(
      key.toLowerCase(),
      value
    );
  }


  return {
    status,

    ok:
      status >=
        200 &&
      status <
        300,

    url:
      options.url ??
      "https://example.com/",

    headers: {
      get(
        name:
          string
      ) {
        return (
          headers.get(
            name.toLowerCase()
          ) ??
          null
        );
      }
    },

    async text() {
      return options.body;
    }
  };
}


describe(
  "V3 StaticHttpBackend",
  () => {

    test(
      "collects raw HTML, JSON-LD and structural hints without choosing field truth",
      async () => {

        let calls =
          0;


        const fetchFn:
          StaticFetch =
            async () => {

              calls +=
                1;


              return fakeResponse({
                url:
                  "https://example.com/",

                body: `
                  <!doctype html>
                  <html>
                    <head>
                      <base href="/shop/">
                      <link
                        rel="canonical"
                        href="../camera/canon-r50"
                      >

                      <script
                        src="/assets/app.js"
                      ></script>

                      <script
                        src="https://www.google.com/recaptcha/api.js?render=site-key"
                      ></script>

                      <script type="application/ld+json">
                        {
                          "@type": "Product",
                          "name": "Canon EOS R50"
                        }
                      </script>
                    </head>

                    <body>
                      <a href="canon-r50">
                        Canon EOS R50
                      </a>

                      <a href="/lens">
                        Lens
                      </a>

                      <a href="https://outside.example/item">
                        External
                      </a>
                    </body>
                  </html>
                `
              });
            };


        const backend =
          new StaticHttpBackend({
            fetchFn
          });


        const context =
          createAcquisitionContext(
            "https://example.com/"
          );


        const probe =
          await backend.probe(
            context
          );


        expect(
          probe.status
        ).toBe(
          "AVAILABLE"
        );


        const result =
          await backend.acquire(
            context
          );


        /*
         * probe + acquire reuse the same root response.
         */
        expect(
          calls
        ).toBe(
          1
        );


        expect(
          result.backendId
        ).toBe(
          "STATIC_HTTP"
        );


        expect(
          result.artifacts
        ).toHaveLength(
          2
        );


        expect(
          result.artifacts[0]
        ).toMatchObject({
          kind:
            "HTML",
          url:
            "https://example.com/"
        });


        expect(
          result.artifacts[1]
        ).toMatchObject({
          kind:
            "JSON",
          contentType:
            "application/ld+json"
        });


        expect(
          result.hints
            ?.canonicalUrl
        ).toBe(
          "https://example.com/camera/canon-r50"
        );


        expect(
          result.hints
            ?.baseUrl
        ).toBe(
          "https://example.com/shop/"
        );


        expect(
          result.discoveredUrls
        ).toEqual([
          "https://example.com/shop/canon-r50",
          "https://example.com/lens"
        ]);


        expect(
          result.hints
            ?.scriptUrls
        ).toEqual([
          "https://example.com/assets/app.js",
          "https://www.google.com/recaptcha/api.js?render=site-key"
        ]);


        expect(
          result.hints
            ?.jsonLdCount
        ).toBe(
          1
        );
      }
    );


    test(
      "a normal page that merely loads reCAPTCHA JavaScript is not treated as a blocking challenge",
      async () => {

        const backend =
          new StaticHttpBackend({
            fetchFn:
              async () =>
                fakeResponse({
                  body: `
                    <html>
                      <head>
                        <script src="https://www.google.com/recaptcha/api.js?render=key"></script>
                      </head>
                      <body>
                        <h1>Camera store</h1>
                      </body>
                    </html>
                  `
                })
          });


        const probe =
          await backend.probe(
            createAcquisitionContext(
              "https://example.com/"
            )
          );


        expect(
          probe.status
        ).toBe(
          "AVAILABLE"
        );
      }
    );


    test(
      "confirmed interactive challenge makes static HTTP unavailable",
      async () => {

        const backend =
          new StaticHttpBackend({
            fetchFn:
              async () =>
                fakeResponse({
                  status:
                    403,

                  body:
                    '<html><div class="cf-turnstile"></div></html>'
                })
          });


        const probe =
          await backend.probe(
            createAcquisitionContext(
              "https://example.com/"
            )
          );


        expect(
          probe
        ).toMatchObject({
          backendId:
            "STATIC_HTTP",
          status:
            "UNAVAILABLE",
          reason:
            "Human-verification challenge detected."
        });


        expect(
          probe.metadata
            ?.challenge
        ).toBe(
          "CHALLENGE_CONFIRMED"
        );
      }
    );


    test(
      "429 is reported as rate limiting rather than CAPTCHA",
      async () => {

        const backend =
          new StaticHttpBackend({
            fetchFn:
              async () =>
                fakeResponse({
                  status:
                    429,

                  body:
                    "Too Many Requests"
                })
          });


        const probe =
          await backend.probe(
            createAcquisitionContext(
              "https://example.com/"
            )
          );


        expect(
          probe
        ).toMatchObject({
          status:
            "UNAVAILABLE",
          reason:
            "HTTP rate limit detected."
        });


        expect(
          probe.metadata
            ?.challenge
        ).toBe(
          "RATE_LIMIT"
        );
      }
    );


    test(
      "successful non-HTML response is not claimed as a static website document",
      async () => {

        const backend =
          new StaticHttpBackend({
            fetchFn:
              async () =>
                fakeResponse({
                  contentType:
                    "application/json",

                  body:
                    '{"ok":true}'
                })
          });


        const probe =
          await backend.probe(
            createAcquisitionContext(
              "https://example.com/"
            )
          );


        expect(
          probe
        ).toMatchObject({
          status:
            "UNAVAILABLE",
          reason:
            "Static HTTP response is not HTML."
        });
      }
    );


    test(
      "body-size guard rejects an oversized response before acquisition",
      async () => {

        const backend =
          new StaticHttpBackend({
            maxBodyBytes:
              10,

            fetchFn:
              async () =>
                fakeResponse({
                  body:
                    "<html>too large</html>"
                })
          });


        await expect(
          backend.probe(
            createAcquisitionContext(
              "https://example.com/"
            )
          )
        ).rejects.toThrow(
          "Static HTTP response exceeds maximum body size."
        );
      }
    );
  }
);
