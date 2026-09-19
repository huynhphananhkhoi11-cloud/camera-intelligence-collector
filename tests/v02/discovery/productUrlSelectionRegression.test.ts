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
                  Máy ảnh
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
                    18.000.000đ
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
              18.000.000đ
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
                  Giá: 18.000.000đ
                </div>

                <div>
                  Tình trạng: Còn hàng
                </div>

                <div>
                  Bảo hành: 12 tháng
                </div>

                <div>
                  Phụ kiện: Pin, Sạc
                </div>

                <h2>
                  Thông số kỹ thuật
                </h2>

                <button>
                  Thêm vào giỏ hàng
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

    test(
      "recognizes a UTF-8 Vietnamese rental detail page as the current-page product candidate",
      () => {

        const html = `
          <html>
            <body>
              <main>
                <h1>SONY A6400</h1>
                <div>Giá thuê: 360.000 ₫ / ngày</div>
                <div>Tình trạng: Còn hàng</div>
                <div>Điều kiện thuê: Cọc CCCD</div>
                <div>Phụ kiện: Pin, sạc</div>
                <h2>Thông số kỹ thuật</h2>
                <button>Thuê ngay</button>
                <section class="related-products">
                  <a href="/equipment/104">CANON M</a>
                </section>
              </main>
            </body>
          </html>
        `;

        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://example.com/equipment/21"
          );

        const current =
          result.candidates.find(
            item =>
              item.url ===
                "https://example.com/equipment/21"
          );

        expect(
          current?.reasons
        ).toContain(
          "current-page product detail"
        );

        expect(
          current?.score
        ).toBeLessThanOrEqual(
          100
        );
      }
    );


    test(
      "does not promote a catalog landing page to a direct product without product-detail signals",
      () => {

        const html = `
          <html>
            <body>
              <main>
                <h1>Thuê máy ảnh</h1>
                <div>Giá từ 300.000 ₫ / ngày</div>
                <a href="/equipment/21">SONY A6400</a>
                <a href="/equipment/104">CANON M</a>
              </main>
            </body>
          </html>
        `;

        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://example.com/thue-may-anh"
          );

        expect(
          result.productUrls
        ).not.toContain(
          "https://example.com/thue-may-anh"
        );
      }
    );


    test(
      "recognizes a product-like path with title price and CTA even when optional detail sections are absent",
      () => {

        const html = `
          <html>
            <body>
              <main>
                <h1>Body Sony A6400</h1>
                <div>290,000₫</div>
                <button>Thêm vào giỏ</button>
                <h2>Mô tả</h2>
                <p>Giá thuê: 290.000đ / 1 Ngày</p>
                <p>Set thiết bị cho thuê bao gồm: 1 Body Camera, 2 Pin, 1 Sạc Pin</p>
              </main>
            </body>
          </html>
        `;

        const result =
          discoverProductUrlsFromHtml(
            html,
            "https://example.com/products/body-sony-a6400"
          );

        const current =
          result.candidates.find(
            item =>
              item.url ===
                "https://example.com/products/body-sony-a6400"
          );

        expect(
          current?.reasons
        ).toContain(
          "current-page product detail"
        );
      }
    );

  }
);