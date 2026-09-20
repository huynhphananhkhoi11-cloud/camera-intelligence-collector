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
  input:
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

    ...input
  };
}


function baseDecision():
  AISemanticDecision {

  return {
    entity: {
      type:
        "CAMERA",

      subtype:
        "MIRRORLESS",

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


function packet(
  extra:
    readonly EvidenceItem[],
  groups:
    {
      readonly money?: readonly EvidenceItem[];
      readonly ratings?: readonly EvidenceItem[];
      readonly reviews?: readonly EvidenceItem[];
    } = {}
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
      "quality_packet",

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
      ...extra
    ],

    titleCandidates: [
      title
    ],

    breadcrumbs:
      [],

    moneyCandidates:
      [
        ...(
          groups.money ??
          []
        )
      ],

    conditionCandidates:
      [],

    stockCandidates:
      [],

    ratingCandidates:
      [
        ...(
          groups.ratings ??
          []
        )
      ],

    reviewCandidates:
      [
        ...(
          groups.reviews ??
          []
        )
      ],

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


describe(
  "grounding validator data quality",
  () => {

    it(
      "rejects rating=15 when it is not grounded in rating evidence",
      () => {

        const noise =
          evidence({
            id:
              "ev_noise",

            fieldHint:
              "SPECS",

            rawValue:
              "15 items available",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50"
          });


        const decision = {
          ...baseDecision(),

          rating: {
            value:
              15,

            evidenceIds: [
              noise.id
            ],

            confidence:
              0.99
          }
        } satisfies AISemanticDecision;


        const result =
          validateSemanticDecision(
            packet(
              [
                noise
              ]
            ),
            decision
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
                "RATING_OUT_OF_RANGE",
              field:
                "rating"
            }),
            expect.objectContaining({
              code:
                "RATING_EVIDENCE_MISMATCH",
              field:
                "rating"
            })
          ])
        );
      }
    );


    it(
      "rejects review count when it cites non-review evidence",
      () => {

        const noise =
          evidence({
            id:
              "ev_noise",

            fieldHint:
              "SPECS",

            rawValue:
              "15 products",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50"
          });


        const decision = {
          ...baseDecision(),

          reviewCount: {
            value:
              15,

            evidenceIds: [
              noise.id
            ],

            confidence:
              0.99
          }
        } satisfies AISemanticDecision;


        const result =
          validateSemanticDecision(
            packet(
              [
                noise
              ]
            ),
            decision
          );


        expect(
          result.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                "REVIEW_COUNT_EVIDENCE_MISMATCH",
              field:
                "reviewCount"
            })
          ])
        );
      }
    );


    it(
      "accepts properly scoped 4.9 rating and 243 review count",
      () => {

        const rating =
          evidence({
            id:
              "ev_rating",

            fieldHint:
              "RATING",

            rawValue:
              "4.9/5",

            normalizedValue:
              4.9,

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50"
          });


        const reviews =
          evidence({
            id:
              "ev_reviews",

            fieldHint:
              "REVIEW_COUNT",

            rawValue:
              "243 đánh giá",

            normalizedValue:
              243,

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50"
          });


        const decision = {
          ...baseDecision(),

          rating: {
            value:
              4.9,

            evidenceIds: [
              rating.id
            ],

            confidence:
              0.99
          },

          reviewCount: {
            value:
              243,

            evidenceIds: [
              reviews.id
            ],

            confidence:
              0.99
          }
        } satisfies AISemanticDecision;


        const result =
          validateSemanticDecision(
            packet(
              [
                rating,
                reviews
              ],
              {
                ratings: [
                  rating
                ],

                reviews: [
                  reviews
                ]
              }
            ),
            decision
          );


        expect(
          result.status
        ).toBe(
          "VALIDATED"
        );
      }
    );


    it(
      "rejects an old price below the current price",
      () => {

        const current =
          evidence({
            id:
              "ev_current",

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
              "PRIMARY_PRODUCT",

            context:
              "current primary price"
          });


        const old =
          evidence({
            id:
              "ev_old",

            fieldHint:
              "PRICE",

            rawValue:
              "Giá cũ: 15 VND",

            normalizedValue:
              15,

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT",

            context:
              "Giá cũ"
          });


        const decision = {
          ...baseDecision(),

          currentPrice: {
            value:
              15_990_000,

            currency:
              "VND",

            evidenceIds: [
              current.id
            ],

            confidence:
              0.99
          },

          oldPrice: {
            value:
              15,

            currency:
              "VND",

            evidenceIds: [
              old.id
            ],

            confidence:
              0.99
          }
        } satisfies AISemanticDecision;


        const result =
          validateSemanticDecision(
            packet(
              [
                current,
                old
              ],
              {
                money: [
                  current,
                  old
                ]
              }
            ),
            decision
          );


        expect(
          result.issues
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              code:
                "OLD_PRICE_BELOW_CURRENT",
              field:
                "oldPrice"
            })
          ])
        );
      }
    );

    it(
      "rejects stale structured review count when visible primary review text says 7",
      () => {

        const visible =
          evidence({
            id:
              "ev_visible_reviews",

            fieldHint:
              "RATING_REVIEW_TEXT",

            rawValue:
              "Đánh giá (7)",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const structured =
          evidence({
            id:
              "ev_structured_reviews",

            fieldHint:
              "REVIEW_COUNT",

            rawValue:
              "243",

            normalizedValue:
              243,

            sourceKind:
              "JSON_LD",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const decision = {
          ...baseDecision(),

          reviewCount: {
            value:
              243,

            evidenceIds: [
              structured.id
            ],

            confidence:
              0.99
          }
        } satisfies AISemanticDecision;


        const result =
          validateSemanticDecision(
            packet(
              [
                visible,
                structured
              ],
              {
                reviews: [
                  visible,
                  structured
                ]
              }
            ),
            decision
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
                "CONFLICTING_REVIEW_COUNT_EVIDENCE",

              field:
                "reviewCount"
            })
          ])
        );
      }
    );

  }
);
