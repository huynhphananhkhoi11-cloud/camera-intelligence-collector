import {
  describe,
  expect,
  test
} from "vitest";

import {
  buildSimpleSemantic13Prompt
} from "../../../src/v03/ai/simpleSemantic13Prompt.js";

describe(
  "buildSimpleSemantic13Prompt",
  () => {
    test(
      "lets Gemini match screenshot information to the 13 workbook columns by meaning",
      () => {
        const prompt =
          buildSimpleSemantic13Prompt({
            pageUrl:
              "https://example.com/input",
            finalUrl:
              "https://example.com/final",
            website:
              "example.com",
            shots: [
              {
                shotId: "hero-01",
                sectionLabel: "hero"
              },
              {
                shotId: "extra-02",
                sectionLabel: "availability"
              }
            ]
          });

        expect(prompt).toContain(
          "Use your own visual and language understanding"
        );

        expect(prompt).toContain(
          "read all supplied screenshots"
        );

        expect(prompt).toContain(
          "match visible information to these workbook columns by meaning"
        );

        const mappings = [
          "Website -> website",
          "Tên sản phẩm -> productName",
          "Hàng cũ/Hàng mới -> condition",
          "Thông số mô tả -> specs",
          "Giá thuê/ngày -> rentalPricePerDay",
          "Điều kiện thuê riêng -> rentalTerms",
          "Phụ kiện đi kèm -> accessoriesIncluded",
          "Combo/gói đi kèm -> bundleIncluded",
          "Điểm đánh giá -> rating",
          "Số lượt đánh giá/review -> reviewCount",
          "Tồn kho -> stock",
          "Giá bán -> salePrice",
          "URL -> url"
        ];

        for (
          const mapping of
          mappings
        ) {
          expect(prompt).toContain(
            mapping
          );
        }

        expect(prompt).toContain(
          "If you can see a supported value, fill it."
        );

        expect(prompt).toContain(
          "If you cannot see a supported value, use null or [] as appropriate."
        );

        expect(prompt).toContain(
          "Evidence is only for traceability"
        );

        expect(prompt).not.toContain(
          "field-by-field completeness and exclusivity audit"
        );

        expect(prompt).not.toContain(
          "After assigning rental facts"
        );

        expect(prompt).not.toContain(
          "Body Only"
        );

        expect(prompt).not.toContain(
          "400,000"
        );

        expect(prompt).not.toContain(
          "zshop"
        );

        expect(prompt).toContain(
          "ALLOWED_SHOT_IDS: hero-01, extra-02"
        );
      }
    );
  }
);
