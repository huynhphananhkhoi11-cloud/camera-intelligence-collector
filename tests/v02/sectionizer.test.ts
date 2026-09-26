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
  }
);
