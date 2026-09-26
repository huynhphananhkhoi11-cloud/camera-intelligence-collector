import {
  describe,
  expect,
  it
} from "vitest";

import {
  compactEvidencePacketForPrompt
} from "../../../src/v03/ai/evidenceCompactor.js";

import type {
  EvidenceItem,
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";


function item(
  value:
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

    ...value
  };
}


describe(
  "evidence compactor",
  () => {

    it(
      "deduplicates prompt evidence while preserving selected controls and strong stock provenance",
      () => {

        const title =
          item({
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


        const selected =
          item({
            id:
              "ctrl_selected",

            fieldHint:
              "CONTROL",

            rawValue:
              "Body Only | 15990000",

            sourceKind:
              "DOM",

            sourceUrl:
              "https://example.test/r50",

            context:
              "selected=true"
          });


        const priceVisible =
          item({
            id:
              "ev_price_visible",

            fieldHint:
              "PRICE",

            rawValue:
              "15,990,000",

            normalizedValue:
              15990000,

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            context:
              "Primary product price",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const priceVisibleDuplicate =
          item({
            id:
              "ev_price_visible_duplicate",

            fieldHint:
              "PRICE",

            rawValue:
              "15,990,000 VND",

            normalizedValue:
              15990000,

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            context:
              "Primary product price",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const priceStructured =
          item({
            id:
              "ev_price_jsonld",

            fieldHint:
              "PRICE",

            rawValue:
              "15990000",

            normalizedValue:
              15990000,

            sourceKind:
              "JSON_LD",

            sourceUrl:
              "https://example.test/r50",

            context:
              "Structured primary Product price",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const stockUnknown =
          item({
            id:
              "ev_stock_unknown",

            fieldHint:
              "AVAILABILITY",

            rawValue:
              "http://schema.org/InStock",

            sourceKind:
              "VISIBLE_TEXT",

            sourceUrl:
              "https://example.test/r50",

            ownershipHint:
              "UNKNOWN"
          });


        const stockVisible =
          item({
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

            context:
              "Primary-product scoped visible availability",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const stockStructured =
          item({
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

            context:
              "Structured primary Product availability",

            ownershipHint:
              "PRIMARY_PRODUCT"
          });


        const allEvidence = [
          title,
          selected,
          priceVisible,
          priceVisibleDuplicate,
          priceStructured,
          stockUnknown,
          stockVisible,
          stockStructured
        ];


        const packet:
          EvidencePacket = {

            packetId:
              "packet_test",

            pageUrl:
              "https://example.test/r50",

            finalUrl:
              "https://example.test/r50",

            productIdentity:
              "Canon EOS R50",

            primaryRegionText:
              "Canon EOS R50",

            allEvidence,

            titleCandidates:
              [title],

            breadcrumbs:
              [],

            moneyCandidates: [
              priceVisible,
              priceVisibleDuplicate,
              priceStructured
            ],

            conditionCandidates:
              [],

            stockCandidates: [
              stockUnknown,
              stockVisible,
              stockStructured
            ],

            ratingCandidates:
              [],

            reviewCandidates:
              [],

            specCandidates:
              [],

            variantCandidates:
              [selected],

            selectedControls:
              [selected],

            structuredFacts: [
              priceStructured,
              stockStructured
            ]
          };


        const compact =
          compactEvidencePacketForPrompt(
            packet
          );


        expect(
          compact.allEvidence
        ).toHaveLength(
          allEvidence.length
        );


        expect(
          compact.selectedControls.map(
            value =>
              value.id
          )
        ).toEqual([
          "ctrl_selected"
        ]);


        expect(
          compact.moneyCandidates.map(
            value =>
              value.id
          )
        ).toContain(
          "ev_price_visible"
        );


        expect(
          compact.moneyCandidates.map(
            value =>
              value.id
          )
        ).toContain(
          "ev_price_jsonld"
        );


        expect(
          compact.moneyCandidates.map(
            value =>
              value.id
          )
        ).not.toContain(
          "ev_price_visible_duplicate"
        );


        expect(
          compact.stockCandidates.map(
            value =>
              value.id
          )
        ).toContain(
          "ev_stock_visible"
        );


        expect(
          compact.stockCandidates.map(
            value =>
              value.id
          )
        ).toContain(
          "ev_stock_jsonld"
        );


        expect(
          compact.stockCandidates.map(
            value =>
              value.id
          )
        ).not.toContain(
          "ev_stock_unknown"
        );


        const originalIds =
          new Set(
            packet.allEvidence.map(
              value =>
                value.id
            )
          );


        for (
          const candidate
          of [
            ...compact.selectedControls,
            ...compact.titleCandidates,
            ...compact.moneyCandidates,
            ...compact.stockCandidates,
            ...compact.variantCandidates
          ]
        ) {
          expect(
            originalIds.has(
              candidate.id
            )
          ).toBe(
            true
          );
        }
      }
    );
  }
);