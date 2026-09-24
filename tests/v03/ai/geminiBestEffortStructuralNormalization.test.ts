import {
  describe,
  expect,
  test
} from "vitest";

import {
  Gemini36VisualExtractor
} from "../../../src/v03/ai/gemini36VisualExtractor.js";

const shots = [
  {
    shotId: "hero-01",
    mimeType: "image/png" as const,
    base64: "aGVybw==",
    resolution: "high" as const,
    sectionLabel: "hero"
  }
];

describe(
  "Gemini best-effort structural normalization",
  () => {
    test(
      "normalizes recoverable optional omissions without changing semantic values",
      async () => {
        const rawDecision = {
          classification: "CAMERA_PRODUCT",
          reviewReason: null,
          row: {
            website: "wrong.example",
            productName:
              "Camera X Selected Kit",
            specs: null,
            accessoriesIncluded:
              "Battery",
            url:
              "https://wrong.example/item"
          },
          evidence: {
            classification: {
              shotId: "hero-01",
              rawText:
                "Camera X Selected Kit"
            },
            productName: {
              shotId: "hero-01",
              rawText:
                "Camera X Selected Kit"
            },
            specs: null,
            accessoriesIncluded: {
              shotId: "hero-01",
              rawText: "Battery"
            },
            condition: null,
            rentalPricePerDay: null,
            rentalTerms: null,
            bundleIncluded: null,
            rating: null,
            reviewCount: null,
            stock: null,
            salePrice: null
          }
        };

        const extractor =
          new Gemini36VisualExtractor({
            apiKey: "test-key",
            fetchFn:
              async () =>
                new Response(
                  JSON.stringify({
                    status: "completed",
                    steps: [
                      {
                        type:
                          "model_output",
                        content: [
                          {
                            type: "text",
                            text:
                              JSON.stringify(
                                rawDecision
                              )
                          }
                        ]
                      }
                    ]
                  }),
                  {
                    status: 200
                  }
                )
          });

        const result: any =
          await extractor.extract({
            pageUrl:
              "https://example.com/camera",
            shots
          });

        expect(
          result.decision?.status
        ).toBe(
          "VALIDATED"
        );

        expect(
          result.decision?.value
        ).toMatchObject({
          productName:
            "Camera X Selected Kit",
          condition: null,
          specs: [],
          accessoriesIncluded: [
            "Battery"
          ],
          rentalPricePerDay: null,
          rentalTerms: null,
          bundleIncluded: null,
          rating: null,
          reviewCount: null,
          stock: null,
          salePrice: null
        });

        expect(
          result.decision
            ?.decision
            ?.evidence
            ?.classification
        ).toEqual([
          {
            shotId: "hero-01",
            rawText:
              "Camera X Selected Kit"
          }
        ]);

        expect(
          result.decision
            ?.decision
            ?.evidence
            ?.condition
        ).toEqual([]);
      }
    );
  }
);
