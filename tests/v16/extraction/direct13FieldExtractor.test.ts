import { describe, expect, it } from "vitest";

import {
  DIRECT_13_COLUMNS,
  extractDirect13Fields,
  type Direct13ExtractionInput,
} from "../../../src/v16/extraction/direct13FieldExtractor.js";

function complete(input: Direct13ExtractionInput) {
  const result = extractDirect13Fields(input);
  expect(result.outcome).toBe("DIRECT_COMPLETE_ENOUGH");
  if (result.outcome !== "DIRECT_COMPLETE_ENOUGH") {
    throw new Error("expected direct row");
  }
  return result;
}

const base = {
  website: "example.test",
  url: "https://example.test/cameras/canon-eos-r6-ii",
} as const;

describe("extractDirect13Fields", () => {
  it("maps JSON-LD name, offers, availability and aggregate rating", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "JSON_LD",
        sourceUrl: base.url,
        payload: {
          "@context": "https://schema.org",
          "@type": "Product",
          name: "Canon EOS R6 Mark II",
          itemCondition: "https://schema.org/NewCondition",
          offers: {
            "@type": "Offer",
            price: "42990000",
            priceCurrency: "VND",
            availability: "https://schema.org/InStock",
          },
          aggregateRating: {
            ratingValue: "4.8",
            reviewCount: "125",
          },
        },
      }],
    });

    expect(result.row.productName).toBe("Canon EOS R6 Mark II");
    expect(result.row.condition).toBe("NEW");
    expect(result.row.salePrice).toEqual({ value: 42990000, currency: "VND" });
    expect(result.row.stock).toBe("InStock");
    expect(result.row.rating).toBe(4.8);
    expect(result.row.reviewCount).toBe(125);
  });

  it("maps nested network product JSON facts", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "PRODUCT_JSON",
        sourceUrl: "https://example.test/api/catalog/42",
        payload: {
          ok: true,
          data: {
            product: {
              productName: "Sony Alpha 7 IV",
              currentPrice: { amount: 51990000, currency: "VND" },
              stockStatus: "AVAILABLE",
              specifications: {
                Sensor: "33 MP",
                Mount: "Sony E",
              },
            },
          },
        },
      }],
    });

    expect(result.row.productName).toBe("Sony Alpha 7 IV");
    expect(result.row.salePrice).toEqual({ value: 51990000, currency: "VND" });
    expect(result.row.stock).toBe("AVAILABLE");
    expect(result.row.specs).toEqual(["Sensor: 33 MP", "Mount: Sony E"]);
  });

  it("maps embedded application state explicit rental and inclusion facts", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "EMBEDDED_STATE",
        sourceUrl: base.url,
        jsonPath: "$.__APP_STATE__",
        payload: {
          page: {
            product: {
              productName: "Fujifilm X-T5",
              condition: "used",
              dailyRentalPrice: { value: "900000", currency: "VND" },
              rentalTerms: "Deposit required",
              includedAccessories: ["Battery", "Charger"],
              bundleItems: ["Camera body", "18-55mm lens"],
              attributes: [
                { name: "Sensor", value: "40.2 MP" },
                { name: "Mount", value: "Fujifilm X" },
              ],
            },
          },
        },
      }],
    });

    expect(result.row.condition).toBe("USED");
    expect(result.row.rentalPricePerDay).toEqual({ value: 900000, currency: "VND" });
    expect(result.row.rentalTerms).toBe("Deposit required");
    expect(result.row.accessoriesIncluded).toEqual(["Battery", "Charger"]);
    expect(result.row.bundleIncluded).toEqual(["Camera body", "18-55mm lens"]);
    expect(result.row.specs).toEqual(["Sensor: 40.2 MP", "Mount: Fujifilm X"]);
  });

  it("maps rendered DOM factual bag without promotional inference", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "DOM",
        sourceUrl: base.url,
        locator: "main [data-product-detail]",
        payload: {
          productName: "Nikon Z6 III",
          salePrice: "24.990.000 ₫",
          rating: "4.7/5",
          reviewCount: "1.234 reviews",
          stock: "Còn hàng",
          specs: ["Sensor: 24.5 MP"],
          promotionText: "Giảm sốc hôm nay - tiết kiệm 20%",
        },
      }],
    });

    expect(result.row.salePrice).toEqual({ value: 24990000, currency: "VND" });
    expect(result.row.rating).toBe(4.7);
    expect(result.row.reviewCount).toBe(1234);
    expect(result.row.stock).toBe("Còn hàng");
    expect(result.row.specs).toEqual(["Sensor: 24.5 MP"]);
  });

  it("keeps missing optional values null or blank-compatible", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "JSON_LD",
        sourceUrl: base.url,
        payload: {
          "@type": "Product",
          name: "Panasonic Lumix S5 II",
        },
      }],
    });

    expect(result.row.condition).toBeNull();
    expect(result.row.specs).toEqual([]);
    expect(result.row.rentalPricePerDay).toBeNull();
    expect(result.row.rentalTerms).toBeNull();
    expect(result.row.accessoriesIncluded).toBeNull();
    expect(result.row.bundleIncluded).toBeNull();
    expect(result.row.rating).toBeNull();
    expect(result.row.reviewCount).toBeNull();
    expect(result.row.stock).toBeNull();
    expect(result.row.salePrice).toBeNull();
  });

  it("prefers explicit structured price over promotional DOM price regardless of input order", () => {
    const result = complete({
      ...base,
      evidence: [
        {
          sourceKind: "DOM",
          sourceUrl: base.url,
          locator: ".promo",
          payload: {
            productName: "Canon EOS R8",
            salePrice: "19.990.000 ₫",
          },
        },
        {
          sourceKind: "JSON_LD",
          sourceUrl: base.url,
          payload: {
            "@type": "Product",
            name: "Canon EOS R8",
            offers: { price: 20990000, priceCurrency: "VND" },
          },
        },
      ],
    });

    expect(result.row.salePrice).toEqual({ value: 20990000, currency: "VND" });
    expect(result.provenance.salePrice?.sourceKind).toBe("JSON_LD");
  });

  it("returns exactly the frozen 13 columns in exact order", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "PRODUCT_JSON",
        sourceUrl: "https://example.test/api/product/1",
        payload: { productName: "Leica Q3" },
      }],
    });

    expect(Object.keys(result.row)).toEqual([...DIRECT_13_COLUMNS]);
    expect([...DIRECT_13_COLUMNS]).toEqual([
      "website",
      "productName",
      "condition",
      "specs",
      "rentalPricePerDay",
      "rentalTerms",
      "accessoriesIncluded",
      "bundleIncluded",
      "rating",
      "reviewCount",
      "stock",
      "salePrice",
      "url",
    ]);
  });

  it("attaches source URL and JSON path provenance to populated fields", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "JSON_LD",
        sourceUrl: "https://example.test/p/9",
        jsonPath: "$.scripts[2]",
        payload: {
          "@type": "Product",
          name: "OM SYSTEM OM-1 Mark II",
          offers: { price: "39990000", priceCurrency: "VND" },
        },
      }],
    });

    expect(result.provenance.productName?.sourceKind).toBe("JSON_LD");
    expect(result.provenance.productName?.sourceUrl).toBe("https://example.test/p/9");
    expect(result.provenance.productName?.jsonPath).toBe("$.scripts[2].name");
    expect(result.provenance.salePrice?.jsonPath).toBe("$.scripts[2].offers.price");
  });

  it("returns DIRECT_UNUSABLE when identity is insufficient", () => {
    const result = extractDirect13Fields({
      ...base,
      evidence: [{
        sourceKind: "JSON_LD",
        sourceUrl: base.url,
        payload: {
          "@type": "Offer",
          price: "9990000",
          priceCurrency: "VND",
        },
      }],
    });

    expect(result.outcome).toBe("DIRECT_UNUSABLE");
    expect(result.row).toBeNull();
  });

  it("direct success requires no Gemini or screenshot dependency", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "PRODUCT_JSON",
        sourceUrl: "https://example.test/api/product/2",
        payload: { productName: "Ricoh GR III" },
      }],
    });

    expect(result.row.productName).toBe("Ricoh GR III");
  });

  it("returns NON_CAMERA_EVIDENCE_CONFLICT for DEV3/DEV0 review", () => {
    const result = extractDirect13Fields({
      ...base,
      cameraScopeConflict: true,
      evidence: [{
        sourceKind: "PRODUCT_JSON",
        sourceUrl: "https://example.test/api/product/3",
        payload: { productName: "Explicit conflicting product" },
      }],
    });

    expect(result.outcome).toBe("NON_CAMERA_EVIDENCE_CONFLICT");
    expect(result.row).toBeNull();
  });

  it("lets lower-precedence evidence fill only fields absent from stronger evidence", () => {
    const result = complete({
      ...base,
      evidence: [
        {
          sourceKind: "JSON_LD",
          sourceUrl: base.url,
          payload: { "@type": "Product", name: "Canon EOS R5 Mark II" },
        },
        {
          sourceKind: "DOM",
          sourceUrl: base.url,
          locator: "main",
          payload: {
            productName: "DOM title should not override",
            stock: "Available for order",
          },
        },
      ],
    });

    expect(result.row.productName).toBe("Canon EOS R5 Mark II");
    expect(result.row.stock).toBe("Available for order");
    expect(result.provenance.productName?.sourceKind).toBe("JSON_LD");
    expect(result.provenance.stock?.sourceKind).toBe("DOM");
  });

  it("does not accept a generic embedded page title as safe product identity", () => {
    const result = extractDirect13Fields({
      ...base,
      evidence: [{
        sourceKind: "EMBEDDED_STATE",
        sourceUrl: base.url,
        jsonPath: "$.__APP_STATE__",
        payload: {
          title: "Summer Sale",
          promotionText: "Camera deals this week",
        },
      }],
    });

    expect(result.outcome).toBe("DIRECT_UNUSABLE");
    expect(result.row).toBeNull();
  });

  it("leaves abbreviated review count blank rather than mis-normalizing it", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "DOM",
        sourceUrl: base.url,
        locator: "main",
        payload: {
          productName: "Canon EOS R50",
          reviewCount: "1.2K reviews",
        },
      }],
    });

    expect(result.row.reviewCount).toBeNull();
  });

  it("normalizes Vietnamese dong letter suffix as explicit VND currency", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "DOM",
        sourceUrl: base.url,
        locator: "main",
        payload: {
          productName: "Nikon Zf",
          salePrice: "39.990.000 đ",
        },
      }],
    });

    expect(result.row.salePrice).toEqual({ value: 39990000, currency: "VND" });
  });

  it("never converts marketing description into sale price or bundle facts", () => {
    const result = complete({
      ...base,
      evidence: [{
        sourceKind: "DOM",
        sourceUrl: base.url,
        locator: "main",
        payload: {
          productName: "Sony ZV-E10 II",
          description: "Mua hôm nay chỉ 9.999.000đ và nhận quà hấp dẫn",
          promotionText: "Tặng pin khi mua kèm lens",
        },
      }],
    });

    expect(result.row.salePrice).toBeNull();
    expect(result.row.bundleIncluded).toBeNull();
    expect(result.row.accessoriesIncluded).toBeNull();
  });
});
