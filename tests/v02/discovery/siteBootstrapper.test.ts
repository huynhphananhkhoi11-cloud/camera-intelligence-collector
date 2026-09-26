import {
  describe,
  expect,
  test
} from "vitest";

import {
  bootstrapSite
} from "../../../src/v02/discovery/siteBootstrapper.ts";

import type {
  SiteFetch
} from "../../../src/v02/discovery/redirectResolver.ts";


function redirectResponse(
  status: number,
  location: string
): Response {

  return new Response(
    null,
    {
      status,

      headers: {
        location
      }
    }
  );
}


function textResponse(
  body: string,
  status = 200,
  contentType =
    "text/plain"
): Response {

  return new Response(
    body,
    {
      status,

      headers: {
        "content-type":
          contentType
      }
    }
  );
}


describe(
  "Site Bootstrapper V2",
  () => {

    test(
      "orchestrates redirect robots sitemap and seed discovery",
      async () => {

        const fetchFn:
          SiteFetch =
          async (
            input,
            init
          ) => {

            const url =
              String(input);

            const method =
              String(
                init?.method ??
                "GET"
              );


            /*
             * Redirect:
             * example.com
             * ->
             * www.example.com/shop
             */
            if (
              url ===
                "https://example.com/" &&
              method ===
                "HEAD"
            ) {

              return redirectResponse(
                301,
                "https://www.example.com/shop/"
              );
            }


            if (
              url ===
                "https://www.example.com/shop" &&
              method ===
                "HEAD"
            ) {

              return textResponse(
                "",
                200
              );
            }


            /*
             * robots.txt
             */
            if (
              url ===
                "https://www.example.com/robots.txt"
            ) {

              return textResponse(
                `
                  User-agent: *
                  Disallow: /private/

                  Sitemap: /sitemap-index.xml
                `
              );
            }


            /*
             * Sitemap index.
             */
            if (
              url ===
                "https://www.example.com/sitemap-index.xml"
            ) {

              return textResponse(
                `
                  <sitemapindex>
                    <sitemap>
                      <loc>
                        /products.xml
                      </loc>
                    </sitemap>
                  </sitemapindex>
                `,
                200,
                "application/xml"
              );
            }


            /*
             * Product sitemap.
             */
            if (
              url ===
                "https://www.example.com/products.xml"
            ) {

              return textResponse(
                `
                  <urlset>

                    <url>
                      <loc>
                        /product/canon-r50
                      </loc>
                    </url>

                    <url>
                      <loc>
                        /private/hidden-camera
                      </loc>
                    </url>

                    <url>
                      <loc>
                        https://outside.example/product/external
                      </loc>
                    </url>

                  </urlset>
                `,
                200,
                "application/xml"
              );
            }


            return textResponse(
              "",
              404
            );
          };


        const result =
          await bootstrapSite(
            "example.com",
            {
              fetchFn
            }
          );


        expect(
          result.normalizedUrl
        ).toBe(
          "https://example.com/"
        );


        expect(
          result.finalUrl
        ).toBe(
          "https://www.example.com/shop"
        );


        expect(
          result.canonicalOrigin
        ).toBe(
          "https://www.example.com/"
        );


        expect(
          result.redirect.redirects
        ).toHaveLength(
          1
        );


        expect(
          result.robots.available
        ).toBe(true);


        expect(
          result.sitemaps.sitemapUrls
        ).toEqual([
          "https://www.example.com/sitemap-index.xml",
          "https://www.example.com/products.xml"
        ]);


        expect(
          result.seeds.map(
            seed =>
              seed.url
          )
        ).toEqual([
          "https://www.example.com/",
          "https://www.example.com/shop",
          "https://www.example.com/product/canon-r50"
        ]);


        expect(
          result.seeds
            .some(
              seed =>
                seed.url.includes(
                  "/private/"
                )
            )
        ).toBe(false);


        expect(
          result.diagnostics
            .excludedByRobots
        ).toBe(1);


        expect(
          result.diagnostics
            .seedCount
        ).toBe(3);
      }
    );


    test(
      "works when robots is missing and sitemap fallback is used",
      async () => {

        const fetchFn:
          SiteFetch =
          async (
            input,
            init
          ) => {

            const url =
              String(input);

            const method =
              String(
                init?.method ??
                "GET"
              );


            if (
              url ===
                "https://example.com/" &&
              method ===
                "HEAD"
            ) {

              return textResponse(
                "",
                200
              );
            }


            if (
              url ===
                "https://example.com/robots.txt"
            ) {

              return textResponse(
                "",
                404
              );
            }


            if (
              url ===
                "https://example.com/sitemap.xml"
            ) {

              return textResponse(
                `
                  <urlset>

                    <url>
                      <loc>
                        /
                      </loc>
                    </url>

                    <url>
                      <loc>
                        /product/sony-a6400
                      </loc>
                    </url>

                  </urlset>
                `,
                200,
                "application/xml"
              );
            }


            return textResponse(
              "",
              404
            );
          };


        const result =
          await bootstrapSite(
            "https://example.com"
          ,
            {
              fetchFn
            }
          );


        expect(
          result.robots.available
        ).toBe(false);


        expect(
          result.sitemaps.usedFallback
        ).toBe(true);


        expect(
          result.seeds
            .map(
              seed =>
                seed.url
            )
        ).toEqual([
          "https://example.com/",
          "https://example.com/product/sony-a6400"
        ]);


        const rootSeed =
          result.seeds.find(
            seed =>
              seed.url ===
              "https://example.com/"
          );


        expect(
          rootSeed?.sources
        ).toEqual([
          "HOMEPAGE",
          "ENTRY",
          "SITEMAP"
        ]);
      }
    );

  }
);