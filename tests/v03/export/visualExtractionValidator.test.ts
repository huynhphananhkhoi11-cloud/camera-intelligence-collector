import {
  describe,
  expect,
  test
} from "vitest";

import {
  validateVisualExtraction
} from "../../../src/v03/validation/visualExtractionValidator.js";

import type {
  VisualExtraction
} from "../../../src/v03/validation/visualExtractionValidator.js";


function extraction(
  overrides:
    Partial<VisualExtraction> = {}
): VisualExtraction {

  return {
    website:
      "zshop.vn",

    productName:
      {
        value:
          "Canon EOS R50",
        rawText:
          "Canon EOS R50",
        shotId:
          "hero-01"
      },

    condition:
      {
        value:
          "NEW",
        rawText:
          "Hàng mới 100%",
        shotId:
          "hero-01"
      },

    specs:
      [
        {
          value:
            "Cảm biến APS-C CMOS 24.2MP",
          rawText:
            "Cảm biến APS-C CMOS 24.2MP",
          shotId:
            "specs-03"
        }
      ],

    rentalPricePerDay:
      null,

    rentalTerms:
      null,

    accessoriesIncluded:
      null,

    bundleIncluded:
      null,

    rating:
      {
        value:
          4.8,
        rawText:
          "4.8/5",
        shotId:
          "reviews-04"
      },

    reviewCount:
      {
        value:
          12,
        rawText:
          "12 đánh giá",
        shotId:
          "reviews-04"
      },

    stock:
      {
        value:
          "Còn hàng",
        rawText:
          "Còn hàng",
        shotId:
          "hero-01"
      },

    salePrice:
      {
        value:
          15990000,
        currency:
          "VND",
        rawText:
          "15.990.000đ",
        shotId:
          "hero-01"
      },

    url:
      "https://zshop.vn/canon-eos-r50-vi.html",

    ...overrides
  };
}


const context = {
  expectedUrl:
    "https://zshop.vn/canon-eos-r50-vi.html",

  expectedDomain:
    "zshop.vn",

  shotIds:
    new Set([
      "hero-01",
      "specs-03",
      "reviews-04"
    ]),

  disposition:
    "CAMERA" as const
};


describe(
  "Vision-first extraction validator",
  () => {

    test(
      "normalizes Likenew to USED and explicit new wording to NEW",
      () => {

        const used =
          validateVisualExtraction(
            extraction({
              condition:
                {
                  value:
                    "Likenew",
                  rawText:
                    "Hàng Likenew",
                  shotId:
                    "hero-01"
                }
            }),
            context
          );

        expect(
          used.status
        ).toBe(
          "VALIDATED"
        );

        expect(
          used.value.condition?.value
        ).toBe(
          "USED"
        );


        const fresh =
          validateVisualExtraction(
            extraction({
              condition:
                {
                  value:
                    "new 100%",
                  rawText:
                    "Mới 100% chính hãng",
                  shotId:
                    "hero-01"
                }
            }),
            context
          );

        expect(
          fresh.value.condition?.value
        ).toBe(
          "NEW"
        );
      }
    );


    test(
      "routes rating above 5 and non-integer review count to REVIEW",
      () => {

        const result =
          validateVisualExtraction(
            extraction({
              rating:
                {
                  value:
                    15,
                  rawText:
                    "15",
                  shotId:
                    "reviews-04"
                },

              reviewCount:
                {
                  value:
                    4.5,
                  rawText:
                    "4.5 reviews",
                  shotId:
                    "reviews-04"
                }
            }),
            context
          );

        expect(
          result.status
        ).toBe(
          "REVIEW"
        );

        expect(
          result.issues.map(
            issue =>
              issue.code
          )
        ).toEqual(
          expect.arrayContaining([
            "RATING_OUT_OF_RANGE",
            "REVIEW_COUNT_NOT_INTEGER"
          ])
        );
      }
    );


    test(
      "rejects warranty text as accessories instead of inventing an accessory",
      () => {

        const result =
          validateVisualExtraction(
            extraction({
              accessoriesIncluded:
                [
                  {
                    value:
                      "Bảo hành 6 tháng",
                    rawText:
                      "Bảo hành 6 tháng",
                    shotId:
                      "commerce-02"
                  }
                ]
            }),
            {
              ...context,
              shotIds:
                new Set([
                  ...context.shotIds,
                  "commerce-02"
                ])
            }
          );

        expect(
          result.status
        ).toBe(
          "REVIEW"
        );

        expect(
          result.value.accessoriesIncluded
        ).toBeNull();

        expect(
          result.issues.some(
            issue =>
              issue.code ===
              "ACCESSORY_POLICY_CONTAMINATION"
          )
        ).toBe(true);
      }
    );


    test(
      "rejects customers-also-buy text as bundle",
      () => {

        const result =
          validateVisualExtraction(
            extraction({
              bundleIncluded:
                [
                  {
                    value:
                      "RF-S 18-45mm",
                    rawText:
                      "Khách thường mua thêm RF-S 18-45mm",
                    shotId:
                      "commerce-02"
                  }
                ]
            }),
            {
              ...context,
              shotIds:
                new Set([
                  ...context.shotIds,
                  "commerce-02"
                ])
            }
          );

        expect(
          result.status
        ).toBe(
          "REVIEW"
        );

        expect(
          result.value.bundleIncluded
        ).toBeNull();

        expect(
          result.issues.some(
            issue =>
              issue.code ===
              "RELATED_PRODUCT_AS_BUNDLE"
          )
        ).toBe(true);
      }
    );


    test(
      "requires every non-null evidence field to reference a capture-manifest shot",
      () => {

        const result =
          validateVisualExtraction(
            extraction({
              stock:
                {
                  value:
                    "Còn hàng",
                  rawText:
                    "Còn hàng",
                  shotId:
                    "missing-shot"
                }
            }),
            context
          );

        expect(
          result.status
        ).toBe(
          "REVIEW"
        );

        expect(
          result.issues.some(
            issue =>
              issue.code ===
              "UNKNOWN_SHOT_ID" &&
              issue.field ===
              "stock"
          )
        ).toBe(true);
      }
    );


    test(
      "requires positive sale price with currency and matching URL/domain context",
      () => {

        const result =
          validateVisualExtraction(
            extraction({
              website:
                "evil.example",

              salePrice:
                {
                  value:
                    0,
                  currency:
                    "",
                  rawText:
                    "0",
                  shotId:
                    "hero-01"
                },

              url:
                "https://evil.example/r50"
            }),
            context
          );

        expect(
          result.status
        ).toBe(
          "REVIEW"
        );

        expect(
          result.issues.map(
            issue =>
              issue.code
          )
        ).toEqual(
          expect.arrayContaining([
            "WEBSITE_DOMAIN_MISMATCH",
            "URL_CONTEXT_MISMATCH",
            "SALE_PRICE_NOT_POSITIVE",
            "SALE_PRICE_CURRENCY_MISSING"
          ])
        );
      }
    );
  }
);
