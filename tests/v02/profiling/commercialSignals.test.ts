import {
  describe,
  expect,
  test
} from "vitest";

import {
  detectCommercialSignals
} from "../../../src/v02/profiling/commercialSignals.ts";


describe(
  "Commercial Signals V2",
  () => {

    test(
      "detects rental site prior",
      () => {

        const html = `
          <html>
            <head>
              <title>
                Thuê máy ảnh Sài Gòn
              </title>
            </head>

            <body>

              <nav>
                Cho thuê máy ảnh
                Thuê thiết bị
              </nav>

              <main>
                <button>
                  THUÊ NGAY
                </button>

                <div>
                  360.000đ/ngày
                </div>
              </main>

            </body>
          </html>
        `;


        const result =
          detectCommercialSignals(
            html
          );


        expect(
          result.rentalScore
        ).toBeGreaterThanOrEqual(
          45
        );


        expect(
          result.rentalScore
        ).toBeGreaterThan(
          result.saleScore
        );


        expect(
          result.evidence.some(
            item =>
              item.kind ===
              "RENTAL" &&
              item.source ===
              "PRICE_UNIT"
          )
        ).toBe(true);
      }
    );


    test(
      "detects sale and second-hand signals",
      () => {

        const html = `
          <html>
            <body>

              <nav>
                Sản phẩm
                Hàng cũ
              </nav>

              <button>
                MUA NGAY
              </button>

              <button>
                THÊM VÀO GIỎ
              </button>

              <div>
                Canon EOS R hàng cũ
              </div>

              <script type="application/ld+json">
              {
                "@context":
                  "https://schema.org",

                "@type":
                  "Product",

                "offers": {
                  "@type":
                    "Offer",

                  "businessFunction":
                    "http://purl.org/goodrelations/v1#Sell"
                }
              }
              </script>

            </body>
          </html>
        `;


        const result =
          detectCommercialSignals(
            html
          );


        expect(
          result.saleScore
        ).toBeGreaterThan(
          result.rentalScore
        );


        expect(
          result.usedScore
        ).toBeGreaterThan(0);


        expect(
          result.evidence.some(
            item =>
              item.source ===
              "JSON_LD" &&
              item.kind ===
              "SALE"
          )
        ).toBe(true);
      }
    );


    test(
      "can keep rental and sale evidence simultaneously",
      () => {

        const html = `
          <html>
            <body>

              <nav>
                Cho thuê
                Sản phẩm
              </nav>

              <button>
                THUÊ NGAY
              </button>

              <button>
                MUA NGAY
              </button>

              <div>
                500.000đ/ngày
              </div>

            </body>
          </html>
        `;


        const result =
          detectCommercialSignals(
            html
          );


        expect(
          result.rentalScore
        ).toBeGreaterThan(0);

        expect(
          result.saleScore
        ).toBeGreaterThan(0);
      }
    );

  }
);