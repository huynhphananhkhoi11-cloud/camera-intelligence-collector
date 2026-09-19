import {
  describe,
  expect,
  test
} from "vitest";

import {
  getSectionContent,
  sectionizeHtml
} from "../../src/v02/sectionizer.ts";


describe(
  "Sectionizer V2",
  () => {

    const html = `
      <html>
        <body>

          <h2>THÔNG SỐ KỸ THUẬT</h2>
          <div>
            Cảm biến 24.2MP.
            651 điểm lấy nét.
            Chụp liên tiếp 16 fps.
          </div>

          <h2>ĐIỀU KIỆN THUÊ</h2>
          <div>
            Cọc CCCD.
            Không tự ý tháo thiết bị.
          </div>

          <h2>THỜI GIAN THUÊ</h2>
          <div>
            Một ngày được tính 24 giờ.
          </div>

          <h2>PHỤ KIỆN ĐI KÈM</h2>
          <div>
            1 pin, 1 sạc, dây đeo.
          </div>

          <h2>COMBO</h2>
          <div>
            Không có combo.
          </div>

        </body>
      </html>
    `;

    test(
      "creates separate sections",
      () => {

        const sections =
          sectionizeHtml(html);

        expect(
          sections.some(
            x =>
              x.key ===
              "SPECS"
          )
        ).toBe(true);

        expect(
          sections.some(
            x =>
              x.key ===
              "RENTAL_CONDITIONS"
          )
        ).toBe(true);

        expect(
          sections.some(
            x =>
              x.key ===
              "ACCESSORIES"
          )
        ).toBe(true);
      }
    );


    test(
      "rental conditions do not contain spec numbers",
      () => {

        const sections =
          sectionizeHtml(html);

        const rental =
          getSectionContent(
            sections,
            "RENTAL_CONDITIONS"
          );

        expect(
          rental
        ).toContain(
          "Cọc CCCD"
        );

        expect(
          rental
        ).not.toContain(
          "651"
        );

        expect(
          rental
        ).not.toContain(
          "16 fps"
        );
      }
    );


    test(
      "accessories do not absorb combo",
      () => {

        const sections =
          sectionizeHtml(html);

        const accessories =
          getSectionContent(
            sections,
            "ACCESSORIES"
          );

        expect(
          accessories
        ).toContain(
          "1 pin"
        );

        expect(
          accessories
        ).not.toContain(
          "Không có combo"
        );
      }
    );


    test(
      "spec section keeps camera specs",
      () => {

        const sections =
          sectionizeHtml(html);

        const specs =
          getSectionContent(
            sections,
            "SPECS"
          );

        expect(
          specs
        ).toContain(
          "651 điểm lấy nét"
        );

        expect(
          specs
        ).toContain(
          "16 fps"
        );
      }
    );

    test(
      "keeps a generic product description bounded before related products",
      () => {

        const sections =
          sectionizeHtml(`
            <main>
              <h1>Body Sony A6400</h1>
              <h2>Mô tả</h2>
              <p>GIÁ THUÊ: 290.000đ / 1 Ngày</p>
              <p>Cảm biến APS-C. EVF. ISO 100-102400. AF 425 điểm.</p>
              <h2>Sản phẩm liên quan</h2>
              <div>Canon EOS 6D 300.000đ</div>
            </main>
          `);

        const description =
          getSectionContent(
            sections,
            "OTHER"
          );

        expect(
          description
        ).toContain(
          "GIÁ THUÊ: 290.000đ / 1 Ngày"
        );

        expect(
          description
        ).toContain(
          "Cảm biến APS-C"
        );

        expect(
          description
        ).not.toContain(
          "Canon EOS 6D"
        );
      }
    );


    test(
      "extracts a bounded description when the heading sits in a title wrapper beside the content wrapper",
      () => {

        const sections =
          sectionizeHtml(`
            <main>
              <div class="product-description">
                <div class="title-wrapper">
                  <h2>Mô tả</h2>
                </div>

                <div class="description-content">
                  <h2>GIÁ THUÊ: 250.000đ / 1 Ngày</h2>
                  <p>Cảm biến CMOS APS-C 24.2MP.</p>
                  <p>EVF 2.36m-Dot.</p>
                  <p>AF 425 điểm.</p>
                  <p>ISO 100-102400.</p>
                </div>
              </div>

              <h2>Sản phẩm liên quan</h2>
              <div>Canon EOS 6D 300.000đ</div>
            </main>
          `);

        const description =
          getSectionContent(
            sections,
            "OTHER"
          );

        expect(
          description
        ).toContain(
          "GIÁ THUÊ: 250.000đ / 1 Ngày"
        );

        expect(
          description
        ).toContain(
          "Cảm biến CMOS APS-C"
        );

        expect(
          description
        ).not.toContain(
          "Canon EOS 6D"
        );
      }
    );

  }
);
