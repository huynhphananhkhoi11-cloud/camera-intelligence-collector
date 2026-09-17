import {
  describe,
  expect,
  test
} from "vitest";

import {
  processProductHtml
} from "../../../src/v02/pipeline/productPipeline.ts";


describe(
  "Product Pipeline V2",
  () => {

    test(
      "rental camera => ACCEPT",
      () => {

        const html = `
          <html>
            <body>

              <nav class="breadcrumb">
                <a>Home</a>
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

              <div class="rating">
                4.9/5
              </div>

              <div class="review-count">
                127 đánh giá
              </div>

              <h2>
                THÔNG SỐ KỸ THUẬT
              </h2>

              <div>
                Loại máy Mirrorless.
                Cảm biến APS-C 24.2MP.
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

        const result =
          processProductHtml(
            html,
            "https://example.com/equipment/21",
            "RENTAL"
          );

        expect(
          result.validation.decision
        ).toBe(
          "ACCEPT"
        );

        expect(
          result.row.form
        ).toContain(
          "RENTAL"
        );

        expect(
          result.row.rentalPrice
        ).toBe(360000);

        expect(
          result.row.rating
        ).toBe(4.9);

        expect(
          result.row.reviewCount
        ).toBe(127);
      }
    );


    test(
      "used sale camera => ACCEPT SECOND_HAND",
      () => {

        const html = `
          <html>
            <body>

              <nav class="breadcrumb">
                <a>Home</a>
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
                Cảm biến Full Frame.
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

        const result =
          processProductHtml(
            html,
            "https://example.com/product/eos-r",
            "SALE_MIXED"
          );

        expect(
          result.validation.decision
        ).toBe(
          "ACCEPT"
        );

        expect(
          result.row.form
        ).toContain(
          "SECOND_HAND"
        );

        expect(
          result.row.salePrice
        ).toBe(
          18000000
        );
      }
    );


    test(
      "lens => EXCLUDE",
      () => {

        const html = `
          <nav class="breadcrumb">
            <a>Home</a>
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
            Filter 77mm.
          </div>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/equipment/lens",
            "RENTAL"
          );

        expect(
          result.validation.decision
        ).toBe(
          "EXCLUDE"
        );
      }
    );


    test(
      "camera missing price => REVIEW",
      () => {

        const html = `
          <nav class="breadcrumb">
            <a>Home</a>
            <a>THUÊ MÁY ẢNH</a>
            <a>Sony A6400</a>
          </nav>

          <h1>Sony A6400</h1>

          <button>
            THUÊ NGAY
          </button>

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
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/equipment/21",
            "RENTAL"
          );

        expect(
          result.validation.decision
        ).toBe(
          "REVIEW"
        );

        expect(
          result.validation.reasons
        ).toContain(
          "missing rental price evidence"
        );
      }
    );
  }
);
