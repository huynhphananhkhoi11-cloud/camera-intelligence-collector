import {
  describe,
  expect,
  test
} from "vitest";

import {
  Gemini36VisualExtractor,
  GeminiVisualExtractionHttpError
} from "../../../src/v03/ai/gemini36VisualExtractor.js";

const shots = [
  {
    shotId: "hero-01",
    mimeType: "image/png" as const,
    base64: "aGVybw==",
    resolution: "high" as const,
    sectionLabel: "hero"
  },
  {
    shotId: "commerce-02",
    mimeType: "image/png" as const,
    base64: "Y29tbWVyY2U=",
    resolution: "high" as const,
    sectionLabel: "commerce"
  }
];

function semanticPayload(
  overrides: Record<string, unknown> = {}
) {
  return {
    classification: "CAMERA_PRODUCT",
    reviewReason: null,
    row: {
      website: "wrong.example",
      productName: "Canon EOS R50 Body",
      condition: "NEW",
      specs: ["APS-C CMOS 24.2MP"],
      rentalPricePerDay: {
        value: 400000,
        currency: "VND"
      },
      rentalTerms: null,
      accessoriesIncluded: ["Kioxia 64GB"],
      bundleIncluded: null,
      rating: null,
      reviewCount: null,
      stock: null,
      salePrice: {
        value: 15990000,
        currency: "VND"
      },
      url: "https://wrong.example/product"
    },
    evidence: {
      classification: [],
      productName: [
        {
          shotId: "hero-01",
          rawText: "Canon EOS R50 Body"
        }
      ],
      condition: [
        {
          shotId: "hero-01",
          rawText: "Hàng Mới"
        }
      ],
      specs: [
        {
          shotId: "hero-01",
          rawText: "APS-C CMOS 24.2MP"
        }
      ],
      rentalPricePerDay: [
        {
          shotId: "commerce-02",
          rawText: "Thuê một ngày 400.000 đ"
        }
      ],
      rentalTerms: [],
      accessoriesIncluded: [
        {
          shotId: "hero-01",
          rawText: "KIOXIA 64GB"
        }
      ],
      bundleIncluded: [],
      rating: [],
      reviewCount: [],
      stock: [],
      salePrice: [
        {
          shotId: "hero-01",
          rawText: "15.990.000 đ"
        }
      ]
    },
    ...overrides
  };
}

function okResponse(
  payload: unknown
) {
  return new Response(
    JSON.stringify({
      status: "completed",
      model:
        "gemini-3.5-flash-lite",
      steps: [
        {
          type: "model_output",
          content: [
            {
              type: "text",
              text:
                JSON.stringify(
                  payload
                )
            }
          ]
        }
      ],
      usage: {
        total_input_tokens: 2240,
        total_output_tokens: 320,
        total_thought_tokens: 80,
        total_tokens: 2640
      }
    }),
    {
      status: 200,
      headers: {
        "content-type":
          "application/json"
      }
    }
  );
}

describe(
  "Gemini36VisualExtractor AI-owned semantics",
  () => {
    test(
      "sends screenshots in one interaction and returns an authoritative semantic row",
      async () => {
        let calls = 0;
        let body: any = null;

        const extractor =
          new Gemini36VisualExtractor({
            apiKey: "test-key",
            fetchFn:
              async (
                _input,
                init
              ) => {
                calls += 1;
                body =
                  JSON.parse(
                    String(
                      init?.body ??
                      "{}"
                    )
                  );

                return okResponse(
                  semanticPayload()
                );
              }
          });

        const result =
          await extractor.extract({
            pageUrl:
              "https://zshop.vn/camera",
            finalUrl:
              "https://zshop.vn/camera",
            shots
          });

        expect(calls).toBe(1);
        expect(body.model).toBe(
          "gemini-3.5-flash-lite"
        );
        expect(body).not.toHaveProperty(
          "response_format"
        );
        expect(
          body.input.filter(
            (part: any) =>
              part.type ===
              "image"
          )
        ).toHaveLength(2);

        expect(
          result.decision.status
        ).toBe("VALIDATED");

        expect(
          result.decision.value
            ?.website
        ).toBe("zshop.vn");

        expect(
          result.decision.value
            ?.rentalPricePerDay
            ?.value
        ).toBe(400000);

        expect(
          result.extraction
            .salePrice
            ?.value
        ).toBe(15990000);
      }
    );

    test(
      "returns REVIEW without a second AI call for malformed JSON",
      async () => {
        let calls = 0;

        const extractor =
          new Gemini36VisualExtractor({
            apiKey: "test-key",
            fetchFn:
              async () => {
                calls += 1;

                return new Response(
                  JSON.stringify({
                    status:
                      "completed",
                    steps: [
                      {
                        type:
                          "model_output",
                        content: [
                          {
                            type:
                              "text",
                            text:
                              "{not-json"
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

        const result =
          await extractor.extract({
            pageUrl:
              "https://example.com/camera",
            shots
          });

        expect(calls).toBe(1);
        expect(
          result.decision.status
        ).toBe("REVIEW");
        expect(
          result.decision.value
        ).toBeNull();
      }
    );

    test(
      "returns REVIEW when semantic evidence cites an unknown shot",
      async () => {
        const raw: any =
          semanticPayload();

        raw.evidence.productName[0].shotId =
          "unknown-99";

        const extractor =
          new Gemini36VisualExtractor({
            apiKey: "test-key",
            fetchFn:
              async () =>
                okResponse(raw)
          });

        const result =
          await extractor.extract({
            pageUrl:
              "https://example.com/camera",
            shots
          });

        expect(
          result.decision.status
        ).toBe("REVIEW");
      }
    );

    test(
      "surfaces HTTP status and Retry-After without retrying inside the extractor",
      async () => {
        let calls = 0;

        const extractor =
          new Gemini36VisualExtractor({
            apiKey: "test-key",
            fetchFn:
              async () => {
                calls += 1;

                return new Response(
                  "quota exceeded",
                  {
                    status: 429,
                    headers: {
                      "retry-after":
                        "60"
                    }
                  }
                );
              }
          });

        let thrown:
          unknown;

        try {
          await extractor.extract({
            pageUrl:
              "https://example.com/camera",
            shots
          });
        }
        catch (error) {
          thrown = error;
        }

        expect(thrown).toBeInstanceOf(
          GeminiVisualExtractionHttpError
        );

        expect(
          (
            thrown as
              GeminiVisualExtractionHttpError
          ).status
        ).toBe(429);

        expect(calls).toBe(1);
      }
    );
  }
);
