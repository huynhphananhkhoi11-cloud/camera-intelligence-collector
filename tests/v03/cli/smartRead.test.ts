import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  GeminiVisionQuotaError
} from "../../../src/v03/ai/geminiVisionProvider.js";

import type {
  AISemanticDecision,
  SemanticValidationResult,
  ValidationStatus
} from "../../../src/v03/ai/semanticContracts.js";

import type {
  FinalVisionSemanticResult
} from "../../../src/v03/agent/visionFastPath.js";

import type {
  SlowAgentResult
} from "../../../src/v03/agent/fastSlowRouter.js";

import {
  executeSmartRead
} from "../../../src/v03/cli/smartRead.js";


const TEST_URL =
  "https://example.test/product";


function makeDecision(
  entityType:
    "CAMERA" |
    "NON_CAMERA" |
    "UNCERTAIN"
): AISemanticDecision {

  return {
    entity: {
      type:
        entityType
    }
  } as AISemanticDecision;
}


function makeValidation(
  status:
    ValidationStatus
): SemanticValidationResult {

  return {
    status,

    issues:
      status === "VALIDATED"
        ? []
        : [
            {
              code:
                "TEST_" + status,

              message:
                "Synthetic smart-read case"
            }
          ]
  };
}


function makeFastResult(
  status:
    ValidationStatus,

  entityType:
    "CAMERA" |
    "NON_CAMERA" |
    "UNCERTAIN"
): FinalVisionSemanticResult {

  const decision =
    makeDecision(
      entityType
    );

  return {
    sourcePacket:
      {} as FinalVisionSemanticResult[
        "sourcePacket"
      ],

    visionPacket:
      {} as FinalVisionSemanticResult[
        "visionPacket"
      ],

    decision,

    validation:
      makeValidation(
        status
      ),

    providerResult: {
      decision,

      model:
        "gemini-3.5-flash-lite",

      attempts:
        1,

      latencyMs:
        88,

      usage: {
        inputTokens:
          111,

        outputTokens:
          22,

        thoughtTokens:
          0,

        totalTokens:
          133
      }
    }
  };
}


function makeSlowReviewResult():
  SlowAgentResult {

  return {
    disposition:
      "REVIEW",

    decision:
      makeDecision(
        "CAMERA"
      ),

    validation:
      makeValidation(
        "NEEDS_REVIEW"
      ),

    model:
      "gemini-3.6-flash",

    attempts:
      1,

    latencyMs:
      456,

    inputTokens:
      222,

    outputTokens:
      33,

    reason:
      "SLOW_VALIDATION_NEEDS_REVIEW:TEST_NEEDS_REVIEW",

    haltBatch:
      false
  };
}


describe(
  "executeSmartRead",
  () => {

    it(
      "emits unified FAST CAMERA JSON with telemetry",
      async () => {

        const fastRun =
          vi.fn(
            async () =>
              makeFastResult(
                "VALIDATED",
                "CAMERA"
              )
          );

        const slowRun =
          vi.fn(
            async () =>
              makeSlowReviewResult()
          );

        const output:
          string[] =
            [];


        const result =
          await executeSmartRead({
            url:
              TEST_URL,

            fastRunner: {
              run:
                fastRun
            },

            slowRunner: {
              run:
                slowRun
            },

            write:
              line =>
                output.push(
                  line
                )
          });


        expect(
          result
        ).toMatchObject({
          url:
            TEST_URL,

          path:
            "FAST",

          disposition:
            "CAMERA",

          model:
            "gemini-3.5-flash-lite",

          attempts:
            1,

          latencyMs:
            88,

          inputTokens:
            111,

          outputTokens:
            22,

          reason:
            null,

          haltBatch:
            false
        });


        expect(
          fastRun
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          0
        );


        expect(
          output
        ).toHaveLength(
          1
        );


        const json =
          JSON.parse(
            output[0]!
          );


        expect(
          json
        ).toMatchObject({
          path:
            "FAST",

          disposition:
            "CAMERA",

          attempts:
            1,

          inputTokens:
            111,

          outputTokens:
            22,

          latencyMs:
            88
        });


        expect(
          json.validation.status
        ).toBe(
          "VALIDATED"
        );
      }
    );


    it(
      "emits unified SLOW REVIEW JSON after quality escalation",
      async () => {

        const fastRun =
          vi.fn(
            async () =>
              makeFastResult(
                "NEEDS_REVIEW",
                "CAMERA"
              )
          );

        const slowRun =
          vi.fn(
            async () =>
              makeSlowReviewResult()
          );

        const output:
          string[] =
            [];


        const result =
          await executeSmartRead({
            url:
              TEST_URL,

            fastRunner: {
              run:
                fastRun
            },

            slowRunner: {
              run:
                slowRun
            },

            write:
              line =>
                output.push(
                  line
                )
          });


        expect(
          result
        ).toMatchObject({
          path:
            "SLOW",

          disposition:
            "REVIEW",

          model:
            "gemini-3.6-flash",

          attempts:
            1,

          latencyMs:
            456,

          inputTokens:
            222,

          outputTokens:
            33,

          reason:
            "SLOW_VALIDATION_NEEDS_REVIEW:TEST_NEEDS_REVIEW"
        });


        expect(
          fastRun
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          1
        );


        const json =
          JSON.parse(
            output[0]!
          );


        expect(
          json.path
        ).toBe(
          "SLOW"
        );

        expect(
          json.disposition
        ).toBe(
          "REVIEW"
        );

        expect(
          json.validation.status
        ).toBe(
          "NEEDS_REVIEW"
        );
      }
    );


    it(
      "emits quota AI_PENDING and never invokes SLOW",
      async () => {

        const fastRun =
          vi.fn(
            async () => {

              throw new GeminiVisionQuotaError(
                "GEMINI_VISION_QUOTA_STOP: HTTP 429"
              );
            }
          );

        const slowRun =
          vi.fn(
            async () =>
              makeSlowReviewResult()
          );

        const output:
          string[] =
            [];


        const result =
          await executeSmartRead({
            url:
              TEST_URL,

            fastRunner: {
              run:
                fastRun
            },

            slowRunner: {
              run:
                slowRun
            },

            write:
              line =>
                output.push(
                  line
                )
          });


        expect(
          result
        ).toMatchObject({
          path:
            "NONE",

          disposition:
            "AI_PENDING",

          haltBatch:
            true
        });


        expect(
          result.reason
        ).toContain(
          "429"
        );


        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          0
        );


        const json =
          JSON.parse(
            output[0]!
          );


        expect(
          json.disposition
        ).toBe(
          "AI_PENDING"
        );

        expect(
          json.haltBatch
        ).toBe(
          true
        );
      }
    );
  }
);
