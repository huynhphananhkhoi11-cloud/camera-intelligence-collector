import {
  describe,
  expect,
  test
} from "vitest";

import {
  discoverSitemaps,
  parseSitemapXml,
  type SitemapFetch
} from "../../../src/v02/discovery/sitemapDiscovery.ts";


function xmlResponse(
  body: string,
  status = 200
): Response {

  return new Response(
    body,
    {
      status,
      headers: {
        "content-type":
          "application/xml"
      }
    }
  );
}


describe(
  "Sitemap Discovery V2",
  () => {

    test(
      "parses URL set and canonicalizes URLs",
      () => {

        const result =
          parseSitemapXml(
            `
              <?xml version="1.0"?>
              <urlset
                xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
              >
                <url>
                  <loc>
                    https://example.com/product/1/?utm_source=test#details
                  </loc>
                </url>

                <url>
                  <loc>
                    https://example.com/product/1
                  </loc>
                </url>

                <url>
                  <loc>
                    https://example.com/products?page=2&amp;sort=price
                  </loc>
                </url>
              </urlset>
            `,
            "https://example.com/sitemap.xml"
          );


        expect(
          result.kind
        ).toBe(
          "URLSET"
        );

        expect(
          result.pageUrls
        ).toEqual([
          "https://example.com/product/1",
          "https://example.com/products?page=2&sort=price"
        ]);
      }
    );


    test(
      "parses sitemap index including relative children",
      () => {

        const result =
          parseSitemapXml(
            `
              <sitemapindex
                xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
              >
                <sitemap>
                  <loc>
                    /products-sitemap.xml
                  </loc>
                </sitemap>

                <sitemap>
                  <loc>
                    <![CDATA[
                      https://example.com/catalog-sitemap.xml
                    ]]>
                  </loc>
                </sitemap>
              </sitemapindex>
            `,
            "https://example.com/sitemap-index.xml"
          );


        expect(
          result.kind
        ).toBe(
          "INDEX"
        );

        expect(
          result.sitemapUrls
        ).toEqual([
          "https://example.com/products-sitemap.xml",
          "https://example.com/catalog-sitemap.xml"
        ]);
      }
    );


    test(
      "malformed or non-sitemap XML is non-fatal",
      () => {

        expect(
          parseSitemapXml(
            "<html><body>Not XML sitemap</body>",
            "https://example.com/sitemap.xml"
          )
        ).toEqual({
          kind:
            "UNKNOWN",
          sitemapUrls: [],
          pageUrls: []
        });
      }
    );


    test(
      "recursively discovers pages from declared sitemap index",
      async () => {

        const fetchFn:
          SitemapFetch =
          async input => {

            const url =
              String(input);


            if (
              url ===
              "https://example.com/sitemap-index.xml"
            ) {

              return xmlResponse(`
                <sitemapindex>
                  <sitemap>
                    <loc>
                      /products.xml
                    </loc>
                  </sitemap>

                  <sitemap>
                    <loc>
                      /more-products.xml
                    </loc>
                  </sitemap>
                </sitemapindex>
              `);
            }


            if (
              url ===
              "https://example.com/products.xml"
            ) {

              return xmlResponse(`
                <urlset>
                  <url>
                    <loc>
                      https://example.com/product/canon-r50?utm_campaign=x#top
                    </loc>
                  </url>

                  <url>
                    <loc>
                      https://external.example/product/outside
                    </loc>
                  </url>
                </urlset>
              `);
            }


            if (
              url ===
              "https://example.com/more-products.xml"
            ) {

              return xmlResponse(`
                <urlset>
                  <url>
                    <loc>
                      /product/sony-a6400
                    </loc>
                  </url>
                </urlset>
              `);
            }


            return xmlResponse(
              "",
              404
            );
          };


        const result =
          await discoverSitemaps(
            "https://example.com/",
            [
              "https://example.com/sitemap-index.xml"
            ],
            {
              fetchFn
            }
          );


        expect(
          result.usedFallback
        ).toBe(false);


        expect(
          result.sitemapUrls
        ).toEqual([
          "https://example.com/sitemap-index.xml",
          "https://example.com/products.xml",
          "https://example.com/more-products.xml"
        ]);


        expect(
          result.pageUrls
        ).toEqual([
          "https://example.com/product/canon-r50",
          "https://example.com/product/sony-a6400"
        ]);
      }
    );


    test(
      "uses conventional sitemap fallbacks when none are declared",
      async () => {

        const requested:
          string[] = [];


        const fetchFn:
          SitemapFetch =
          async input => {

            const url =
              String(input);

            requested.push(
              url
            );


            if (
              url ===
              "https://example.com/sitemap.xml"
            ) {

              return xmlResponse(`
                <urlset>
                  <url>
                    <loc>
                      /camera/canon-r5
                    </loc>
                  </url>
                </urlset>
              `);
            }


            return xmlResponse(
              "",
              404
            );
          };


        const result =
          await discoverSitemaps(
            "https://example.com",
            [],
            {
              fetchFn
            }
          );


        expect(
          result.usedFallback
        ).toBe(true);


        expect(
          result.pageUrls
        ).toContain(
          "https://example.com/camera/canon-r5"
        );


        expect(
          requested
        ).toContain(
          "https://example.com/sitemap.xml"
        );
      }
    );


    test(
      "falls back when declared sitemap is broken",
      async () => {

        const fetchFn:
          SitemapFetch =
          async input => {

            const url =
              String(input);


            if (
              url ===
              "https://example.com/broken.xml"
            ) {
              return xmlResponse(
                "<html>broken</html>"
              );
            }


            if (
              url ===
              "https://example.com/sitemap.xml"
            ) {

              return xmlResponse(`
                <urlset>
                  <url>
                    <loc>
                      /product/fallback-camera
                    </loc>
                  </url>
                </urlset>
              `);
            }


            return xmlResponse(
              "",
              404
            );
          };


        const result =
          await discoverSitemaps(
            "https://example.com",
            [
              "/broken.xml"
            ],
            {
              fetchFn
            }
          );


        expect(
          result.usedFallback
        ).toBe(true);


        expect(
          result.pageUrls
        ).toContain(
          "https://example.com/product/fallback-camera"
        );
      }
    );

  }
);