import {
  describe,
  expect,
  it
} from "vitest";

import {
  GEMINI_VISION_MODEL,
  GeminiVisionProvider
} from "../../../src/v03/ai/geminiVisionProvider.js";


function evidence() {
  return {
    screenshot: {
      mimeType:
        "image/png" as const,

      base64:
        Buffer.from(
          "fake-image"
        ).toString(
          "base64"
        )
    },

    compactDomEvidence: [
      {
        id:
          "ev_name",
        fieldHint:
          "PRODUCT_NAME",
        rawValue:
          "Canon EOS R50"
      },
      {
        id:
          "ev_rating",
        fieldHint:
          "RATING",
        rawValue:
          "4.9/5"
      },
      {
        id:
          "ev_reviews",
        fieldHint:
          "REVIEW_COUNT",
        rawValue:
          "243 đánh giá"
      },
      {
        id:
          "ev_rental",
        fieldHint:
          "SPECS",
        rawValue:
          "Giá thuê 500.000 VND/ngày"
      }
    ],

    selectedControls:
      [],

    structuredFacts:
      []
  };
}


function wireDecision() {
  return {
    entity_type:
      "CAMERA",

    entity_subtype:
      "MIRRORLESS",

    entity_confidence:
      0.99,

    entity_evidence_ids: [
      "ev_name"
    ],

    product_name:
      "Canon EOS R50",

    product_name_confidence:
      0.99,

    product_name_evidence_ids: [
      "ev_name"
    ],

    current_price_value:
      null,

    current_price_currency:
      null,

    current_price_confidence:
      0.5,

    current_price_evidence_ids:
      [],

    condition_value:
      null,

    condition_confidence:
      0.5,

    condition_evidence_ids:
      [],

    stock_state:
      null,

    stock_quantity:
      null,

    stock_confidence:
      0.5,

    stock_evidence_ids:
      [],

    rating_value:
      4.9,

    rating_confidence:
      0.99,

    rating_evidence_ids: [
      "ev_rating"
    ],

    review_count_value:
      243,

    review_count_confidence:
      0.99,

    review_count_evidence_ids: [
      "ev_reviews"
    ],

    selected_variant_label:
      null,

    selected_variant_condition:
      null,

    selected_variant_confidence:
      0.5,

    selected_variant_evidence_ids:
      [],

    specs: [
      {
        key:
          "RENTAL_PRICE_PER_DAY",

        value:
          "500.000 VND/ngày",

        confidence:
          0.99,

        evidence_ids: [
          "ev_rental"
        ]
      }
    ],

    conflicts:
      [],

    page_confidence:
      0.99
  };
}


describe(
  "Gemini Vision requested data fields",
  () => {

    it(
      "includes rating and review fields in the compact response schema and normalizes them",
      async () => {

        let requestBody:
          any =
            null;


        const provider =
          new GeminiVisionProvider({
            apiKey:
              "test-key",

            fetchFn:
              async (
                _url,
                init
              ) => {

                requestBody =
                  JSON.parse(
                    String(
                      init?.body
                    )
                  );


                return new Response(
                  JSON.stringify({
                    status:
                      "completed",

                    model:
                      GEMINI_VISION_MODEL,

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
                                wireDecision()
                              )
                          }
                        ]
                      }
                    ]
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
            evidence()
          );


        expect(
          requestBody.response_format
            .schema
            .properties
            .rating_value
        ).toBeDefined();


        expect(
          requestBody.response_format
            .schema
            .properties
            .review_count_value
        ).toBeDefined();


        expect(
          result.decision.rating
            ?.value
        ).toBe(
          4.9
        );


        expect(
          result.decision.reviewCount
            ?.value
        ).toBe(
          243
        );


        expect(
          result.decision.specs
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              key:
                "RENTAL_PRICE_PER_DAY",

              value:
                "500.000 VND/ngày"
            })
          ])
        );
      }
    );


    it(
      "keeps the prompt explicit that unsupported rental and accessory values must not be invented",
      async () => {

        let prompt =
          "";


        const provider =
          new GeminiVisionProvider({
            apiKey:
              "test-key",

            fetchFn:
              async (
                _url,
                init
              ) => {

                const body =
                  JSON.parse(
                    String(
                      init?.body
                    )
                  );


                prompt =
                  String(
                    body.input?.[0]
                      ?.text ??
                    ""
                  );


                return new Response(
                  JSON.stringify({
                    status:
                      "completed",

                    model:
                      GEMINI_VISION_MODEL,

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
                                wireDecision()
                              )
                          }
                        ]
                      }
                    ]
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


        await provider.analyze(
          evidence()
        );


        expect(
          prompt
        ).toContain(
          "RENTAL_PRICE_PER_DAY"
        );


        expect(
          prompt
        ).toContain(
          "Do not infer rental price"
        );
      }
    );
  }
);
