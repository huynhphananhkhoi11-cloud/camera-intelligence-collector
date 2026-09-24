import { describe, expect, test } from "vitest";

import { MINIMAL_VISUAL_DECISION_PROVIDER_SCHEMA } from "../../../src/v04/contracts/minimalVisualDecision.js";
import {
  GeminiVisualExtractor,
  GeminiVisualExtractionContractError,
  type GeminiVisualProviderRequest
} from "../../../src/v04/ai/geminiVisualExtractor.js";

const input = {
  pageUrl: "https://shop.example/listing?id=1",
  finalUrl: "https://shop.example/cameras/camera-1",
  website: "shop.example",
  screenshots: [
    { role: "hero" as const, bytes: Buffer.from("hero") },
    { role: "viewport" as const, bytes: Buffer.from("viewport") },
    { role: "interaction" as const, bytes: Buffer.from("interaction") }
  ]
};

function minimalRow(overrides: Record<string, unknown> = {}) {
  return {
    website: "model.invalid",
    productName: null,
    condition: null,
    specs: [],
    rentalPricePerDay: null,
    rentalTerms: null,
    accessoriesIncluded: null,
    bundleIncluded: null,
    rating: null,
    reviewCount: null,
    stock: null,
    salePrice: null,
    url: "https://model.invalid/item",
    ...overrides
  };
}

function collectKeys(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, output);
    return output;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output.push(key);
      collectKeys(item, output);
    }
  }

  return output;
}

describe("GeminiVisualExtractor", () => {
  test("provider request contract accepts medium thinking while extractor default remains low", () => {
    const request: GeminiVisualProviderRequest = {
      model: "gemini-3.5-flash-lite",
      input: [],
      system_instruction: "test",
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: {}
      },
      generation_config: {
        thinking_level: "medium",
        temperature: 0.1,
        max_output_tokens: 4_096
      },
      store: false
    };

    expect(request.generation_config.thinking_level).toBe("medium");
  });

  test("defaults every semantic request to Gemini 3.5 Flash-Lite", async () => {
    const requests: GeminiVisualProviderRequest[] = [];

    const extractor = new GeminiVisualExtractor({
      provider: async request => {
        requests.push(request);

        return {
          model: request.model,
          text: JSON.stringify({
            classification: "CAMERA_PRODUCT",
            row: minimalRow()
          })
        };
      }
    });

    await extractor.extract(input);

    expect(requests).toHaveLength(1);
    expect(requests[0]?.model).toBe("gemini-3.5-flash-lite");
  });

  test("sends all screenshots in exactly one provider request using the provider-safe schema", async () => {
    let calls = 0;
    const requests: GeminiVisualProviderRequest[] = [];

    const extractor = new GeminiVisualExtractor({
      provider: async value => {
        calls += 1;
        requests.push(value);
        return {
          model: "gemini-test",
          text: JSON.stringify({
            classification: "CAMERA_PRODUCT",
            row: minimalRow()
          })
        };
      }
    });

    await extractor.extract(input);

    expect(calls).toBe(1);
    const request = requests[0]!;
    expect(request.response_format.schema).toEqual(
      MINIMAL_VISUAL_DECISION_PROVIDER_SCHEMA
    );

    const images = request.input.filter(part => part.type === "image");
    expect(images).toHaveLength(input.screenshots.length);

    const forbiddenSchemaKeywords = [
      "$schema",
      "minLength",
      "maxLength",
      "pattern",
      "exclusiveMinimum",
      "exclusiveMaximum",
      "multipleOf",
      "uniqueItems",
      "const",
      "examples",
      "default",
      "contentEncoding",
      "contentMediaType"
    ];

    const keys = collectKeys(request.response_format.schema);
    for (const keyword of forbiddenSchemaKeywords) {
      expect(keys).not.toContain(keyword);
    }
  });

  test("accepts null and empty values for visually missing optional semantic fields", async () => {
    const extractor = new GeminiVisualExtractor({
      provider: async () => ({
        model: "gemini-test",
        text: JSON.stringify({
          classification: "CAMERA_PRODUCT",
          row: minimalRow()
        })
      })
    });

    const result = await extractor.extract(input);

    expect(result.extraction.row?.productName).toBeNull();
    expect(result.extraction.row?.condition).toBeNull();
    expect(result.extraction.row?.specs).toEqual([]);
    expect(result.extraction.row?.salePrice).toBeNull();
  });

  test("overwrites only authoritative website and url after schema validation", async () => {
    const semanticRow = minimalRow({
      productName: "Camera Kit",
      condition: "USED",
      specs: ["24 MP", "4K video"],
      rentalPricePerDay: { value: 250000, currency: "VND" },
      rentalTerms: "Deposit required",
      accessoriesIncluded: ["Battery", "Charger"],
      bundleIncluded: ["18-55mm lens"],
      rating: 4.7,
      reviewCount: 42,
      stock: "2 units",
      salePrice: { value: 12990000, currency: "VND" }
    });

    const extractor = new GeminiVisualExtractor({
      provider: async () => ({
        model: "gemini-test",
        text: JSON.stringify({
          classification: "CAMERA_PRODUCT",
          row: semanticRow
        })
      })
    });

    const result = await extractor.extract(input);

    expect(result.extraction).toEqual({
      classification: "CAMERA_PRODUCT",
      row: {
        ...semanticRow,
        website: input.website,
        url: input.finalUrl
      }
    });
  });

  test("does not make a semantic second pass when provider text is invalid JSON", async () => {
    let calls = 0;

    const extractor = new GeminiVisualExtractor({
      provider: async () => {
        calls += 1;
        return {
          model: "gemini-test",
          text: "{not-json"
        };
      }
    });

    let thrown: unknown;
    try {
      await extractor.extract(input);
    } catch (error) {
      thrown = error;
    }

    expect(thrown instanceof GeminiVisualExtractionContractError).toBe(true);
    expect(calls).toBe(1);
  });
});
