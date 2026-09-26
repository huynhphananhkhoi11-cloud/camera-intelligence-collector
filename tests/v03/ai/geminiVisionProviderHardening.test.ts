import {
  describe,
  expect,
  test
} from "vitest";

import {
  GEMINI_VISION_MODEL,
  GeminiVisionProvider,
  GeminiVisionTransportError
} from "../../../src/v03/ai/geminiVisionProvider.js";


const decision = {
  entity: {
    type: "CAMERA",
    subtype: "MIRRORLESS",
    confidence: 0.99,
    evidenceIds: ["ev_name"]
  },

  productName: {
    value: "Canon EOS R50",
    evidenceIds: ["ev_name"],
    confidence: 0.99
  },

  currentPrice: null,
  oldPrice: null,
  giftValues: [],
  savingValues: [],
  installmentAmounts: [],
  variants: [],
  condition: null,
  availableConditions: [],
  stock: null,
  rating: null,
  reviewCount: null,
  specs: [],
  conflicts: [],
  pageConfidence: 0.95
};


function evidence() {
  return {
    screenshot: {
      mimeType: "image/png" as const,

      base64:
        Buffer.from(
          "fake-image"
        ).toString(
          "base64"
        )
    },

    compactDomEvidence: [
      {
        id: "ev_name",
        text: "Canon EOS R50"
      }
    ],

    selectedControls: [],

    structuredFacts: []
  };
}


function successResponse() {
  return new Response(
    JSON.stringify({
      status: "completed",

      model:
        GEMINI_VISION_MODEL,

      steps: [
        {
          type: "model_output",

          content: [
            {
              type: "text",

              text:
                JSON.stringify(
                  decision
                )
            }
          ]
        }
      ]
    }),
    {
      status: 200,

      headers: {
        "content-type":
          "application/json"
      }
    }
  );
}


describe(
  "C9B Gemini Vision retry and model policy",
  () => {

    test.each([
      502,
      504
    ])(
      "HTTP %s retries exactly once and then succeeds",
      async status => {

        let calls = 0;


        const provider =
          new GeminiVisionProvider({
            apiKey: "test-key",

            fetchFn:
              async () => {

                calls += 1;


                if (
                  calls === 1
                ) {
                  return new Response(
                    "temporary",
                    {
                      status
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
      "503 exhaustion stops after exactly two total attempts",
      async () => {

        let calls = 0;

        const models:
          string[] = [];


        const provider =
          new GeminiVisionProvider({
            apiKey: "test-key",

            fetchFn:
              async (
                _url,
                init
              ) => {

                calls += 1;

                const body =
                  JSON.parse(
                    String(
                      init?.body
                    )
                  );

                models.push(
                  body.model
                );


                return new Response(
                  "still unavailable",
                  {
                    status: 503
                  }
                );
              }
          });


        await expect(
          provider.analyze(
            evidence()
          )
        ).rejects.toBeInstanceOf(
          GeminiVisionTransportError
        );


        expect(
          calls
        ).toBe(
          2
        );


        expect(
          models
        ).toEqual([
          "gemini-3.5-flash-lite",
          "gemini-3.5-flash-lite"
        ]);
      }
    );


    test(
      "HTTP 500 is not retryable",
      async () => {

        let calls = 0;


        const provider =
          new GeminiVisionProvider({
            apiKey: "test-key",

            fetchFn:
              async () => {

                calls += 1;


                return new Response(
                  "internal failure",
                  {
                    status: 500
                  }
                );
              }
          });


        await expect(
          provider.analyze(
            evidence()
          )
        ).rejects.toThrow(
          "HTTP 500"
        );


        expect(
          calls
        ).toBe(
          1
        );
      }
    );


    test.each([
      401,
      403
    ])(
      "HTTP %s fails immediately with no retry",
      async status => {

        let calls = 0;


        const provider =
          new GeminiVisionProvider({
            apiKey: "test-key",

            fetchFn:
              async () => {

                calls += 1;


                return new Response(
                  "auth failure",
                  {
                    status
                  }
                );
              }
          });


        await expect(
          provider.analyze(
            evidence()
          )
        ).rejects.toThrow(
          "HTTP " +
          status
        );


        expect(
          calls
        ).toBe(
          1
        );
      }
    );


    test(
      "retry path never falls back to another model",
      async () => {

        const models:
          string[] = [];

        let calls = 0;


        const provider =
          new GeminiVisionProvider({
            apiKey: "test-key",

            fetchFn:
              async (
                _url,
                init
              ) => {

                calls += 1;


                const body =
                  JSON.parse(
                    String(
                      init?.body
                    )
                  );


                models.push(
                  body.model
                );


                if (
                  calls === 1
                ) {
                  throw new TypeError(
                    "network unavailable"
                  );
                }


                return successResponse();
              }
          });


        await provider.analyze(
          evidence()
        );


        expect(
          models
        ).toEqual([
          GEMINI_VISION_MODEL,
          GEMINI_VISION_MODEL
        ]);


        expect(
          new Set(
            models
          ).size
        ).toBe(
          1
        );
      }
    );
  }
);