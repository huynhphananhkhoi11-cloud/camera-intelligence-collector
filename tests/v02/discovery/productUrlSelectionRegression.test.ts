import {
  describe,
  expect,
  test
} from "vitest";

import {
  discoverProductUrlsFromHtml
} from "../../../src/v02/discovery/productUrlDiscovery.js";


describe(
  "Product URL selection regression",
  () => {

    test(
      "navigation list items cannot outrank a real product card",
      () => {

        const nav =
          Array.from(
            {
              length:
                4
            },
            () => `
              <li>
                <a href="/may-anh">
                  MÃ¡y áº£nh
                </a>
              </li>
            `
          ).join("");

        const html = `
          <html>
            <body>
              <nav>
                <ul>
                  ${nav}
                </ul>
              </nav>

              <main>
                <div class="product-card">
                  <a href="/canon-eos-r50-new">
                    <img src="/r50.jpg">
                    CANON EOS R50 NEW 100%
                  </a>
                  <span>
                    18.000.000Ä‘
                  </span>
                </div>
              </main>
            </body>
          </html>
        `;

        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://example.com/catalog"
          );

        expect(
          result.productUrls[0]
        ).toBe(
          "https://example.com/canon-eos-r50-new"
        );

        expect(
          result.productUrls
        ).not.toContain(
          "https://example.com/may-anh"
        );
      }
    );


    test(
      "duplicate appearances do not inflate a candidate score",
      () => {

        const card = `
          <div class="product-card">
            <a href="/canon-eos-r50-new">
              <img src="/r50.jpg">
              Canon EOS R50
            </a>
            <span>
              18.000.000Ä‘
            </span>
          </div>
        `;

        const singleResult =
          discoverProductUrlsFromHtml(
            card,
            "https://example.com/catalog"
          );


        const singleCandidate =
          singleResult.candidates.find(
            item =>
              item.url ===
                "https://example.com/canon-eos-r50-new"
          );


        const result =
          discoverProductUrlsFromHtml(
            card + card,
            "https://example.com/catalog"
          );

        const candidate =
          result.candidates.find(
            item =>
              item.url ===
                "https://example.com/canon-eos-r50-new"
          );

        expect(
          candidate
        ).toBeDefined();

        expect(
          singleCandidate
        ).toBeDefined();


        expect(
          candidate?.score
        ).toBe(
          singleCandidate?.score
        );
      }
    );


    test(
      "a strong current product-detail page remains a candidate even without a self link",
      () => {

        const html = `
          <html>
            <body>
              <main>
                <h1>
                  CANON EOS R50 NEW 100%
                </h1>

                <div>
                  GiÃ¡: 18.000.000Ä‘
                </div>

                <div>
                  TÃ¬nh tráº¡ng: CÃ²n hÃ ng
                </div>

                <div>
                  Báº£o hÃ nh: 12 thÃ¡ng
                </div>

                <div>
                  Phá»¥ kiá»‡n: Pin, Sáº¡c
                </div>

                <h2>
                  ThÃ´ng sá»‘ ká»¹ thuáº­t
                </h2>

                <button>
                  ThÃªm vÃ o giá» hÃ ng
                </button>

                <button>
                  Mua ngay
                </button>
              </main>
            </body>
          </html>
        `;

        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://example.com/canon-eos-r50-new"
          );

        expect(
          result.productUrls
        ).toContain(
          "https://example.com/canon-eos-r50-new"
        );
      }
    );
  }
);