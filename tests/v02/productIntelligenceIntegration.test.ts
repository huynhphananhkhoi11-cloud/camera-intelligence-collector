import {
  describe,
  expect,
  test
} from "vitest";

import {
  classifyEntity
} from "../../src/v02/entityClassifier.ts";

import {
  classifyOffers
} from "../../src/v02/offerClassifier.ts";

import {
  classifyCondition
} from "../../src/v02/conditionClassifier.ts";

import {
  analyzeRawProduct
} from "../../src/v02/evidenceEngine.ts";

import type {
  RawProductFacts
} from "../../src/v02/rawProductExtractor.ts";

function baseCameraFacts():
  RawProductFacts {
  return {
    url:
      "https://example.com/canon-r50",

    title:
      "Canon EOS R50",

    breadcrumbs:
      [
        "Trang chủ",
        "Máy ảnh"
      ],

    listingCategory:
      "Máy ảnh",

    jsonLd:
      [],

    visiblePriceTexts:
      [],

    buttons:
      [],

    sections: [
      {
        key:
          "SPECS",

        heading:
          "Thông số kỹ thuật",

        normalizedHeading:
          "thong so ky thuat",

        content:
          "Loại máy: Mirrorless; Cảm biến APS-C CMOS 24.2MP; ISO 100-32000; Dual Pixel CMOS AF II; EVF; quay video 4K; ngàm RF-S"
      }
    ],

    ratingTexts:
      [],

    stockTexts:
      [],

    listingPriceText:
      "",

    networkFacts:
      [],

    pageText:
      "Canon EOS R50"
  };
}

function correlatedNetworkFact(
  sample:
    Record<string, unknown>
): RawProductFacts["networkFacts"][number] {
  return {
    source:
      "NETWORK_API",

    responseUrl:
      "https://example.com/api/product/42",

    method:
      "GET",

    status:
      200,

    contentType:
      "application/json",

    responseTimestamps:
      [
        "2026-09-17T17:00:00.000Z"
      ],

    candidatePath:
      "$.product",

    candidateScore:
      90,

    itemCount:
      1,

    seenCount:
      1,

    commonKeys:
      Object.keys(sample),

    signalKeys:
      Object.keys(sample),

    sampleIndex:
      0,

    sample,

    hints: {
      productId:
        "42",

      name:
        "Canon EOS R50",

      rawUrl:
        "/canon-r50",

      canonicalUrl:
        "https://example.com/canon-r50",

      slug:
        "canon-r50"
    },

    correlation: {
      score:
        100,

      reasons: [
        "SAMPLE_URL_MATCH",
        "PRODUCT_ID_MATCH"
      ]
    }
  };
}

describe(
  "Phase 7A product intelligence integration",
  () => {
    test(
      "entity evidence is structured and explainable",
      () => {
        const result =
          classifyEntity({
            title:
              "Canon EOS R50",

            category:
              "Máy ảnh",

            specs:
              "Loại máy: Mirrorless; Cảm biến APS-C CMOS; ISO 100-32000; EVF; quay video 4K"
          });

        expect(
          result.type
        ).toBe(
          "CAMERA"
        );

        expect(
          result.evidence.length
        ).toBeGreaterThan(0);

        for (
          const evidence
          of result.evidence
        ) {
          expect(
            evidence.source
          ).toBeTruthy();

          expect(
            typeof evidence.raw
          ).toBe(
            "string"
          );

          expect(
            Number.isFinite(
              evidence.weight
            )
          ).toBe(true);

          expect(
            evidence.ruleId
          ).toMatch(
            /^entity\./
          );
        }
      }
    );

    test(
      "offer and condition evidence expose raw ruleId and scope",
      () => {
        const offer =
          classifyOffers({
            buttons: [
              "Mua ngay"
            ]
          });

        expect(
          offer.sale
        ).toBe(true);

        expect(
          offer.evidence[0]
        ).toEqual(
          expect.objectContaining({
            source:
              "CTA",

            raw:
              "mua ngay",

            weight:
              80,

            ruleId:
              "offer.sale.cta",

            scope:
              "buttons"
          })
        );

        const condition =
          classifyCondition({
            title:
              "Canon EOS R - Hàng cũ"
          });

        expect(
          condition.condition
        ).toBe(
          "USED"
        );

        expect(
          condition.evidence[0]
        ).toEqual(
          expect.objectContaining({
            source:
              "TITLE",

            weight:
              90,

            ruleId:
              "condition.used.title",

            scope:
              "title"
          })
        );

        expect(
          condition.evidence[0]
            ?.raw
        ).toContain(
          "canon eos r"
        );
      }
    );

    test(
      "siteMode cannot push weak product evidence across offer threshold",
      () => {
        const withoutPrior =
          classifyOffers({
            pageText:
              "Thời gian thuê. Điều kiện thuê."
          });

        const withPrior =
          classifyOffers({
            pageText:
              "Thời gian thuê. Điều kiện thuê.",

            siteMode:
              "RENTAL"
          });

        expect(
          withoutPrior.rentalScore
        ).toBe(55);

        expect(
          withPrior.rentalScore
        ).toBe(
          withoutPrior.rentalScore
        );

        expect(
          withPrior.rental
        ).toBe(false);

        expect(
          withPrior.evidence
            .some(
              evidence =>
                evidence.source ===
                  "SITE_PRIOR" &&
                evidence.weight ===
                  0
            )
        ).toBe(true);
      }
    );

    test(
      "strongly correlated network LeaseOut becomes rental evidence",
      () => {
        const facts =
          baseCameraFacts();

        facts.networkFacts = [
          correlatedNetworkFact({
            offers: {
              businessFunction:
                "http://purl.org/goodrelations/v1#LeaseOut"
            }
          })
        ];

        const analysis =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        expect(
          analysis.entity.type
        ).toBe(
          "CAMERA"
        );

        expect(
          analysis.offer.rental
        ).toBe(true);

        expect(
          analysis.offer.sale
        ).toBe(false);

        expect(
          analysis.offer.evidence
            .some(
              evidence =>
                evidence.source ===
                  "NETWORK" &&
                evidence.ruleId ===
                  "offer.rental.network"
            )
        ).toBe(true);

        expect(
          analysis.condition
            .condition
        ).toBe(
          "UNKNOWN"
        );
      }
    );

    test(
      "network Sell plus UsedCondition produces sale USED at product level",
      () => {
        const facts =
          baseCameraFacts();

        facts.networkFacts = [
          correlatedNetworkFact({
            offers: {
              businessFunction:
                "http://purl.org/goodrelations/v1#Sell"
            },

            itemCondition:
              "https://schema.org/UsedCondition"
          })
        ];

        const analysis =
          analyzeRawProduct(
            facts,
            "RENTAL"
          );

        expect(
          analysis.offer.sale
        ).toBe(true);

        /*
         * Site prior cannot create a rental truth.
         */
        expect(
          analysis.offer.rental
        ).toBe(false);

        expect(
          analysis.condition
            .condition
        ).toBe(
          "USED"
        );

        expect(
          analysis.condition
            .evidence
            .some(
              evidence =>
                evidence.source ===
                  "NETWORK" &&
                evidence.ruleId ===
                  "condition.used.network"
            )
        ).toBe(true);

        expect(
          analysis.forms
        ).toContain(
          "SECOND_HAND"
        );
      }
    );

    test(
      "uncorrelated API sample is retained in RawProductFacts but cannot determine truth",
      () => {
        const facts =
          baseCameraFacts();

        const unrelated =
          correlatedNetworkFact({
            offers: {
              businessFunction:
                "http://purl.org/goodrelations/v1#Sell"
            },

            itemCondition:
              "https://schema.org/NewCondition"
          });

        unrelated.correlation = {
          score:
            0,

          reasons:
            []
        };

        facts.networkFacts = [
          unrelated
        ];

        const analysis =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        expect(
          facts.networkFacts
        ).toHaveLength(1);

        expect(
          analysis.offer.sale
        ).toBe(false);

        expect(
          analysis.offer.rental
        ).toBe(false);

        expect(
          analysis.condition
            .condition
        ).toBe(
          "UNKNOWN"
        );

        expect(
          analysis.decision
        ).toBe(
          "REVIEW"
        );
      }
    );
  }
);