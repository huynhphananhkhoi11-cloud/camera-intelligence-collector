import {
  describe,
  expect,
  test
} from "vitest";

import {
  SitemapDiscovery
} from "../../../src/v03/discovery/sitemapDiscovery.js";


function makeResponse(
  url:
    string,
  status:
    number,
  body:
    string
): Response {

  return new Response(
    body,
    {
      status,
      headers: {
        "content-type":
          url.endsWith(
            ".txt"
          )
            ? "text/plain"
            : "application/xml"
      }
    }
  );
}


describe(
  "V3 sitemap discovery",
  () => {

    test(
      "reads robots sitemap declaration, sitemap indexes and same-origin page URLs",
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
                url.endsWith(
                  "/robots.txt"
                )
              ) {
                const response =
                  makeResponse(
                    url,
                    200,
                    "User-agent: *\nSitemap: https://example.com/catalog-sitemap.xml"
                  );


                Object.defineProperty(
                  response,
                  "url",
                  {
                    value:
                      url
                  }
                );


                return response;
              }


              if (
                url ===
                  "https://example.com/catalog-sitemap.xml"
              ) {
                const response =
                  makeResponse(
                    url,
                    200,
                    `<?xml version="1.0"?>
                    <sitemapindex>
                      <sitemap>
                        <loc>https://example.com/products-sitemap.xml</loc>
                      </sitemap>
                    </sitemapindex>`
                  );


                Object.defineProperty(
                  response,
                  "url",
                  {
                    value:
                      url
                  }
                );


                return response;
              }


              if (
                url ===
                  "https://example.com/products-sitemap.xml"
              ) {
                const response =
                  makeResponse(
                    url,
                    200,
                    `<?xml version="1.0"?>
                    <urlset>
                      <url>
                        <loc>https://example.com/may-anh/canon-r50</loc>
                      </url>
                      <url>
                        <loc>https://outside.example/not-allowed</loc>
                      </url>
                    </urlset>`
                  );


                Object.defineProperty(
                  response,
                  "url",
                  {
                    value:
                      url
                  }
                );


                return response;
              }


              const response =
                makeResponse(
                  url,
                  404,
                  ""
                );


              Object.defineProperty(
                response,
                "url",
                {
                  value:
                    url
                }
              );


              return response;
            };


        const discovery =
          new SitemapDiscovery({
            fetchFn
          });


        const result =
          await discovery.discover(
            "https://example.com/"
          );


        expect(
          result.sitemapDocuments
        ).toEqual(
          expect.arrayContaining([
            "https://example.com/catalog-sitemap.xml",
            "https://example.com/products-sitemap.xml"
          ])
        );


        expect(
          result.evidence.map(
            item =>
              item.url
          )
        ).toContain(
          "https://example.com/may-anh/canon-r50"
        );


        expect(
          result.evidence.map(
            item =>
              item.url
          )
        ).not.toContain(
          "https://outside.example/not-allowed"
        );
      }
    );
  }
);
