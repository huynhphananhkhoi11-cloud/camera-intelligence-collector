import {
  describe,
  expect,
  test
} from "vitest";

import {
  extractRawProductFactsFromHtml
} from "../../src/v02/rawProductExtractor.ts";

import {
  processProductHtml
} from "../../src/v02/pipeline/productPipeline.ts";


function detailWithRelatedPrices():
  string {

  return `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context":
            "https://schema.org",

          "@type":
            "Product",

          "name":
            "Canon EOS R50",

          "itemCondition":
            "https://schema.org/NewCondition",

          "offers": {
            "@type":
              "Offer",

            "price":
              "18000000",

            "priceCurrency":
              "VND"
          }
        }
        </script>
      </head>

      <body>
        <nav>
          <a href="/may-anh">
            MÃƒÆ’Ã‚ÂY ÃƒÂ¡Ã‚ÂºÃ‚Â¢NH
          </a>
        </nav>

        <main>
          <section class="product-detail">
            <h1>
              CANON EOS R50 (NEW 100%)
            </h1>

            <div class="current-price">
              18.000.000Ãƒâ€žÃ¢â‚¬Ëœ
            </div>

            <button>
              MUA NGAY
            </button>

            <h2>
              THÃƒÆ’Ã¢â‚¬ÂNG SÃƒÂ¡Ã‚Â»Ã‚Â KÃƒÂ¡Ã‚Â»Ã‚Â¸ THUÃƒÂ¡Ã‚ÂºÃ‚Â¬T
            </h2>

            <div>
              Mirrorless.
              APS-C sensor.
              ISO 100-32000.
              Autofocus.
              EVF.
              4K video.
            </div>
          </section>

          <section class="related-products">
            <h2>
              SÃƒÂ¡Ã‚ÂºÃ‚Â¢N PHÃƒÂ¡Ã‚ÂºÃ‚Â¨M LIÃƒÆ’Ã…Â N QUAN
            </h2>

            <article>
              <a href="/canon-r8">
                Canon EOS R8
              </a>

              <div class="price">
                23.000.000Ãƒâ€žÃ¢â‚¬Ëœ
              </div>
            </article>

            <article>
              <a href="/sony-a7">
                Sony A7
              </a>

              <div class="sale-price">
                29.000.000Ãƒâ€žÃ¢â‚¬Ëœ
              </div>
            </article>
          </section>
        </main>
      </body>
    </html>
  `;
}


describe(
  "primary product price evidence scope",
  () => {

    test(
      "related product prices do not contaminate primary detail price",
      () => {

        const html =
          detailWithRelatedPrices();

        const url =
          "https://shop.test/canon-eos-r50-new";


        const facts =
          extractRawProductFactsFromHtml(
            html,
            url
          );


        expect(
          facts.visiblePriceTexts
        ).toContain(
          "18.000.000Ãƒâ€žÃ¢â‚¬Ëœ"
        );


        expect(
          facts.visiblePriceTexts
        ).not.toContain(
          "23.000.000Ãƒâ€žÃ¢â‚¬Ëœ"
        );


        expect(
          facts.visiblePriceTexts
        ).not.toContain(
          "29.000.000Ãƒâ€žÃ¢â‚¬Ëœ"
        );


        const result =
          processProductHtml(
            html,
            url,
            "UNKNOWN"
          );


        expect(
          result.row.salePrice
        ).toBe(
          18_000_000
        );


        expect(
          result.fields.salePrice.conflict
        ).toBe(
          false
        );


        expect(
          result.validation.reasons
        ).not.toContain(
          "sale price conflict"
        );
      }
    );


    test(
      "broad common ancestor still excludes related product prices",
      () => {

        const html = `
          <html>
            <head>
              <script type="application/ld+json">
              {
                "@context":
                  "https://schema.org",

                "@type":
                  "Product",

                "name":
                  "Canon EOS R50",

                "itemCondition":
                  "https://schema.org/NewCondition",

                "offers": {
                  "@type":
                    "Offer",

                  "price":
                    "18000000",

                  "priceCurrency":
                    "VND"
                }
              }
              </script>
            </head>

            <body>
              <main class="product-page">
                <div class="title-zone">
                  <h1>
                    CANON EOS R50 (NEW 100%)
                  </h1>
                </div>

                <div class="buy-zone">
                  <div class="current-price">
                    18.000.000Ã„â€˜
                  </div>

                  <button>
                    MUA NGAY
                  </button>
                </div>

                <section class="related-products">
                  <article class="product-card">
                    <a href="/canon-r8">
                      Canon EOS R8
                    </a>

                    <div class="price">
                      23.000.000Ã„â€˜
                    </div>
                  </article>

                  <article class="product-card">
                    <a href="/sony-a7">
                      Sony A7
                    </a>

                    <div class="sale-price">
                      29.000.000Ã„â€˜
                    </div>
                  </article>
                </section>
              </main>
            </body>
          </html>
        `;

        const url =
          "https://shop.test/canon-eos-r50-new";


        const facts =
          extractRawProductFactsFromHtml(
            html,
            url
          );


        expect(
          facts.visiblePriceTexts
        ).toContain(
          "18.000.000Ã„â€˜"
        );


        expect(
          facts.visiblePriceTexts
        ).not.toContain(
          "23.000.000Ã„â€˜"
        );


        expect(
          facts.visiblePriceTexts
        ).not.toContain(
          "29.000.000Ã„â€˜"
        );


        const result =
          processProductHtml(
            html,
            url,
            "UNKNOWN"
          );


        expect(
          result.row.salePrice
        ).toBe(
          18_000_000
        );


        expect(
          result.fields.salePrice.conflict
        ).toBe(
          false
        );
      }
    );

    test(
      "semantic related heading excludes prices without product-card classes",
      () => {

        const html = `
          <html>
            <head>
              <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "name": "Canon EOS R50",
                "offers": {
                  "@type": "Offer",
                  "price": "18000000",
                  "priceCurrency": "VND"
                }
              }
              </script>
            </head>

            <body>
              <main>
                <div>
                  <h1>CANON EOS R50 (NEW 100%)</h1>
                </div>

                <div>
                  <div class="current-price">18.000.000đ</div>
                  <button>MUA NGAY</button>
                </div>

                <h2>Sản phẩm cùng loại</h2>

                <div class="grid-x">
                  <div class="tile-x">
                    <a href="/canon-r8">Canon EOS R8</a>
                    <span class="price">28.000.000đ</span>
                  </div>

                  <div class="tile-y">
                    <a href="/canon-r7">Canon EOS R7</a>
                    <span class="price">37.490.000đ</span>
                  </div>
                </div>
              </main>
            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://shop.test/canon-eos-r50-new"
          );


        expect(
          facts.visiblePriceTexts
        ).toContain(
          "18.000.000đ"
        );


        expect(
          facts.visiblePriceTexts
        ).not.toContain(
          "28.000.000đ"
        );


        expect(
          facts.visiblePriceTexts
        ).not.toContain(
          "37.490.000đ"
        );


        const result =
          processProductHtml(
            html,
            "https://shop.test/canon-eos-r50-new",
            "UNKNOWN"
          );


        expect(
          result.fields.salePrice.conflict
        ).toBe(
          false
        );
      }
    );


    test(
      "foreign condition section outside primary product scope cannot contradict explicit title",
      () => {

        const html = `
          <html>
            <body>
              <main>
                <div class="product-zone">
                  <h1>CANON EOS R50 (NEW 100%)</h1>
                  <div class="current-price">18.000.000đ</div>
                  <button>MUA NGAY</button>
                </div>
              </main>

              <footer>
                <strong>Tình trạng</strong>
                <span>Hàng cũ</span>
              </footer>
            </body>
          </html>
        `;


        const result =
          processProductHtml(
            html,
            "https://shop.test/canon-eos-r50-new",
            "UNKNOWN"
          );


        expect(
          result.analysis.condition.condition
        ).toBe(
          "NEW"
        );


        expect(
          result.analysis.condition.conflict
        ).toBe(
          false
        );
      }
    );

    test(
      "share and print controls near the title do not prematurely bound primary sale-price scope",
      () => {

        const html = `
          <html>
            <body>
              <main>
                <section class="product-detail">
                  <div class="title-zone">
                    <h1>
                      Máy ảnh Sony Alpha A6400 + Lens Sigma 18-50mm f/2.8
                    </h1>

                    <button>
                      Chia sẻ
                    </button>

                    <button>
                      Tạo bản in
                    </button>
                  </div>

                  <div class="commerce-zone">
                    <h2>
                      27.480.000đ
                    </h2>

                    <div>
                      30.990.000đ
                    </div>

                    <button>
                      MUA NGAY
                    </button>
                  </div>
                </section>

                <h2>
                  Sản phẩm liên quan
                </h2>

                <section class="related-products">
                  <span class="price">
                    590.000đ
                  </span>

                  <span class="price">
                    28.500.000đ
                  </span>
                </section>
              </main>
            </body>
          </html>
        `;

        const url =
          "https://shop.test/products/sony-a6400-sigma-18-50";

        const facts =
          extractRawProductFactsFromHtml(
            html,
            url
          );

        expect(
          facts.visiblePriceTexts
        ).toContain(
          "27.480.000đ"
        );

        expect(
          facts.visiblePriceTexts
        ).not.toContain(
          "590.000đ"
        );

        expect(
          facts.visiblePriceTexts
        ).not.toContain(
          "28.500.000đ"
        );

        const result =
          processProductHtml(
            html,
            url,
            "SALE_NEW"
          );

        expect(
          result.row.salePrice
        ).toBe(
          27_480_000
        );
      }
    );


    test(
      "site-logo h1 does not steal title or scope from a rental product without ecommerce CTA",
      () => {

        const html = `
          <html>
            <head>
              <meta
                property="og:title"
                content="Cho thuê chân máy tại Hà Nội- Tripod Benro KH25N - RentLens"
              >
            </head>

            <body>
              <div class="site-shell">
                <h1 class="site-header__logo">
                  RentLens
                </h1>
              </div>

              <main>
                <section class="product-details">
                  <header class="product-details__header">
                    <h1 class="product-details__title">
                      Cho thuê chân máy tại Hà Nội- Tripod Benro KH25N
                    </h1>
                  </header>

                  <h2 class="product-details__category">
                    Phụ kiện máy ảnh Phụ kiện máy quay
                  </h2>

                  <p>
                    Giá thuê: 100.000 đ/ngày
                  </p>

                  <p>
                    Chân máy quay chuyên nghiệp Benro KH25N.
                  </p>
                </section>

                <section class="related-products">
                  <h2>
                    Sản phẩm liên quan
                  </h2>

                  <article>
                    <h3>
                      Cho thuê Godox AD600BM
                    </h3>

                    <p>
                      GIÁ THUÊ: 350.000 Đ/NGÀY
                    </p>
                  </article>
                </section>
              </main>
            </body>
          </html>
        `;

        const url =
          "https://shop.test/lens/cho-thue-chan-may-quay-benro-kh-25";

        const facts =
          extractRawProductFactsFromHtml(
            html,
            url
          );

        expect(
          facts.title
        ).toBe(
          "Cho thuê chân máy tại Hà Nội- Tripod Benro KH25N"
        );

        expect(
          facts.visiblePriceTexts.some(
            value =>
              value.includes(
                "100.000"
              )
          )
        ).toBe(true);

        expect(
          facts.visiblePriceTexts
        ).not.toContain(
          "GIÁ THUÊ: 350.000 Đ/NGÀY"
        );

        const result =
          processProductHtml(
            html,
            url,
            "RENTAL"
          );

        expect(
          result.analysis.entity.type
        ).toBe(
          "ACCESSORY"
        );

        expect(
          result.validation.decision
        ).toBe(
          "EXCLUDE"
        );
      }
    );

  }
);
