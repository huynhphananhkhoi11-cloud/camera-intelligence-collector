import {
  describe,
  expect,
  test
} from "vitest";

import {
  extractApiProductLinks,
  extractListingProductLinks
} from "../../../src/v02/discovery/listingProductDiscovery.ts";


describe(
  "listing product discovery",
  () => {

    test(
      "extracts camera and non-camera product cards without filtering",
      () => {

        const html = `
          <div class="product-card">
            <a href="/canon-m">
              <img src="1.jpg">
              Canon M
            </a>
            <span>300.000đ</span>
          </div>

          <div class="product-card">
            <a href="/may-in-photo">
              <img src="2.jpg">
              Máy in photo
            </a>
            <span>200.000đ</span>
          </div>

          <div class="product-card">
            <a href="/photobooth">
              <img src="3.jpg">
              Photobooth
            </a>
            <span>500.000đ</span>
          </div>
        `;


        const result =
          extractListingProductLinks(
            html,
            "https://example.com/catalog"
          );


        const urls =
          new Set(
            result.productLinks.map(
              item =>
                item.url
            )
          );


        expect(
          urls
        ).toEqual(
          new Set([
            "https://example.com/canon-m",
            "https://example.com/may-in-photo",
            "https://example.com/photobooth"
          ])
        );
      }
    );


    test(
      "does not assign unrelated page price to a booking CTA",
      () => {

        const result =
          extractListingProductLinks(
            `
              <main>
                <div>
                  <a href="/booking">
                    Đặt thuê
                  </a>
                </div>

                <section class="product-card">
                  <a href="/equipment/1">
                    <img src="1.jpg">
                    Product
                  </a>

                  <span>
                    300.000đ
                  </span>
                </section>
              </main>
            `,
            "https://example.com/categories"
          );


        const bookingEvidence =
          result.productLinks.filter(
            item =>
              item.url ===
              "https://example.com/booking"
          );


        expect(
          bookingEvidence.some(
            item =>
              item.source ===
              "PRICE_LINK"
          )
        ).toBe(false);


        expect(
          bookingEvidence.some(
            item =>
              item.source ===
              "CTA_LINK"
          )
        ).toBe(true);
      }
    );


    test(
      "extracts Product and ItemList JSON-LD URLs",
      () => {

        const result =
          extractListingProductLinks(
            `
            <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "ItemList",
              "itemListElement": [
                {
                  "@type": "ListItem",
                  "item": {
                    "@type": "Product",
                    "url": "/p/a"
                  }
                },
                {
                  "@type": "ListItem",
                  "url": "/p/b"
                }
              ]
            }
            </script>
            `,
            "https://example.com/catalog"
          );


        const urls =
          new Set(
            result.productLinks.map(
              item =>
                item.url
            )
          );


        expect(
          urls.has(
            "https://example.com/p/a"
          )
        ).toBe(true);


        expect(
          urls.has(
            "https://example.com/p/b"
          )
        ).toBe(true);
      }
    );


    test(
      "extracts pagination separately from product URLs",
      () => {

        const result =
          extractListingProductLinks(
            `
              <div class="pagination">
                <a href="?page=2">2</a>
                <a href="?page=3">3</a>
              </div>
            `,
            "https://example.com/catalog"
          );


        expect(
          result.paginationUrls
        ).toContain(
          "https://example.com/catalog?page=2"
        );
      }
    );


    test(
      "extracts API item URLs with product IDs",
      () => {

        const result =
          extractApiProductLinks(
            {
              apiCandidates: [
                {
                  responseUrl:
                    "https://example.com/api/products",

                  path:
                    "$.products",

                  sample: [
                    {
                      id:
                        11,

                      name:
                        "Product A",

                      url:
                        "/p/a",

                      price:
                        100
                    },

                    {
                      id:
                        12,

                      href:
                        "/p/b"
                    }
                  ]
                }
              ]
            },
            "https://example.com/catalog"
          );


        expect(
          result.map(
            item =>
              item.url
          )
        ).toEqual([
          "https://example.com/p/a",
          "https://example.com/p/b"
        ]);


        expect(
          result[0]
            ?.productId
        ).toBe(
          "11"
        );
      }
    );

  }
);