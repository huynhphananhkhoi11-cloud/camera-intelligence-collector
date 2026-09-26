import {
  describe,
  expect,
  test
} from "vitest";

import {
  validateSemanticDecision
} from "../../../src/v03/ai/semanticDecisionSchema.js";

const context = {
  website: "zshop.vn",
  url: "https://zshop.vn/camera",
  shotIds: new Set(["hero-01", "commerce-02"])
};

function cameraDecision() {
  return {
    classification: "CAMERA_PRODUCT",
    reviewReason: null,
    row: {
      website: "wrong.example",
      productName: "Canon EOS R50 Body Only",
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
          rawText: "Canon EOS R50 (Body Only)"
        }
      ],
      condition: [
        {
          shotId: "hero-01",
          rawText: "Hàng Mới Chính Hãng"
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
          rawText: "Thuê 1 Ngày (+400,000 đ)"
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
          rawText: "15,990,000 đ"
        }
      ]
    }
  };
}

describe(
  "AI semantic decision contract",
  () => {
    test(
      "accepts a camera row and replaces website/url with authoritative context",
      () => {
        const result =
          validateSemanticDecision(
            cameraDecision(),
            context
          );

        expect(result.status).toBe("VALIDATED");
        expect(result.value?.website).toBe("zshop.vn");
        expect(result.value?.url).toBe(
          "https://zshop.vn/camera"
        );
        expect(
          result.value?.rentalPricePerDay?.value
        ).toBe(400000);
      }
    );

    test(
      "moves a populated field without evidence to REVIEW rather than repairing semantics",
      () => {
        const raw = cameraDecision();
        raw.evidence.accessoriesIncluded = [];

        const result =
          validateSemanticDecision(
            raw,
            context
          );

        expect(result.status).toBe("REVIEW");
        expect(result.value).toBeNull();
        expect(
          result.issues[0]?.code
        ).toBe("SEMANTIC_EVIDENCE_REQUIRED");
      }
    );

    test(
      "moves unknown shot evidence to REVIEW",
      () => {
        const raw = cameraDecision();
        raw.evidence.productName[0]!.shotId =
          "unknown-99";

        const result =
          validateSemanticDecision(
            raw,
            context
          );

        expect(result.status).toBe("REVIEW");
        expect(
          result.issues[0]?.code
        ).toBe("SEMANTIC_EVIDENCE_UNKNOWN_SHOT");
      }
    );

    test(
      "rejects quoted money instead of coercing it",
      () => {
        const raw: any = cameraDecision();
        raw.row.salePrice.value = "15990000";

        const result =
          validateSemanticDecision(
            raw,
            context
          );

        expect(result.status).toBe("REVIEW");
        expect(result.value).toBeNull();
      }
    );

    test(
      "accepts an evidenced NON_CAMERA decision without creating a row",
      () => {
        const result =
          validateSemanticDecision(
            {
              classification: "NON_CAMERA",
              reviewReason: null,
              row: null,
              evidence: {
                classification: [
                  {
                    shotId: "hero-01",
                    rawText: "RF 50mm F1.8 STM"
                  }
                ],
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
            },
            context
          );

        expect(result.status).toBe("REVIEW");
        expect(
          result.decision.classification
        ).toBe("NON_CAMERA");
        expect(result.value).toBeNull();
      }
    );
  }
);
