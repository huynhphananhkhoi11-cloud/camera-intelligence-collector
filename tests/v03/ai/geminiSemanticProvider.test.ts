import {
  describe,
  expect,
  test
} from "vitest";

import {
  GeminiSemanticProvider
} from "../../../src/v03/ai/geminiSemanticProvider.js";

import type {
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";


function packet():
  EvidencePacket {

  return {
    packetId:
      "packet_test",

    pageUrl:
      "https://example.com/canon-r50",

    finalUrl:
      "https://example.com/canon-r50",

    productIdentity:
      "URL:https://example.com/canon-r50",

    primaryRegionText:
      "Canon EOS R50 Body Only 15,990,000 VND",

    allEvidence: [
      {
        id:
          "ev_0001",

        fieldHint:
          "PRODUCT_NAME",

        rawValue:
          "Canon EOS R50",

        sourceKind:
          "VISIBLE_TEXT",

        sourceUrl:
          "https://example.com/canon-r50",

        locator:
          "h1",

        context:
          null
      }
    ],

    titleCandidates: [],
    breadcrumbs: [],
    moneyCandidates: [],
    conditionCandidates: [],
    stockCandidates: [],
    ratingCandidates: [],
    reviewCandidates: [],
    specCandidates: [],
    variantCandidates: [],
    selectedControls: [],
    structuredFacts: [],

    evidenceBoard: {
      imageId:
        "board_primary_001",

      kind:
        "PRIMARY_PRODUCT_VIEWPORT",

      mimeType:
        "image/png",

      base64:
        Buffer.from(
          "fake-png"
        ).toString(
          "base64"
        ),

      width:
        768,

      height:
        576
    }
  };
}


const decision = {
  entity: {
    type:
      "CAMERA",
    subtype:
      "MIRRORLESS",
    confidence:
      0.99,
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
    0.95
};


describe(
  "GeminiSemanticProvider Interactions API",
  () => {

    test(
      "sends multimodal input and structured response format",
      async () => {

        let body:
          any =
            null;


        const provider =
          new GeminiSemanticProvider({
            apiKey:
              "test-key",

            fetchFn:
              async (
                _input,
                init
              ) => {

                body =
                  JSON.parse(
                    String(
                      init
                        ?.body ??
                      "{}"
                    )
                  );


                return new Response(
                  JSON.stringify({
                    status:
                      "completed",

                    model:
                      "gemini-3.6-flash",

                    steps: [
                      {
                        type:
                          "model_output",

                        content: [
                          {
                            type:
                              "text",

                            text:
                              JSON.stringify(
                                decision
                              )
                          }
                        ]
                      }
                    ],

                    usage: {
                      total_input_tokens:
                        123,

                      total_output_tokens:
                        45,

                      total_thought_tokens:
                        9,

                      total_tokens:
                        177
                    }
                  }),
                  {
                    status:
                      200,

                    headers: {
                      "content-type":
                        "application/json"
                    }
                  }
                );
              }
          });


        const result =
          await provider.analyze(
            packet(),
            "gemini-3.6-flash"
          );


        expect(
          result.decision.entity.type
        ).toBe(
          "CAMERA"
        );


        expect(
          result.promptEvalCount
        ).toBe(
          123
        );


        expect(
          body.model
        ).toBe(
          "gemini-3.6-flash"
        );


        expect(
          body.input.some(
            (
              part:
                any
            ) =>
              part.type ===
                "image" &&
              part.mime_type ===
                "image/png"
          )
        ).toBe(
          true
        );


        const textPart =
          body.input.find(
            (
              part:
                any
            ) =>
              part.type ===
                "text"
          );


        expect(
          textPart.text
        ).toContain(
          "CANONICAL OUTPUT SCHEMA"
        );


        expect(
          textPart.text
        ).toContain(
          "evidenceIds"
        );


        expect(
          body.response_format
            .mime_type
        ).toBe(
          "application/json"
        );


        expect(
          body.response_format
            .schema
            .required
        ).toContain(
          "entity"
        );


        expect(
          body.response_format
            .schema
            .required
        ).toContain(
          "pageConfidence"
        );


        expect(
          body.generation_config
            .thinking_level
        ).toBe(
          "medium"
        );


        expect(
          body.store
        ).toBe(
          false
        );
      }
    );
  }
);
