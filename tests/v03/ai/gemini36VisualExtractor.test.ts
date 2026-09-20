import {
  describe,
  expect,
  test
} from "vitest";

import {
  Gemini36VisualExtractor,
  GeminiVisualExtractionContractError,
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
  },
  {
    shotId: "specs-03",
    mimeType: "image/png" as const,
    base64: "c3BlY3M=",
    resolution: "high" as const,
    sectionLabel: "specs"
  },
  {
    shotId: "reviews-04",
    mimeType: "image/jpeg" as const,
    base64: "cmV2aWV3cw==",
    resolution: "medium" as const,
    sectionLabel: "reviews"
  }
];

function extraction(overrides: Record<string, unknown> = {}) {
  return {
    disposition: "CAMERA",
    website: "wrong.example",
    productName: {
      value: "Canon EOS R50",
      rawText: "Canon EOS R50",
      shotId: "hero-01"
    },
    condition: {
      value: "NEW",
      rawText: "Hàng mới chính hãng",
      shotId: "hero-01"
    },
    specs: [
      {
        value: "APS-C CMOS 24.2MP",
        rawText: "Cảm biến APS-C CMOS 24.2MP",
        shotId: "specs-03"
      }
    ],
    rentalPricePerDay: null,
    rentalTerms: null,
    accessoriesIncluded: null,
    bundleIncluded: null,
    rating: {
      value: 4.8,
      rawText: "4.8/5",
      shotId: "reviews-04"
    },
    reviewCount: {
      value: 21,
      rawText: "21 đánh giá",
      shotId: "reviews-04"
    },
    stock: {
      value: "Còn hàng",
      rawText: "Còn hàng",
      shotId: "commerce-02"
    },
    salePrice: {
      value: 15_990_000,
      currency: "VND",
      rawText: "15.990.000đ",
      shotId: "hero-01"
    },
    url: "https://wrong.example/product",
    ...overrides
  };
}

function okResponse(payload: unknown) {
  return new Response(
    JSON.stringify({
      status: "completed",
      model: "gemini-3.6-flash",
      steps: [
        {
          type: "model_output",
          content: [
            {
              type: "text",
              text: JSON.stringify(payload)
            }
          ]
        }
      ],
      usage: {
        total_input_tokens: 2_240,
        total_output_tokens: 320,
        total_thought_tokens: 80,
        total_tokens: 2_640
      }
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    }
  );
}

describe(
  "Gemini36VisualExtractor",
  () => {
    test(
      "sends four screenshots in exactly one Gemini 3.6 Flash interaction",
      async () => {
        let calls = 0;
        let sentBody: any = null;

        const extractor = new Gemini36VisualExtractor({
          apiKey: "test-key",
          fetchFn: async (_input, init) => {
            calls += 1;
            sentBody = JSON.parse(
              String(init?.body ?? "{}")
            );
            return okResponse(extraction());
          }
        });

        const result = await extractor.extract({
          pageUrl:
            "https://zshop.vn/canon-eos-r50-vi.html?variation_id=65130",
          finalUrl:
            "https://zshop.vn/canon-eos-r50-vi.html?variation_id=65130",
          shots
        });

        expect(calls).toBe(1);
        expect(sentBody.model).toBe("gemini-3.6-flash");

        const images = sentBody.input.filter(
          (part: any) => part.type === "image"
        );
        expect(images).toHaveLength(4);
        expect(images[0].resolution).toBe("high");
        expect(images[3].resolution).toBe("medium");

        expect(
          sentBody.response_format.mime_type
        ).toBe("application/json");
        expect(sentBody.store).toBe(false);
        expect(JSON.stringify(sentBody)).toContain("warranty");
        expect(JSON.stringify(sentBody)).toContain("customers-also-buy");

        expect(result.extraction.website).toBe("zshop.vn");
        expect(result.extraction.url).toBe(
          "https://zshop.vn/canon-eos-r50-vi.html?variation_id=65130"
        );
        expect(result.extraction.salePrice?.value).toBe(
          15_990_000
        );
        expect(result.telemetry.inputTokens).toBe(2_240);
        expect(result.telemetry.outputTokens).toBe(320);
        expect(result.telemetry.thoughtTokens).toBe(80);
        expect(result.telemetry.totalTokens).toBe(2_640);
      }
    );

    test(
      "accepts null-by-default for absent optional commerce fields",
      async () => {
        const extractor = new Gemini36VisualExtractor({
          apiKey: "test-key",
          fetchFn: async () => okResponse(
            extraction({
              rentalPricePerDay: null,
              rentalTerms: null,
              accessoriesIncluded: null,
              bundleIncluded: null,
              rating: null,
              reviewCount: null,
              stock: null,
              salePrice: null
            })
          )
        });

        const result = await extractor.extract({
          pageUrl: "https://example.com/camera",
          shots
        });

        expect(
          result.extraction.rentalPricePerDay
        ).toBeNull();
        expect(
          result.extraction.accessoriesIncluded
        ).toBeNull();
        expect(
          result.extraction.bundleIncluded
        ).toBeNull();
        expect(
          result.extraction.reviewCount
        ).toBeNull();
      }
    );

    test(
      "rejects evidence that cites a shotId outside the capture set",
      async () => {
        const extractor = new Gemini36VisualExtractor({
          apiKey: "test-key",
          fetchFn: async () => okResponse(
            extraction({
              productName: {
                value: "Canon EOS R50",
                rawText: "Canon EOS R50",
                shotId: "related-99"
              }
            })
          )
        });

        await expect(
          extractor.extract({
            pageUrl: "https://example.com/camera",
            shots
          })
        ).rejects.toBeInstanceOf(
          GeminiVisualExtractionContractError
        );
      }
    );

    test(
      "does not issue a second semantic request for malformed JSON",
      async () => {
        let calls = 0;

        const extractor = new Gemini36VisualExtractor({
          apiKey: "test-key",
          fetchFn: async () => {
            calls += 1;
            return new Response(
              JSON.stringify({
                status: "completed",
                steps: [
                  {
                    type: "model_output",
                    content: [
                      {
                        type: "text",
                        text: "{not-json"
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

        await expect(
          extractor.extract({
            pageUrl: "https://example.com/camera",
            shots
          })
        ).rejects.toBeInstanceOf(
          GeminiVisualExtractionContractError
        );

        expect(calls).toBe(1);
      }
    );

    test(
      "surfaces HTTP status and Retry-After without retrying",
      async () => {
        let calls = 0;

        const extractor = new Gemini36VisualExtractor({
          apiKey: "test-key",
          fetchFn: async () => {
            calls += 1;
            return new Response(
              "quota exceeded",
              {
                status: 429,
                headers: {
                  "retry-after": "60"
                }
              }
            );
          }
        });

        let thrown: unknown;
        try {
          await extractor.extract({
            pageUrl: "https://example.com/camera",
            shots
          });
        } catch (error) {
          thrown = error;
        }

        expect(thrown).toBeInstanceOf(
          GeminiVisualExtractionHttpError
        );
        expect(
          (thrown as GeminiVisualExtractionHttpError).status
        ).toBe(429);
        expect(
          (thrown as GeminiVisualExtractionHttpError).retryAfter
        ).toBe("60");
        expect(calls).toBe(1);
      }
    );
  }
);
