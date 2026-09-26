import {
  describe,
  expect,
  test
} from "vitest";

import {
  buildEvidencePacket,
  serializeEvidencePacketForPrompt
} from "../../../src/v03/ai/evidencePacket.js";

import type {
  ProductObservation
} from "../../../src/v03/observations/observationTypes.js";


function observation(
  field:
    ProductObservation["field"],
  rawValue:
    string,
  extras:
    Partial<
      ProductObservation
    > = {}
): ProductObservation {

  return {
    productIdentity:
      "URL:https://example.com/product",
    field,
    rawValue,
    sourceKind:
      "VISIBLE_TEXT",
    sourceUrl:
      "https://example.com/product",
    locator:
      "test",
    ...extras
  };
}


describe(
  "AI EvidencePacket",
  () => {

    test(
      "preserves raw evidence but does not expose deterministic semanticRole as AI truth",
      () => {

        const packet =
          buildEvidencePacket({
            pageUrl:
              "https://example.com/product",

            finalUrl:
              "https://example.com/product",

            observations: [
              observation(
                "PRODUCT_NAME",
                "Canon EOS R50"
              ),
              observation(
                "PRICE",
                "15.990.000đ",
                {
                  semanticRole:
                    "CURRENT_PRODUCT_PRICE",
                  ownership:
                    "PRIMARY_PRODUCT"
                }
              )
            ],

            primaryRegionText:
              "Canon EOS R50 Body Only Black 15.990.000đ",

            controls:
              [],

            evidenceBoard:
              undefined
          });


        const prompt =
          serializeEvidencePacketForPrompt(
            packet
          );


        expect(
          prompt
        ).toContain(
          "15.990.000đ"
        );


        expect(
          prompt
        ).not.toContain(
          "CURRENT_PRODUCT_PRICE"
        );
      }
    );


    test(
      "prompt serialization stays bounded even with many observations",
      () => {

        const observations =
          Array.from(
            {
              length:
                100
            },
            (
              _,
              index
            ) =>
              observation(
                "PRICE",
                String(
                  10_000_000 +
                  index *
                  100_000
                ) +
                "đ"
              )
          );


        const packet =
          buildEvidencePacket({
            pageUrl:
              "https://example.com/product",

            finalUrl:
              "https://example.com/product",

            observations,

            primaryRegionText:
              "x".repeat(
                10_000
              ),

            controls:
              []
          });


        const prompt =
          serializeEvidencePacketForPrompt(
            packet
          );


        const parsed =
          JSON.parse(
            prompt
          ) as {
            primaryRegionText:
              string;

            evidence:
              unknown[];
          };


        expect(
          parsed.primaryRegionText.length
        ).toBeLessThanOrEqual(
          1_600
        );


        expect(
          parsed.evidence.length
        ).toBeLessThanOrEqual(
          32
        );
      }
    );


    test(
      "selected controls are explicit evidence",
      () => {

        const packet =
          buildEvidencePacket({
            pageUrl:
              "https://example.com/product",

            finalUrl:
              "https://example.com/product",

            observations: [
              observation(
                "PRODUCT_NAME",
                "Nikon Zf"
              )
            ],

            primaryRegionText:
              "Nikon Zf",

            controls: [
              {
                kind:
                  "select-option",

                label:
                  "Body Only Black",

                value:
                  "black",

                selected:
                  true
              },
              {
                kind:
                  "select-option",

                label:
                  "Silver +1.500.000đ",

                value:
                  "silver",

                selected:
                  false
              }
            ]
          });


        expect(
          packet.selectedControls
        ).toHaveLength(
          1
        );


        expect(
          packet.variantCandidates
            .map(
              item =>
                item.rawValue
            )
        ).toEqual(
          expect.arrayContaining([
            "Body Only Black | black",
            "Silver +1.500.000đ | silver"
          ])
        );
      }
    );
  }
);
