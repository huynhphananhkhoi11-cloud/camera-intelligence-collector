import {
  describe,
  expect,
  it
} from "vitest";

import {
  normalizeEntityConsistency
} from "../../../src/v03/ai/entityConsistency.js";

import type {
  AISemanticDecision
} from "../../../src/v03/ai/semanticContracts.js";


function decision(
  productName:
    string,
  subtype:
    string
): AISemanticDecision {

  return {
    entity: {
      type:
        "CAMERA",

      subtype,

      confidence:
        0.99,

      evidenceIds: [
        "ev_title"
      ]
    },

    productName: {
      value:
        productName,

      evidenceIds: [
        "ev_title"
      ],

      confidence:
        0.99
    },

    currentPrice:
      null,

    oldPrice:
      null,

    giftValues:
      [],

    savingValues:
      [],

    installmentAmounts:
      [],

    variants:
      [],

    condition:
      null,

    availableConditions:
      [],

    stock:
      null,

    rating:
      null,

    reviewCount:
      null,

    specs:
      [],

    conflicts:
      [],

    pageConfidence:
      0.99
  };
}


describe(
  "entity consistency",
  () => {

    it(
      "normalizes standalone Sony FE 50mm lens away from CAMERA",
      () => {

        const result =
          normalizeEntityConsistency(
            decision(
              "Sony FE 50mm f/1.8",
              "CAMERA"
            )
          );


        expect(
          result.entity.type
        ).toBe(
          "NON_CAMERA"
        );


        expect(
          result.entity.subtype
        ).toBe(
          "LENS"
        );
      }
    );


    it(
      "keeps a camera kit even when the product name contains lens and focal length",
      () => {

        const result =
          normalizeEntityConsistency(
            decision(
              "Canon EOS R50 + Lens 18-45mm Kit",
              "MIRRORLESS"
            )
          );


        expect(
          result.entity.type
        ).toBe(
          "CAMERA"
        );
      }
    );


    it(
      "normalizes explicit LENS subtype even when product title omits the word lens",
      () => {

        const result =
          normalizeEntityConsistency(
            decision(
              "Sony FE 50mm F1.8",
              "LENS"
            )
          );


        expect(
          result.entity.type
        ).toBe(
          "NON_CAMERA"
        );
      }
    );
  }
);
