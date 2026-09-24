import { describe, expect, test } from "vitest";

import {
  MINIMAL_VISUAL_DECISION_PROVIDER_SCHEMA,
  MinimalVisualDecisionSchema
} from "../../../src/v04/contracts/minimalVisualDecision.js";


function collectDescriptions(value: unknown, output: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectDescriptions(item, output);
    return output;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "description" && typeof item === "string") output.push(item);
      collectDescriptions(item, output);
    }
  }

  return output;
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

describe("V04 minimal visual decision contract", () => {
  test("accepts the frozen 13-field camera row with optional semantic nulls", () => {
    const parsed = MinimalVisualDecisionSchema.parse({
      classification: "CAMERA_PRODUCT",
      row: {
        website: "shop.example",
        productName: null,
        condition: null,
        specs: [],
        rentalPricePerDay: null,
        rentalTerms: null,
        accessoriesIncluded: null,
        bundleIncluded: null,
        rating: 99,
        reviewCount: 1.5,
        stock: "",
        salePrice: { value: -100, currency: "VND" },
        url: "https://shop.example/item"
      }
    });

    expect(parsed.classification).toBe("CAMERA_PRODUCT");
    expect(parsed.row?.specs).toEqual([]);
    expect(parsed.row?.salePrice).toEqual({ value: -100, currency: "VND" });
  });

  test("accepts NON_CAMERA with row null", () => {
    expect(
      MinimalVisualDecisionSchema.parse({
        classification: "NON_CAMERA",
        row: null
      })
    ).toEqual({ classification: "NON_CAMERA", row: null });
  });



  test("describes the rental field split directly in the provider JSON schema", () => {
    const descriptions = collectDescriptions(MINIMAL_VISUAL_DECISION_PROVIDER_SCHEMA).join("\n");

    expect(descriptions).toContain(
      "explicit one-day or per-day rental amount is visibly supported"
    );
    expect(descriptions).toContain(
      "not a substitute for rentalPricePerDay"
    );
    expect(descriptions).toContain(
      "do not place the one-day/per-day price only here"
    );
  });

  test("exports a Gemini-safe schema without unsupported JSON Schema keywords", () => {
    const forbidden = [
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

    const keys = collectKeys(MINIMAL_VISUAL_DECISION_PROVIDER_SCHEMA);
    for (const key of forbidden) expect(keys).not.toContain(key);
  });
});
