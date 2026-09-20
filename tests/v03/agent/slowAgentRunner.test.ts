import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  GeminiRateLimitError
} from "../../../src/v03/ai/geminiSemanticProvider.js";

import type {
  EvidencePacket
} from "../../../src/v03/ai/evidenceTypes.js";

import type {
  AISemanticDecision,
  SemanticValidationResult,
  ValidationStatus
} from "../../../src/v03/ai/semanticContracts.js";

import type {
  FinalSemanticLowResult
} from "../../../src/v03/agent/semanticFinalizer.js";

import {
  BrowserSlowAgentRunner
} from "../../../src/v03/agent/slowAgentRunner.js";


const TEST_URL =
  "https://example.test/product";

const TEST_PACKET =
  {} as EvidencePacket;


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
                "Synthetic SLOW validation issue"
            }
          ]
  };
}


function makeSemanticResult(
  status:
    ValidationStatus,

  entityType:
    "CAMERA" |
    "NON_CAMERA" |
    "UNCERTAIN"
): FinalSemanticLowResult {

  const decision =
    makeDecision(
      entityType
    );

  return {
    decision,

    validation:
      makeValidation(
        status
      ),

    reasoningProfile:
      "LOW",

    providerResult: {
      decision,

      model:
        "gemini-3.6-flash",

      totalDurationMs:
        1234,

      loadDurationMs:
        null,

      promptEvalCount:
        321,

      evalCount:
        45
    }
  };
}


function makeSession(
  sessionRun:
    ReturnType<typeof vi.fn>
) {

  return {
    run:
      sessionRun
  };
}


function makeSuccessfulSession() {

  return vi.fn(
    async (
      url:
        string,

      finalizeBeforeClose?:
        (
          packet:
            EvidencePacket
        ) =>
          Promise<void>
    ) => {

      if (
        finalizeBeforeClose
      ) {

        await finalizeBeforeClose(
          TEST_PACKET
        );
      }

      return {
        finalUrl:
          url,

        turns:
          1,

        budget:
          {} as never,

        packet:
          TEST_PACKET
      };
    }
  );
}


describe(
  "BrowserSlowAgentRunner",
  () => {

    it(
      "maps VALIDATED CAMERA to CAMERA with LOW telemetry",
      async () => {

        const sessionRun =
          makeSuccessfulSession();

        const analyzeLow =
          vi.fn(
            async () =>
              makeSemanticResult(
                "VALIDATED",
                "CAMERA"
              )
          );

        const runner =
          new BrowserSlowAgentRunner({
            apiKey:
              "test-key",

            model:
              "gemini-3.6-flash",

            createSession:
              () =>
                makeSession(
                  sessionRun
                ),

            analyzeLow
          });

        const result =
          await runner.run(
            TEST_URL
          );

        expect(
          result
        ).toMatchObject({
          disposition:
            "CAMERA",

          model:
            "gemini-3.6-flash",

          attempts:
            1,

          latencyMs:
            1234,

          inputTokens:
            321,

          outputTokens:
            45,

          reason:
            null,

          haltBatch:
            false
        });

        expect(
          sessionRun
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          analyzeLow
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          analyzeLow
        ).toHaveBeenCalledWith(
          TEST_PACKET
        );
      }
    );


    it(
      "maps VALIDATED NON_CAMERA to NON_CAMERA",
      async () => {

        const runner =
          new BrowserSlowAgentRunner({
            apiKey:
              "test-key",

            createSession:
              () =>
                makeSession(
                  makeSuccessfulSession()
                ),

            analyzeLow:
              vi.fn(
                async () =>
                  makeSemanticResult(
                    "VALIDATED",
                    "NON_CAMERA"
                  )
              )
          });

        const result =
          await runner.run(
            TEST_URL
          );

        expect(
          result.disposition
        ).toBe(
          "NON_CAMERA"
        );

        expect(
          result.haltBatch
        ).toBe(
          false
        );
      }
    );


    it(
      "maps unresolved SLOW validation to REVIEW",
      async () => {

        const runner =
          new BrowserSlowAgentRunner({
            apiKey:
              "test-key",

            createSession:
              () =>
                makeSession(
                  makeSuccessfulSession()
                ),

            analyzeLow:
              vi.fn(
                async () =>
                  makeSemanticResult(
                    "NEEDS_REVIEW",
                    "CAMERA"
                  )
              )
          });

        const result =
          await runner.run(
            TEST_URL
          );

        expect(
          result.disposition
        ).toBe(
          "REVIEW"
        );

        expect(
          result.reason
        ).toContain(
          "NEEDS_REVIEW"
        );

        expect(
          result.reason
        ).toContain(
          "TEST_NEEDS_REVIEW"
        );

        expect(
          result.haltBatch
        ).toBe(
          false
        );
      }
    );


    it(
      "maps VALIDATED UNCERTAIN to REVIEW",
      async () => {

        const runner =
          new BrowserSlowAgentRunner({
            apiKey:
              "test-key",

            createSession:
              () =>
                makeSession(
                  makeSuccessfulSession()
                ),

            analyzeLow:
              vi.fn(
                async () =>
                  makeSemanticResult(
                    "VALIDATED",
                    "UNCERTAIN"
                  )
              )
          });

        const result =
          await runner.run(
            TEST_URL
          );

        expect(
          result.disposition
        ).toBe(
          "REVIEW"
        );

        expect(
          result.reason
        ).toContain(
          "UNCERTAIN"
        );
      }
    );


    it(
      "maps Gemini rate limit to AI_PENDING and does not retry",
      async () => {

        const sessionRun =
          makeSuccessfulSession();

        const analyzeLow =
          vi.fn()
            .mockRejectedValue(
              new GeminiRateLimitError(
                "GEMINI_RATE_LIMIT: HTTP 429"
              )
            );

        const runner =
          new BrowserSlowAgentRunner({
            apiKey:
              "test-key",

            createSession:
              () =>
                makeSession(
                  sessionRun
                ),

            analyzeLow
          });

        const result =
          await runner.run(
            TEST_URL
          );

        expect(
          result
        ).toMatchObject({
          disposition:
            "AI_PENDING",

          haltBatch:
            true,

          attempts:
            1
        });

        expect(
          result.reason
        ).toContain(
          "429"
        );

        expect(
          analyzeLow
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          sessionRun
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    it(
      "maps generic HTTP 429 text to AI_PENDING",
      async () => {

        const analyzeLow =
          vi.fn()
            .mockRejectedValue(
              new Error(
                "Gemini request failed: HTTP 429"
              )
            );

        const runner =
          new BrowserSlowAgentRunner({
            apiKey:
              "test-key",

            createSession:
              () =>
                makeSession(
                  makeSuccessfulSession()
                ),

            analyzeLow
          });

        const result =
          await runner.run(
            TEST_URL
          );

        expect(
          result.disposition
        ).toBe(
          "AI_PENDING"
        );

        expect(
          result.haltBatch
        ).toBe(
          true
        );

        expect(
          analyzeLow
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    it(
      "maps non-quota semantic failure to ERROR without retry",
      async () => {

        const analyzeLow =
          vi.fn()
            .mockRejectedValue(
              new Error(
                "GEMINI_AUTH_ERROR: HTTP 401"
              )
            );

        const runner =
          new BrowserSlowAgentRunner({
            apiKey:
              "test-key",

            createSession:
              () =>
                makeSession(
                  makeSuccessfulSession()
                ),

            analyzeLow
          });

        const result =
          await runner.run(
            TEST_URL
          );

        expect(
          result
        ).toMatchObject({
          disposition:
            "ERROR",

          haltBatch:
            false,

          attempts:
            1
        });

        expect(
          result.reason
        ).toContain(
          "GEMINI_AUTH_ERROR"
        );

        expect(
          analyzeLow
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    it(
      "maps browser failure before semantic analysis to ERROR with zero semantic attempts",
      async () => {

        const sessionRun =
          vi.fn()
            .mockRejectedValue(
              new Error(
                "BROWSER_NAVIGATION_FAILED"
              )
            );

        const analyzeLow =
          vi.fn();

        const runner =
          new BrowserSlowAgentRunner({
            apiKey:
              "test-key",

            createSession:
              () =>
                makeSession(
                  sessionRun
                ),

            analyzeLow
          });

        const result =
          await runner.run(
            TEST_URL
          );

        expect(
          result
        ).toMatchObject({
          disposition:
            "ERROR",

          attempts:
            0,

          haltBatch:
            false
        });

        expect(
          result.reason
        ).toContain(
          "BROWSER_NAVIGATION_FAILED"
        );

        expect(
          analyzeLow
        ).toHaveBeenCalledTimes(
          0
        );
      }
    );
  }
);
