import {
  describe,
  expect,
  test
} from "vitest";

import {
  buildEvidencePacket
} from "../../../src/v03/ai/evidencePacket.js";

import {
  validateSemanticDecision
} from "../../../src/v03/ai/groundingValidator.js";

import type {
  AISemanticDecision
} from "../../../src/v03/ai/semanticContracts.js";

import type {
  ProductObservation
} from "../../../src/v03/observations/observationTypes.js";


function observation(
  field:
    ProductObservation["field"],
  rawValue:
    string
): ProductObservation {

  return {
    productIdentity:
      "URL:https://example.com/canon-r50",
    field,
    rawValue,
    sourceKind:
      "VISIBLE_TEXT",
    sourceUrl:
      "https://example.com/canon-r50",
    locator:
      "test"
  };
}


function packet() {

  return buildEvidencePacket({
    pageUrl:
      "https://example.com/canon-r50",

    finalUrl:
      "https://example.com/canon-r50",

    observations: [
      observation(
        "PRODUCT_NAME",
        "Canon EOS R50"
      ),
      observation(
        "PRICE",
        "15.990.000đ"
      ),
      observation(
        "PRICE",
        "18.990.000đ"
      ),
      observation(
        "AVAILABILITY",
        "Còn hàng"
      )
    ],

    primaryRegionText:
      "Canon EOS R50 15.990.000đ",

    controls:
      []
  });
}


function decision(
  currentPrice:
    number
): AISemanticDecision {

  return {
    entity: {
      type:
        "CAMERA",
      subtype:
        "CAMERA",
      confidence:
        0.95,
      evidenceIds: [
        "ev_0001"
      ]
    },

    productName: {
      value:
        "Canon EOS R50",
      evidenceIds: [
        "ev_0001"
      ],
      confidence:
        0.98
    },

    currentPrice: {
      value:
        currentPrice,
      currency:
        "VND",
      evidenceIds: [
        "ev_0002"
      ],
      confidence:
        0.96
    },

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

    stock: {
      state:
        "IN_STOCK",
      quantity:
        null,
      evidenceIds: [
        "ev_0004"
      ],
      confidence:
        0.9
    },

    rating:
      null,

    reviewCount:
      null,

    specs:
      [],

    conflicts:
      [],

    pageConfidence:
      0.95
  };
}


describe(
  "AI grounding validator",
  () => {

    test(
      "accepts a VND value that is present in cited evidence",
      () => {

        const result =
          validateSemanticDecision(
            packet(),
            decision(
              15_990_000
            )
          );


        expect(
          result.status
        ).toBe(
          "VALIDATED"
        );
      }
    );


    test(
      "rejects an invented numeric price even when the evidence id exists",
      () => {

        const result =
          validateSemanticDecision(
            packet(),
            decision(
              35_480_000
            )
          );


        expect(
          result.status
        ).toBe(
          "UNSUPPORTED_AI_VALUE"
        );


        expect(
          result.issues.some(
            issue =>
              issue.code ===
                "UNSUPPORTED_NUMERIC_VALUE"
          )
        ).toBe(
          true
        );
      }
    );
  }
);
