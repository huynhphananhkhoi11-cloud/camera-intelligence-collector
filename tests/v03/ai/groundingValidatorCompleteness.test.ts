import {
  describe,
  expect,
  it
} from "vitest";

import {
  validateSemanticDecision
} from "../../../src/v03/ai/groundingValidator.js";

import type {
  EvidenceItem,
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";

import type {
  AISemanticDecision
} from "../../../src/v03/ai/semanticContracts.js";


function evidence(
  values:
    Partial<EvidenceItem> &
    Pick<
      EvidenceItem,
      "id" |
      "fieldHint" |
      "rawValue" |
      "sourceKind" |
      "sourceUrl"
    >
): EvidenceItem {

  return {
    locator:
      null,

    context:
      null,

    ownershipHint:
      "UNKNOWN",

    ...values
  };
}


function decision(
  entityEvidenceId:
    string,
  productEvidenceId:
    string
): AISemanticDecision {

  return {
    entity: {
      type:
        "CAMERA",

      subtype:
        "Mirrorless Camera",

      confidence:
        0.99,

      evidenceIds: [
        entityEvidenceId
      ]
    },

    productName: {
      value:
        "Canon EOS R50",

      evidenceIds: [
        productEvidenceId
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


function packetWithStock(
  stock:
    EvidenceItem
): EvidencePacket {

  const title =
    evidence({
      id:
        "ev_title",

      fieldHint:
        "PRODUCT_NAME",

      rawValue:
        "Canon EOS R50",

      sourceKind:
        "VISIBLE_TEXT",

      sourceUrl:
        "https://example.test/r50",

      ownershipHint:
        "PRIMARY_PRODUCT"
    });


  return {
    packetId:
      "packet_stock_test",

    pageUrl:
      "https://example.test/r50",

    finalUrl:
      "https://example.test/r50",

    productIdentity:
      "Canon EOS R50",

    primaryRegionText:
      "Canon EOS R50",

    allEvidence: [
      title,
      stock
    ],

    titleCandidates:
      [title],

    breadcrumbs:
      [],

    moneyCandidates:
      [],

    conditionCandidates:
      [],

    stockCandidates:
      [stock],

    ratingCandidates:
      [],

    reviewCandidates:
      [],

    specCandidates:
      [],

    variantCandidates:
      [],

    selectedControls:
      [],

    structuredFacts:
      stock.sourceKind ===
        "JSON_LD"
          ? [stock]
          : []
  };
}


describe(
  "grounding validator completeness",
  () => {

    it(
      "requires review when strong visible primary stock evidence exists but stock is null",
      () => {

        const stock =
          evidence({
            id:
              "ev_stock_visible",

            fieldHint:
              "AVAILABILITY",

            rawValue:
              "http://schema.org/InStock",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            locator:
              "visible-availability[0]",

            context:
              "Primary-product scoped visible availability",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const packet =
          packetWithStock(
            stock
          );


        const result =
          validateSemanticDecision(
            packet,
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.status
        ).toBe(
          "NEEDS_REVIEW"
        );


        expect(
          result.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                "STOCK_UNRESOLVED",

              field:
                "stock"
            })
          ])
        );
      }
    );


    it(
      "requires review when structured primary stock evidence exists but stock is null",
      () => {

        const stock =
          evidence({
            id:
              "ev_stock_jsonld",

            fieldHint:
              "AVAILABILITY",

            rawValue:
              "InStock",

            sourceKind:
              "JSON_LD",

            sourceUrl:
              "https://example.test/r50",

            locator:
              "Product.offers[0].availability",

            context:
              "Structured primary Product availability",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const packet =
          packetWithStock(
            stock
          );


        const result =
          validateSemanticDecision(
            packet,
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.status
        ).toBe(
          "NEEDS_REVIEW"
        );


        expect(
          result.issues.some(
            issue =>
              issue.code ===
                "STOCK_UNRESOLVED"
          )
        ).toBe(
          true
        );
      }
    );


    it(
      "does not force stock completeness from unknown-ownership availability alone",
      () => {

        const stock =
          evidence({
            id:
              "ev_stock_unknown",

            fieldHint:
              "AVAILABILITY",

            rawValue:
              "InStock",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "UNKNOWN"
          });


        const packet =
          packetWithStock(
            stock
          );


        const result =
          validateSemanticDecision(
            packet,
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.status
        ).toBe(
          "VALIDATED"
        );


        expect(
          result.issues.some(
            issue =>
              issue.code ===
                "STOCK_UNRESOLVED"
          )
        ).toBe(
          false
        );
      }
    );
  }
);