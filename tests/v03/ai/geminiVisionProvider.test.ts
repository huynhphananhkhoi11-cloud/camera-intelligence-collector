import {
  describe,
  expect,
  test
} from "vitest";

import {
  GEMINI_VISION_MODEL,
  GeminiVisionContractError,
  GeminiVisionProvider,
  GeminiVisionQuotaError
} from "../../../src/v03/ai/geminiVisionProvider.js";


const decision = {
  entity: {
    type:
      "CAMERA",
    subtype:
      "MIRRORLESS",
    confidence:
      0.99,
    evidenceIds: [
      "ev_name"
    ]
  },

  productName: {
    value:
      "Canon EOS R50",
    evidenceIds: [
      "ev_name"
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
        ),

      evidenceId:
        "ev_screen"
    },

    compactDomEvidence: [
      {
        id:
          "ev_name",

        text:
          "Canon EOS R50"
      }
    ],

    selectedControls: [
      {
        id:
          "ev_variant",

        label:
          "Body",
        selected:
          true
      }
    ],

    structuredFacts: [
      {
        id:
          "ev_fact",

        key:
          "brand",

        value:
          "Canon"
      }
    ]
  };
}


function successResponse() {
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
                  decision
                )
            }
          ]
        }
      ],

      usage: {
        total_input_tokens:
          100,

        total_output_tokens:
          40,

        total_thought_tokens:
          5,

        total_tokens:
          145
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


describe(
  "C9B GeminiVisionProvider",
  () => {

    test(
      "normal path uses exactly one Gemini multimodal minimal-thinking call",
      async () => {

        let calls =
          0;

        let body:
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

                calls +=
                  1;

                body =
                  JSON.parse(
                    String(
                      init?.body
                    )
                  );

                return successResponse();
              }
          });


        const result =
          await provider.analyze(
            evidence()
          );


        expect(
          calls
        ).toBe(
          1
        );

        expect(
          result.attempts
        ).toBe(
          1
        );

        expect(
          body.model
        ).toBe(
          "gemini-3.5-flash-lite"
        );

        expect(
          body.generation_config
            .thinking_level
        ).toBe(
          "minimal"
        );

        expect(
          body.store
        ).toBe(
          false
        );

        expect(
          body.input
        ).toHaveLength(
          2
        );

        expect(
          body.input[
            1
          ]
        ).toMatchObject({
          type:
            "image",

          mime_type:
            "image/png",

          resolution:
            "low"
        });

        expect(
          body.response_format
            .mime_type
        ).toBe(
          "application/json"
        );


        expect(
          body.response_format
            .schema
            .$schema
        ).toBeUndefined();


        expect(
          body.response_format
            .schema
            .properties
            .entity
        ).toMatchObject({
          type:
            "object",

          properties: {
            type: {
              enum: [
                "CAMERA",
                "NON_CAMERA",
                "UNCERTAIN"
              ]
            },

            subtype: {
              type:
                "string"
            },

            confidence: {
              type:
                "number"
            },

            evidenceIds: {
              type:
                "array"
            }
          },

          required: [
            "type",
            "subtype",
            "confidence",
            "evidenceIds"
          ]
        });


        expect(
          body.response_format
            .schema
            .properties
            .productName
            .properties
            .value
            .type
        ).toBe(
          "string"
        );

        expect(
          result.decision
            .productName
            .value
        ).toBe(
          "Canon EOS R50"
        );

        expect(
          result.usage
            .thoughtTokens
        ).toBe(
          5
        );
      }
    );


    test(
      "429 is an immediate quota stop with no retry",
      async () => {

        let calls =
          0;


        const provider =
          new GeminiVisionProvider({
            apiKey:
              "test-key",

            fetchFn:
              async () => {

                calls +=
                  1;

                return new Response(
                  "quota exhausted",
                  {
                    status:
                      429
                  }
                );
              }
          });


        await expect(
          provider.analyze(
            evidence()
          )
        ).rejects.toBeInstanceOf(
          GeminiVisionQuotaError
        );


        expect(
          calls
        ).toBe(
          1
        );
      }
    );


    test(
      "503 retries exactly once and then succeeds",
      async () => {

        let calls =
          0;


        const provider =
          new GeminiVisionProvider({
            apiKey:
              "test-key",

            fetchFn:
              async () => {

                calls +=
                  1;


                if (
                  calls ===
                    1
                ) {
                  return new Response(
                    "temporary",
                    {
                      status:
                        503
                    }
                  );
                }


                return successResponse();
              }
          });


        const result =
          await provider.analyze(
            evidence()
          );


        expect(
          calls
        ).toBe(
          2
        );

        expect(
          result.attempts
        ).toBe(
          2
        );
      }
    );


    test(
      "network failure retries at most once",
      async () => {

        let calls =
          0;


        const provider =
          new GeminiVisionProvider({
            apiKey:
              "test-key",

            fetchFn:
              async () => {

                calls +=
                  1;


                if (
                  calls ===
                    1
                ) {
                  throw new TypeError(
                    "network down"
                  );
                }


                return successResponse();
              }
          });


        const result =
          await provider.analyze(
            evidence()
          );


        expect(
          calls
        ).toBe(
          2
        );

        expect(
          result.attempts
        ).toBe(
          2
        );
      }
    );


    test(
      "invalid semantic output fails canonical contract without retry",
      async () => {

        let calls =
          0;


        const provider =
          new GeminiVisionProvider({
            apiKey:
              "test-key",

            fetchFn:
              async () => {

                calls +=
                  1;

                return new Response(
                  JSON.stringify({
                    status:
                      "completed",

                    steps: [
                      {
                        type:
                          "model_output",

                        content: [
                          {
                            type:
                              "text",

                            text:
                              JSON.stringify({
                                productName:
                                  "not-canonical"
                              })
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


        await expect(
          provider.analyze(
            evidence()
          )
        ).rejects.toBeInstanceOf(
          GeminiVisionContractError
        );


        expect(
          calls
        ).toBe(
          1
        );
      }
    );
  }
);