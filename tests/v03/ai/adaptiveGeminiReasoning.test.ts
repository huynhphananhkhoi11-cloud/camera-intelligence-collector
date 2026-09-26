import {
  describe,
  expect,
  it
} from "vitest";

import {
  analyzeWithAdaptiveGemini,
  type AdaptiveGeminiAnalyzer
} from "../../../src/v03/ai/adaptiveGeminiReasoning.js";

import type {
  EvidenceItem,
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";

import type {
  GeminiAnalyzeResult
} from "../../../src/v03/ai/geminiSemanticProvider.js";

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


const stockEvidence =
  evidence({
    id:
      "ev_stock",

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


const packet:
  EvidencePacket = {

    packetId:
      "packet_adaptive",

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
      stockEvidence
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
      [stockEvidence],

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
      [stockEvidence]
  };


function baseDecision():
  AISemanticDecision {

  return {
    entity: {
      type:
        "CAMERA",

      subtype:
        "Mirrorless Camera",

      confidence:
        0.99,

      evidenceIds: [
        "ev_title"
      ]
    },

    productName: {
      value:
        "Canon EOS R50",

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


function result(
  decision:
    AISemanticDecision
): GeminiAnalyzeResult {

  return {
    decision,

    model:
      "gemini-test",

    totalDurationMs:
      10,

    loadDurationMs:
      null,

    promptEvalCount:
      100,

    evalCount:
      50
  };
}


describe(
  "adaptive Gemini reasoning",
  () => {

    it(
      "accepts LOW without MEDIUM when validation passes",
      async () => {

        const levels:
          string[] =
            [];


        const provider:
          AdaptiveGeminiAnalyzer = {

            async analyze(
              _packet,
              _model,
              _timeout,
              thinkingLevel
            ) {

              levels.push(
                String(
                  thinkingLevel
                )
              );


              return result({
                ...baseDecision(),

                stock: {
                  state:
                    "IN_STOCK",

                  quantity:
                    null,

                  evidenceIds: [
                    "ev_stock"
                  ],

                  confidence:
                    0.99
                }
              });
            }
          };


        const output =
          await analyzeWithAdaptiveGemini({
            packet,
            provider,
            model:
              "gemini-test"
          });


        expect(
          levels
        ).toEqual([
          "low"
        ]);


        expect(
          output.reasoningProfile
        ).toBe(
          "LOW"
        );


        expect(
          output.validation.status
        ).toBe(
          "VALIDATED"
        );


        expect(
          output.attempts
        ).toHaveLength(
          1
        );
      }
    );


    it(
      "escalates LOW to MEDIUM once when completeness validation fails",
      async () => {

        const levels:
          string[] =
            [];


        const provider:
          AdaptiveGeminiAnalyzer = {

            async analyze(
              _packet,
              _model,
              _timeout,
              thinkingLevel
            ) {

              levels.push(
                String(
                  thinkingLevel
                )
              );


              if (
                thinkingLevel ===
                  "low"
              ) {
                return result(
                  baseDecision()
                );
              }


              return result({
                ...baseDecision(),

                stock: {
                  state:
                    "IN_STOCK",

                  quantity:
                    null,

                  evidenceIds: [
                    "ev_stock"
                  ],

                  confidence:
                    0.99
                }
              });
            }
          };


        const output =
          await analyzeWithAdaptiveGemini({
            packet,
            provider,
            model:
              "gemini-test"
          });


        expect(
          levels
        ).toEqual([
          "low",
          "medium"
        ]);


        expect(
          output.attempts
        ).toHaveLength(
          2
        );


        expect(
          output.attempts[0]
            ?.validation
            .issues
            .some(
              issue =>
                issue.code ===
                  "STOCK_UNRESOLVED"
            )
        ).toBe(
          true
        );


        expect(
          output.reasoningProfile
        ).toBe(
          "MEDIUM"
        );


        expect(
          output.validation.status
        ).toBe(
          "VALIDATED"
        );


        expect(
          output.decision.stock
            ?.state
        ).toBe(
          "IN_STOCK"
        );
      }
    );


    it(
      "does not retry beyond one MEDIUM escalation",
      async () => {

        const levels:
          string[] =
            [];


        const provider:
          AdaptiveGeminiAnalyzer = {

            async analyze(
              _packet,
              _model,
              _timeout,
              thinkingLevel
            ) {

              levels.push(
                String(
                  thinkingLevel
                )
              );


              return result(
                baseDecision()
              );
            }
          };


        const output =
          await analyzeWithAdaptiveGemini({
            packet,
            provider,
            model:
              "gemini-test"
          });


        expect(
          levels
        ).toEqual([
          "low",
          "medium"
        ]);


        expect(
          output.attempts
        ).toHaveLength(
          2
        );


        expect(
          output.reasoningProfile
        ).toBe(
          "MEDIUM"
        );


        expect(
          output.validation.status
        ).toBe(
          "NEEDS_REVIEW"
        );
      }
    );
  }
);