import {
  describe,
  expect,
  test
} from "vitest";

import {
  probeCommercialRootHtml
} from "../../../src/v02/discovery/commercialRootProbe.ts";


describe(
  "Commercial Root Probe",
  () => {

    test(
      "scores a repeated commercial grid highly",
      () => {

        const html = `
          <html>
            <body>

              <div class="product-card">
                <a href="/p/1">
                  <img src="1.jpg">
                  Product A
                </a>

                <div class="price">
                  10.000.000đ
                </div>

                <button>
                  Mua ngay
                </button>
              </div>

              <div class="product-card">
                <a href="/p/2">
                  <img src="2.jpg">
                  Product B
                </a>

                <div class="price">
                  12.000.000đ
                </div>

                <button>
                  Mua ngay
                </button>
              </div>

              <div class="product-card">
                <a href="/p/3">
                  <img src="3.jpg">
                  Product C
                </a>

                <div class="price">
                  14.000.000đ
                </div>
              </div>

              <a rel="next" href="?page=2">
                Next
              </a>

              <script type="application/ld+json">
              {
                "@type": "ItemList",
                "itemListElement": []
              }
              </script>

            </body>
          </html>
        `;


        const result =
          probeCommercialRootHtml(
            html,
            "https://example.com/products"
          );


        expect(
          result.score
        ).toBeGreaterThanOrEqual(
          70
        );


        expect(
          result.repeatedCardCount
        ).toBeGreaterThanOrEqual(
          3
        );


        expect(
          result.jsonLdItemListCount
        ).toBe(
          1
        );
      }
    );


    test(
      "keeps ordinary article page low confidence",
      () => {

        const result =
          probeCommercialRootHtml(
            `
              <article>
                <a href="/blog/a">
                  News article
                </a>
              </article>
            `,
            "https://example.com/blog"
          );


        expect(
          result.score
        ).toBeLessThan(
          30
        );
      }
    );


    test(
      "network product-array activity strengthens root evidence",
      () => {

        const result =
          probeCommercialRootHtml(
            "<html><body></body></html>",
            "https://example.com/store",
            {
              requests: [],
              responses: [],
              outcomes: [],

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
                    20,

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
            }
          );


        expect(
          result.apiCandidateCount
        ).toBe(1);


        expect(
          result.score
        ).toBeGreaterThanOrEqual(
          35
        );
      }
    );

  }
);