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


function packetWithMoney(
  money:
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
      "packet_price_test",

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
      money
    ],

    titleCandidates:
      [title],

    breadcrumbs:
      [],

    moneyCandidates:
      [money],

    conditionCandidates:
      [],

    stockCandidates:
      [],

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
      []
  };
}


function packetWithCompletenessSignals(
  input: {
    readonly conditions?:
      readonly EvidenceItem[];

    readonly selectedControls?:
      readonly EvidenceItem[];
  }
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


  const conditions =
    input.conditions ??
    [];


  const selectedControls =
    input.selectedControls ??
    [];


  return {
    packetId:
      "packet_completeness_signals",

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
      ...conditions,
      ...selectedControls
    ],

    titleCandidates:
      [title],

    breadcrumbs:
      [],

    moneyCandidates:
      [],

    conditionCandidates:
      conditions,

    stockCandidates:
      [],

    ratingCandidates:
      [],

    reviewCandidates:
      [],

    specCandidates:
      [],

    variantCandidates:
      selectedControls,

    selectedControls,

    structuredFacts:
      []
  };
}


function packetWithSpecAndStockSignals(
  input: {
    readonly specs?:
      readonly EvidenceItem[];

    readonly stocks?:
      readonly EvidenceItem[];
  }
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


  const specs =
    input.specs ??
    [];


  const stocks =
    input.stocks ??
    [];


  return {
    packetId:
      "packet_spec_stock_signals",

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
      ...specs,
      ...stocks
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
      stocks,

    ratingCandidates:
      [],

    reviewCandidates:
      [],

    specCandidates:
      specs,

    variantCandidates:
      [],

    selectedControls:
      [],

    structuredFacts:
      []
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

    it(
      "requires review when strong primary price evidence exists but current price is null",
      () => {

        const price =
          evidence({
            id:
              "ev_price_primary",

            fieldHint:
              "PRICE",

            rawValue:
              "15.990.000 VND",

            normalizedValue:
              15_990_000,

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const result =
          validateSemanticDecision(
            packetWithMoney(
              price
            ),
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
                "CURRENT_PRICE_UNRESOLVED",

              field:
                "currentPrice"
            })
          ])
        );
      }
    );


    it(
      "does not force current-price completeness from unknown-ownership money evidence",
      () => {

        const price =
          evidence({
            id:
              "ev_price_unknown",

            fieldHint:
              "PRICE",

            rawValue:
              "15.990.000 VND",

            normalizedValue:
              15_990_000,

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "UNKNOWN"
          });


        const result =
          validateSemanticDecision(
            packetWithMoney(
              price
            ),
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.issues.some(
            issue =>
              issue.code ===
                "CURRENT_PRICE_UNRESOLVED"
          )
        ).toBe(
          false
        );


        expect(
          result.status
        ).toBe(
          "VALIDATED"
        );
      }
    );


    it(
      "flags selected variant control when AI resolves no selected variant",
      () => {

        const selectedControl =
          evidence({
            id:
              "ctrl_color_black",

            fieldHint:
              "CONTROL",

            rawValue:
              "Color | Black",

            sourceKind:
              "DOM",

            sourceUrl:
              "https://example.test/r50",

            locator:
              "color",

            context:
              "selected=true"
          });


        const result =
          validateSemanticDecision(
            packetWithCompletenessSignals({
              selectedControls: [
                selectedControl
              ]
            }),
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                "SELECTED_VARIANT_UNRESOLVED",

              field:
                "variants"
            })
          ])
        );
      }
    );


    it(
      "does not flag selected variant when AI resolves a selected variant",
      () => {

        const selectedControl =
          evidence({
            id:
              "ctrl_color_black",

            fieldHint:
              "CONTROL",

            rawValue:
              "Color | Black",

            sourceKind:
              "DOM",

            sourceUrl:
              "https://example.test/r50",

            locator:
              "color",

            context:
              "selected=true"
          });


        const base =
          decision(
            "ev_title",
            "ev_title"
          );


        const resolved: AISemanticDecision = {
          ...base,

          variants: [
            {
              label:
                "Black",

              selected:
                true,

              condition:
                null,

              price:
                null,

              priceDelta:
                null,

              evidenceIds: [
                "ctrl_color_black"
              ],

              confidence:
                0.95
            }
          ]
        };


        const result =
          validateSemanticDecision(
            packetWithCompletenessSignals({
              selectedControls: [
                selectedControl
              ]
            }),
            resolved
          );


        expect(
          result.issues.some(
            issue =>
              issue.code ===
                "SELECTED_VARIANT_UNRESOLVED"
          )
        ).toBe(
          false
        );
      }
    );


    it(
      "flags unresolved condition from strong primary condition evidence",
      () => {

        const condition =
          evidence({
            id:
              "ev_condition_primary",

            fieldHint:
              "CONDITION",

            rawValue:
              "Brand new",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const result =
          validateSemanticDecision(
            packetWithCompletenessSignals({
              conditions: [
                condition
              ]
            }),
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                "CONDITION_UNRESOLVED",

              field:
                "condition"
            })
          ])
        );
      }
    );


    it(
      "does not force condition completeness from unknown-ownership condition evidence alone",
      () => {

        const condition =
          evidence({
            id:
              "ev_condition_unknown",

            fieldHint:
              "CONDITION",

            rawValue:
              "Used",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "UNKNOWN"
          });


        const result =
          validateSemanticDecision(
            packetWithCompletenessSignals({
              conditions: [
                condition
              ]
            }),
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.issues.some(
            issue =>
              issue.code ===
                "CONDITION_UNRESOLVED"
          )
        ).toBe(
          false
        );
      }
    );


    it(
      "flags unresolved condition from selected condition control",
      () => {

        const selectedControl =
          evidence({
            id:
              "ctrl_condition_used",

            fieldHint:
              "CONTROL",

            rawValue:
              "Condition | Used",

            sourceKind:
              "DOM",

            sourceUrl:
              "https://example.test/r50",

            locator:
              "condition",

            context:
              "selected=true"
          });


        const result =
          validateSemanticDecision(
            packetWithCompletenessSignals({
              selectedControls: [
                selectedControl
              ]
            }),
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                "CONDITION_UNRESOLVED",

              field:
                "condition"
            })
          ])
        );
      }
    );


    it(
      "flags unresolved specs from strong primary SPECS evidence",
      () => {

        const specs =
          evidence({
            id:
              "ev_specs_primary",

            fieldHint:
              "SPECS",

            rawValue:
              "Sensor: APS-C; Resolution: 24.2 MP",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const result =
          validateSemanticDecision(
            packetWithSpecAndStockSignals({
              specs: [
                specs
              ]
            }),
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                "SPECS_UNRESOLVED",

              field:
                "specs"
            })
          ])
        );
      }
    );


    it(
      "does not force specs completeness from DESCRIPTION evidence alone",
      () => {

        const description =
          evidence({
            id:
              "ev_description",

            fieldHint:
              "DESCRIPTION",

            rawValue:
              "A compact mirrorless camera for creators.",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const result =
          validateSemanticDecision(
            packetWithSpecAndStockSignals({
              specs: [
                description
              ]
            }),
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.issues.some(
            issue =>
              issue.code ===
                "SPECS_UNRESOLVED"
          )
        ).toBe(
          false
        );
      }
    );


    it(
      "does not flag specs unresolved when AI resolves at least one grounded spec",
      () => {

        const specs =
          evidence({
            id:
              "ev_specs_primary",

            fieldHint:
              "SPECS",

            rawValue:
              "Sensor: APS-C",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const base =
          decision(
            "ev_title",
            "ev_title"
          );


        const resolved: AISemanticDecision = {
          ...base,

          specs: [
            {
              key:
                "Sensor",

              value:
                "APS-C",

              evidenceIds: [
                "ev_specs_primary"
              ],

              confidence:
                0.95
            }
          ]
        };


        const result =
          validateSemanticDecision(
            packetWithSpecAndStockSignals({
              specs: [
                specs
              ]
            }),
            resolved
          );


        expect(
          result.issues.some(
            issue =>
              issue.code ===
                "SPECS_UNRESOLVED"
          )
        ).toBe(
          false
        );
      }
    );


    it(
      "flags conflicting primary stock evidence when in-stock and out-of-stock signals coexist",
      () => {

        const inStock =
          evidence({
            id:
              "ev_stock_in",

            fieldHint:
              "AVAILABILITY",

            rawValue:
              "InStock",

            sourceKind:
              "JSON_LD",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const outOfStock =
          evidence({
            id:
              "ev_stock_out",

            fieldHint:
              "AVAILABILITY",

            rawValue:
              "OutOfStock",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const result =
          validateSemanticDecision(
            packetWithSpecAndStockSignals({
              stocks: [
                inStock,
                outOfStock
              ]
            }),
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
                "CONFLICTING_PRIMARY_EVIDENCE",

              field:
                "stock"
            })
          ])
        );
      }
    );


    it(
      "does not flag stock conflict from a single primary stock polarity",
      () => {

        const inStock =
          evidence({
            id:
              "ev_stock_in",

            fieldHint:
              "AVAILABILITY",

            rawValue:
              "In stock",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const result =
          validateSemanticDecision(
            packetWithSpecAndStockSignals({
              stocks: [
                inStock
              ]
            }),
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.issues.some(
            issue =>
              issue.code ===
                "CONFLICTING_PRIMARY_EVIDENCE"
          )
        ).toBe(
          false
        );
      }
    );


    it(
      "does not flag stock conflict when contradictory evidence is not primary-product owned",
      () => {

        const inStock =
          evidence({
            id:
              "ev_stock_in_unknown",

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


        const outOfStock =
          evidence({
            id:
              "ev_stock_out_unknown",

            fieldHint:
              "AVAILABILITY",

            rawValue:
              "OutOfStock",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "UNKNOWN"
          });


        const result =
          validateSemanticDecision(
            packetWithSpecAndStockSignals({
              stocks: [
                inStock,
                outOfStock
              ]
            }),
            decision(
              "ev_title",
              "ev_title"
            )
          );


        expect(
          result.issues.some(
            issue =>
              issue.code ===
                "CONFLICTING_PRIMARY_EVIDENCE"
          )
        ).toBe(
          false
        );
      }
    );


    it(
      "preserves UNSUPPORTED_AI_VALUE for an ungrounded numeric current price",
      () => {

        const price =
          evidence({
            id:
              "ev_price_primary",

            fieldHint:
              "PRICE",

            rawValue:
              "15.990.000 VND",

            normalizedValue:
              15_990_000,

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const base =
          decision(
            "ev_title",
            "ev_title"
          );


        const unsupported: AISemanticDecision = {
          ...base,

          currentPrice: {
            value:
              14_000_000,

            currency:
              "VND",

            evidenceIds: [
              "ev_price_primary"
            ],

            confidence:
              0.95
          }
        };


        const result =
          validateSemanticDecision(
            packetWithMoney(
              price
            ),
            unsupported
          );


        expect(
          result.status
        ).toBe(
          "UNSUPPORTED_AI_VALUE"
        );


        expect(
          result.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                "UNSUPPORTED_NUMERIC_VALUE",

              field:
                "currentPrice"
            })
          ])
        );
      }
    );


    it(
      "validates a grounded primary current price without price-completeness false positive",
      () => {

        const price =
          evidence({
            id:
              "ev_price_primary",

            fieldHint:
              "PRICE",

            rawValue:
              "15.990.000 VND",

            normalizedValue:
              15_990_000,

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const base =
          decision(
            "ev_title",
            "ev_title"
          );


        const grounded: AISemanticDecision = {
          ...base,

          currentPrice: {
            value:
              15_990_000,

            currency:
              "VND",

            evidenceIds: [
              "ev_price_primary"
            ],

            confidence:
              0.99
          }
        };


        const result =
          validateSemanticDecision(
            packetWithMoney(
              price
            ),
            grounded
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
                "CURRENT_PRICE_UNRESOLVED" ||
              issue.code ===
                "UNSUPPORTED_NUMERIC_VALUE"
          )
        ).toBe(
          false
        );
      }
    );

  }
);