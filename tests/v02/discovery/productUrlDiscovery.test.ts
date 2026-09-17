import {
  describe,
  expect,
  test
} from "vitest";

import {
  discoverProductUrlsFromHtml
} from "../../../src/v02/discovery/productUrlDiscovery.ts";


describe(
  "Product URL Discovery V2",
  () => {

    test(
      "discovers ALL commercial product types before classification",
      () => {

        const html = `
          <html>
            <body>

              <div class="product-card">
                <a href="/equipment/21">
                  <img src="a.jpg">
                  Sony A6400
                </a>
                <span>360.000đ/ngày</span>
              </div>

              <div class="product-card">
                <a href="/equipment/22">
                  <img src="b.jpg">
                  Canon EF 24-105
                </a>
                <span>200.000đ/ngày</span>
              </div>

              <div class="product-card">
                <a href="/equipment/23">
                  <img src="c.jpg">
                  Máy in ảnh
                </a>
                <span>300.000đ/ngày</span>
              </div>

            </body>
          </html>
        `;

        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://example.com/categories"
          );

        expect(
          result.productUrls
        ).toContain(
          "https://example.com/equipment/21"
        );

        expect(
          result.productUrls
        ).toContain(
          "https://example.com/equipment/22"
        );

        expect(
          result.productUrls
        ).toContain(
          "https://example.com/equipment/23"
        );
      }
    );


    test(
      "does not treat pagination as product",
      () => {

        const html = `
          <a href="/products?page=2">
            2
          </a>

          <div class="product-card">
            <a href="/product/canon-r50">
              Canon R50
            </a>
            <span>
              15.000.000đ
            </span>
          </div>
        `;

        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://example.com/products"
          );

        expect(
          result.paginationUrls
        ).toContain(
          "https://example.com/products?page=2"
        );

        expect(
          result.productUrls
        ).not.toContain(
          "https://example.com/products?page=2"
        );
      }
    );


    test(
      "hard excludes cart",
      () => {

        const html = `
          <div class="product-card">
            <a href="/cart">
              Cart
            </a>
            <span>
              100.000đ
            </span>
          </div>
        `;

        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://example.com"
          );

        expect(
          result.productUrls
        ).not.toContain(
          "https://example.com/cart"
        );
      }
    );


    test(
      "discovers product URL from JSON-LD",
      () => {

        const html = `
          <script type="application/ld+json">
          {
            "@context":
              "https://schema.org",
            "@type":
              "Product",
            "name":
              "Canon R50",
            "url":
              "/san-pham/canon-r50"
          }
          </script>
        `;

        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://example.com/catalog"
          );

        expect(
          result.productUrls
        ).toContain(
          "https://example.com/san-pham/canon-r50"
        );
      }
    );
  }
);
