import {
  describe,
  expect,
  test
} from "vitest";

import {
  discoverMenuSeedsFromHtml
} from "../../../src/v02/discovery/menuSeedDiscovery.ts";


describe(
  "Menu Seed Discovery V2",
  () => {

    test(
      "discovers generic same-origin navigation seeds without camera filtering",
      () => {

        const html = `
          <html>
            <body>

              <nav>
                <a href="/">
                  Home
                </a>

                <a href="/categories/">
                  Danh mục
                </a>

                <a href="/rental">
                  Cho thuê
                </a>

                <a href="/accessories">
                  Phụ kiện
                </a>

                <a href="/cart">
                  Cart
                </a>

                <a href="https://outside.example/products">
                  External
                </a>
              </nav>

            </body>
          </html>
        `;


        const seeds =
          discoverMenuSeedsFromHtml(
            html,
            "https://example.com/"
          );


        const urls =
          seeds.map(
            seed =>
              seed.url
          );


        expect(
          urls
        ).toContain(
          "https://example.com/"
        );

        expect(
          urls
        ).toContain(
          "https://example.com/categories"
        );

        expect(
          urls
        ).toContain(
          "https://example.com/rental"
        );

        expect(
          urls
        ).toContain(
          "https://example.com/accessories"
        );


        expect(
          urls
        ).not.toContain(
          "https://example.com/cart"
        );


        expect(
          urls.some(
            url =>
              url.includes(
                "outside.example"
              )
          )
        ).toBe(false);
      }
    );


    test(
      "canonicalizes and deduplicates menu links",
      () => {

        const html = `
          <nav>
            <a href="/products/?utm_source=menu#top">
              Products
            </a>

            <a href="/products">
              Products again
            </a>
          </nav>
        `;


        const seeds =
          discoverMenuSeedsFromHtml(
            html,
            "https://example.com/"
          );


        expect(
          seeds
            .filter(
              seed =>
                seed.url ===
                "https://example.com/products"
            )
        ).toHaveLength(
          1
        );


        expect(
          seeds[0]?.confidence
        ).toBeGreaterThanOrEqual(
          0.85
        );
      }
    );

  }
);