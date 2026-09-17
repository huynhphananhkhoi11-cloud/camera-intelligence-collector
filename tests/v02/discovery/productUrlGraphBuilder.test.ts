import {
  describe,
  expect,
  test
} from "vitest";

import {
  ProductUrlGraph
} from "../../../src/v02/discovery/productUrlGraph.ts";

import {
  ingestCatalogSnapshot
} from "../../../src/v02/discovery/productUrlGraphBuilder.ts";


describe(
  "Product URL Graph golden catalog",
  () => {

    test(
      "keeps every catalog card after canonical dedupe regardless of entity",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        const html = `
          <div class="product-card">
            <a href="/equipment/1">
              <img src="1.jpg">
              Canon M
            </a>
            <div>300.000đ</div>
          </div>

          <div class="product-card">
            <a href="/equipment/2">
              <img src="2.jpg">
              Canon 3000D
            </a>
            <div>400.000đ</div>
          </div>

          <div class="product-card">
            <a href="/equipment/3">
              <img src="3.jpg">
              Máy in ảnh
            </a>
            <div>200.000đ</div>
          </div>

          <div class="product-card">
            <a href="/equipment/4">
              <img src="4.jpg">
              Photobooth
            </a>
            <div>500.000đ</div>
          </div>

          <div class="product-card">
            <a href="/equipment/5">
              <img src="5.jpg">
              DJI Osmo Pocket
            </a>
            <div>350.000đ</div>
          </div>

          <div class="product-card">
            <a href="/equipment/1#duplicate">
              Canon M duplicate responsive card
            </a>
          </div>
        `;


        ingestCatalogSnapshot(
          graph,
          {
            pageUrl:
              "https://example.com/categories",

            html,

            sitemapUrls: [
              "https://example.com/equipment/1",
              "https://example.com/equipment/2",
              "https://example.com/equipment/3",
              "https://example.com/equipment/4",
              "https://example.com/equipment/5",
              "https://example.com/equipment/6"
            ]
          },
          "https://example.com/"
        );


        expect(
          graph.size
        ).toBe(6);


        const urls =
          graph.values().map(
            node =>
              node.url
          );


        expect(
          urls
        ).toContain(
          "https://example.com/equipment/3"
        );


        expect(
          urls
        ).toContain(
          "https://example.com/equipment/4"
        );


        expect(
          urls
        ).toContain(
          "https://example.com/equipment/6"
        );
      }
    );


    test(
      "merges API and DOM evidence into the same node",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        const diagnostics =
          ingestCatalogSnapshot(
            graph,
            {
              pageUrl:
                "https://example.com/shop",

              html:
                `
                  <div class="product-card">
                    <a href="/p/11">
                      Product
                    </a>
                  </div>
                `,

              network: {
                apiCandidates: [
                  {
                    responseUrl:
                      "https://example.com/api/products",

                    path:
                      "$.items",

                    sample: [
                      {
                        id:
                          11,

                        url:
                          "/p/11"
                      }
                    ]
                  }
                ]
              }
            },
            "https://example.com/"
          );


        expect(
          graph.size
        ).toBe(1);


        expect(
          diagnostics.apiLinks
        ).toBe(1);


        expect(
          graph.values()[0]
            ?.evidence
            .some(
              evidence =>
                evidence.source ===
                "API_ITEM"
            )
        ).toBe(true);
      }
    );


    test(
      "retains weak root-level sitemap candidates instead of silently dropping them",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        const html = `
          <div class="product-card">
            <a href="/alpha-product">
              <img src="a.jpg">
              Alpha
            </a>
            <span>10.000.000đ</span>
          </div>

          <div class="product-card">
            <a href="/beta-product">
              <img src="b.jpg">
              Beta
            </a>
            <span>11.000.000đ</span>
          </div>
        `;


        const diagnostics =
          ingestCatalogSnapshot(
            graph,
            {
              pageUrl:
                "https://example.com/san-pham",

              html,

              sitemapUrls: [
                "https://example.com/alpha-product",
                "https://example.com/beta-product",
                "https://example.com/gamma-product",
                "https://example.com/tin-tuc"
              ]
            },
            "https://example.com/"
          );


        expect(
          diagnostics
            .sitemapPatternCandidates
        ).toBe(4);


        expect(
          graph.get(
            "https://example.com/gamma-product"
          )
        ).not.toBeNull();


        expect(
          graph.get(
            "https://example.com/gamma-product"
          )?.score
        ).toBe(15);
      }
    );


    test(
      "does not inflate sitemap evidence when the same sitemap is ingested repeatedly",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        const firstHtml = `
          <div class="product-card">
            <a href="/products/alpha">
              <img src="a.jpg">
              Alpha
            </a>
          </div>

          <div class="product-card">
            <a href="/products/beta">
              <img src="b.jpg">
              Beta
            </a>
          </div>
        `;


        const sitemapUrls = [
          "https://example.com/products/alpha",
          "https://example.com/products/beta",
          "https://example.com/products/gamma"
        ];


        ingestCatalogSnapshot(
          graph,
          {
            pageUrl:
              "https://example.com/catalog?page=1",

            html:
              firstHtml,

            sitemapUrls
          },
          "https://example.com/"
        );


        const gammaAfterFirst =
          graph.get(
            "https://example.com/products/gamma"
          );


        expect(
          gammaAfterFirst
        ).not.toBeNull();


        const firstScore =
          gammaAfterFirst?.score;


        const firstEvidenceCount =
          gammaAfterFirst
            ?.evidence
            .filter(
              evidence =>
                evidence.source ===
                "SITEMAP_PATTERN"
            )
            .length;


        expect(
          firstEvidenceCount
        ).toBe(1);


        ingestCatalogSnapshot(
          graph,
          {
            pageUrl:
              "https://example.com/catalog?page=2",

            html:
              firstHtml,

            sitemapUrls
          },
          "https://example.com/"
        );


        const gammaAfterSecond =
          graph.get(
            "https://example.com/products/gamma"
          );


        expect(
          gammaAfterSecond?.score
        ).toBe(
          firstScore
        );


        expect(
          gammaAfterSecond
            ?.evidence
            .filter(
              evidence =>
                evidence.source ===
                "SITEMAP_PATTERN"
            )
            .length
        ).toBe(1);
      }
    );

  }
);