import {
  describe,
  expect,
  test
} from "vitest";

import {
  validateVisualDecision
} from "../../../src/v04/validation/structuralValidator.js";

function minimalCameraRow() {
  return {
    website: "shop.test",
    productName: "Camera X",
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
    url: "https://shop.test/x"
  } as const;
}

describe("V04 structural validator", () => {
  test("validates CAMERA_PRODUCT when optional semantic fields are null", () => {
    const result = validateVisualDecision({
      classification: "CAMERA_PRODUCT",
      row: minimalCameraRow()
    });

    expect(result.status).toBe("VALIDATED");
    expect(result.row).toEqual(minimalCameraRow());
  });

  test("reviews CAMERA_PRODUCT with row null", () => {
    expect(
      validateVisualDecision({
        classification: "CAMERA_PRODUCT",
        row: null
      })
    ).toEqual({
      status: "REVIEW",
      row: null
    });
  });

  test("reviews structurally malformed CAMERA_PRODUCT rows", () => {
    const malformed = {
      ...minimalCameraRow(),
      specs: "24 MP"
    };

    expect(
      validateVisualDecision({
        classification: "CAMERA_PRODUCT",
        row: malformed
      })
    ).toEqual({
      status: "REVIEW",
      row: null
    });
  });

  test("skips NON_CAMERA without requiring a camera row", () => {
    expect(
      validateVisualDecision({
        classification: "NON_CAMERA",
        row: null
      })
    ).toEqual({
      status: "SKIPPED_NON_CAMERA",
      row: null
    });
  });

  test("keeps REVIEW as REVIEW", () => {
    expect(
      validateVisualDecision({
        classification: "REVIEW",
        row: minimalCameraRow()
      })
    ).toEqual({
      status: "REVIEW",
      row: minimalCameraRow()
    });
  });

  test("does not apply semantic range or completeness checks", () => {
    const structurallyValidButSemanticallyOdd = {
      ...minimalCameraRow(),
      productName: null,
      rating: 99,
      reviewCount: 1.5,
      stock: "",
      rentalPricePerDay: {
        value: -100,
        currency: "VND"
      },
      accessoriesIncluded: [
        "Warranty policy"
      ]
    };

    expect(
      validateVisualDecision({
        classification: "CAMERA_PRODUCT",
        row: structurallyValidButSemanticallyOdd
      }).status
    ).toBe("VALIDATED");
  });
});
