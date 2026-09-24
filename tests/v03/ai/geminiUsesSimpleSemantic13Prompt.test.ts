import {
  describe,
  expect,
  test
} from "vitest";

import {
  Gemini36VisualExtractor
} from "../../../src/v03/ai/gemini36VisualExtractor.js";

function reviewDecision() {
  return {
    classification: "REVIEW",
    reviewReason: "test",
    row: null,
    evidence: {
      classification: [],
      productName: [],
      condition: [],
      specs: [],
      rentalPricePerDay: [],
      rentalTerms: [],
      accessoriesIncluded: [],
      bundleIncluded: [],
      rating: [],
      reviewCount: [],
      stock: [],
      salePrice: []
    }
  };
}

describe(
  "Gemini36VisualExtractor minimal semantic prompt integration",
  () => {
    test(
      "sends the dedicated minimal 13-column prompt",
      async () => {
        let body: any = null;

        const extractor =
          new Gemini36VisualExtractor({
            apiKey: "test-key",
            fetchFn:
              async (
                _input,
                init
              ) => {
                body =
                  JSON.parse(
                    String(
                      init?.body ??
                      "{}"
                    )
                  );

                return new Response(
                  JSON.stringify({
                    status: "completed",
                    steps: [
                      {
                        type:
                          "model_output",
                        content: [
                          {
                            type:
                              "text",
                            text:
                              JSON.stringify(
                                reviewDecision()
                              )
                          }
                        ]
                      }
                    ]
                  }),
                  {
                    status: 200
                  }
                );
              }
          });

        await extractor.extract({
          pageUrl:
            "https://example.com/camera",
          shots: [
            {
              shotId:
                "hero-01",
              mimeType:
                "image/png",
              base64:
                "aGVybw==",
              resolution:
                "high",
              sectionLabel:
                "hero"
            }
          ]
        });

        const prompt =
          body.input
            .filter(
              (part: any) =>
                part.type ===
                "text"
            )
            .map(
              (part: any) =>
                String(
                  part.text ??
                  ""
                )
            )
            .join("\n");

        expect(prompt).toContain(
          "Use your own visual and language understanding"
        );

        expect(prompt).toContain(
          "Tồn kho -> stock"
        );

        expect(prompt).not.toContain(
          "field-by-field completeness and exclusivity audit"
        );
      }
    );
  }
);
