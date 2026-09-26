import {
  describe,
  expect,
  test
} from "vitest";

import {
  analyzeRawProduct
} from "../../src/v02/evidenceEngine.ts";

import {
  extractRawProductFactsFromHtml
} from "../../src/v02/rawProductExtractor.ts";


describe(
  "Evidence Engine V2",
  () => {

    test(
      "rental Sony A6400 => ACCEPT RENTAL",
      () => {

        const html = `
          <html>
            <body>

              <nav class="breadcrumb">
                <a>Trang chủ</a>
                <a>THUÊ MÁY ẢNH</a>
                <a>Sony A6400</a>
              </nav>

              <h1>
                Sony A6400
              </h1>

              <div class="price">
                360.000đ/ngày
              </div>

              <button>
                THUÊ NGAY
              </button>

              <h2>
                THÔNG SỐ KỸ THUẬT
              </h2>

              <div>
                Loại máy Mirrorless.
                Cảm biến APS-C.
                ISO 100-32000.
                425 điểm lấy nét.
                EVF.
                Quay video 4K.
              </div>

              <h2>
                ĐIỀU KIỆN THUÊ
              </h2>

              <div>
                Cọc CCCD.
              </div>

            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/a6400"
          );

        const result =
          analyzeRawProduct(
            facts,
            "RENTAL"
          );

        expect(
          result.entity.type
        ).toBe("CAMERA");

        expect(
          result.offer.rental
        ).toBe(true);

        expect(
          result.forms
        ).toContain(
          "RENTAL"
        );

        expect(
          result.decision
        ).toBe(
          "ACCEPT"
        );
      }
    );


    test(
      "used sale camera => SECOND_HAND",
      () => {

        const html = `
          <html>
            <body>

              <nav class="breadcrumb">
                <a>Trang chủ</a>
                <a>MÁY ẢNH CŨ</a>
                <a>Canon EOS R</a>
              </nav>

              <h1>
                CANON EOS R BODY - HÀNG CŨ
              </h1>

              <div class="price">
                18.000.000đ
              </div>

              <button>
                MUA NGAY
              </button>

              <h2>
                THÔNG SỐ KỸ THUẬT
              </h2>

              <div>
                Mirrorless.
                Cảm biến full-frame.
                ISO 100-40000.
                Dual Pixel AF.
                EVF.
                Quay video 4K.
              </div>

              <h2>
                TÌNH TRẠNG
              </h2>

              <div>
                Hàng cũ.
              </div>

            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/eos-r"
          );

        const result =
          analyzeRawProduct(
            facts,
            "SALE_MIXED"
          );

        expect(
          result.offer.sale
        ).toBe(true);

        expect(
          result.condition.condition
        ).toBe(
          "USED"
        );

        expect(
          result.forms
        ).toContain(
          "SECOND_HAND"
        );

        expect(
          result.decision
        ).toBe(
          "ACCEPT"
        );
      }
    );


    test(
      "new camera => NEW",
      () => {

        const html = `
          <html>
            <body>

              <nav class="breadcrumb">
                <a>Trang chủ</a>
                <a>MÁY ẢNH CHÍNH HÃNG</a>
                <a>Canon EOS R50</a>
              </nav>

              <h1>
                Canon EOS R50 NEW 100%
              </h1>

              <div class="price">
                15.500.000đ
              </div>

              <button>
                MUA NGAY
              </button>

              <h2>
                THÔNG SỐ KỸ THUẬT
              </h2>

              <div>
                Mirrorless.
                Cảm biến APS-C 24.2MP.
                ISO 100-32000.
                Dual Pixel AF II.
                EVF.
                Quay video 4K.
              </div>

            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/r50"
          );

        const result =
          analyzeRawProduct(
            facts,
            "SALE_MIXED"
          );

        expect(
          result.condition.condition
        ).toBe(
          "NEW"
        );

        expect(
          result.forms
        ).toContain(
          "NEW"
        );

        expect(
          result.decision
        ).toBe(
          "ACCEPT"
        );
      }
    );


    test(
      "lens => EXCLUDE",
      () => {

        const html = `
          <html>
            <body>

              <nav class="breadcrumb">
                <a>Trang chủ</a>
                <a>THUÊ PHỤ KIỆN - LENS</a>
                <a>Canon Lens</a>
              </nav>

              <h1>
                CANON EF 24-105MM F4L IS USM
              </h1>

              <div class="price">
                200.000đ/ngày
              </div>

              <button>
                THUÊ NGAY
              </button>

              <h2>
                THÔNG SỐ KỸ THUẬT
              </h2>

              <div>
                Tiêu cự 24-105mm.
                Khẩu độ f/4.
                Cấu trúc quang học.
                Đường kính filter 77mm.
              </div>

            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/lens"
          );

        const result =
          analyzeRawProduct(
            facts,
            "RENTAL"
          );

        expect(
          result.entity.type
        ).toBe(
          "LENS"
        );

        expect(
          result.decision
        ).toBe(
          "EXCLUDE"
        );
      }
    );


    test(
      "camera without transaction proof => REVIEW",
      () => {

        const html = `
          <html>
            <body>

              <h1>
                Sony A6400
              </h1>

              <h2>
                THÔNG SỐ KỸ THUẬT
              </h2>

              <div>
                Mirrorless.
                Cảm biến APS-C.
                ISO 100-32000.
                AF 425 điểm.
                EVF.
                Quay video 4K.
              </div>

            </body>
          </html>
        `;

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/a6400"
          );

        const result =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        expect(
          result.entity.type
        ).toBe(
          "CAMERA"
        );

        expect(
          result.decision
        ).toBe(
          "REVIEW"
        );
      }
    );
  }
);
