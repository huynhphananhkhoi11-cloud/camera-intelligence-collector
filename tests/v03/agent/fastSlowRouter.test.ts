import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  GeminiVisionContractError,
  GeminiVisionQuotaError,
  GeminiVisionTransportError
} from "../../../src/v03/ai/geminiVisionProvider.js";

import type {
  AISemanticDecision,
  SemanticValidationResult,
  ValidationStatus
} from "../../../src/v03/ai/semanticContracts.js";

import type {
  FinalVisionSemanticResult
} from "../../../src/v03/agent/visionFastPath.js";

import {
  routeSmartUrl,
  type FastRunner,
  type SlowAgentResult,
  type SlowRunner
} from "../../../src/v03/agent/fastSlowRouter.js";


const TEST_URL =
  "https://example.test/product";


function makeDecision(
  entityType:
    "CAMERA" |
    "NON_CAMERA" |
    "UNCERTAIN"
): AISemanticDecision {

  /*
   * Router tests deliberately provide only the fields
   * consumed by the router.
   *
   * Canonical schema completeness belongs to the
   * semantic/provider/grounding test layers.
   */
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
                "Synthetic router quality case"
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
        25,

      usage: {
        inputTokens:
          100,

        outputTokens:
          20,

        thoughtTokens:
          0,

        totalTokens:
          120
      }
    }
  };
}


function makeSlowResult(
  disposition:
    SlowAgentResult[
      "disposition"
    ],

  options?:
    {
      readonly status?:
        ValidationStatus;

      readonly entityType?:
        "CAMERA" |
        "NON_CAMERA" |
        "UNCERTAIN";

      readonly haltBatch?:
        boolean;

      readonly reason?:
        string |
        null;
    }
): SlowAgentResult {

  const status =
    options?.status ??
    (
      disposition === "CAMERA" ||
      disposition === "NON_CAMERA"
        ? "VALIDATED"
        : "NEEDS_REVIEW"
    );

  const entityType =
    options?.entityType ??
    (
      disposition === "NON_CAMERA"
        ? "NON_CAMERA"
        : "CAMERA"
    );

  const hasSemanticResult =
    disposition === "CAMERA" ||
    disposition === "NON_CAMERA" ||
    disposition === "REVIEW";

  return {
    disposition,

    decision:
      hasSemanticResult
        ? makeDecision(
            entityType
          )
        : null,

    validation:
      hasSemanticResult
        ? makeValidation(
            status
          )
        : null,

    model:
      hasSemanticResult
        ? "slow-test-model"
        : null,

    attempts:
      hasSemanticResult
        ? 1
        : 0,

    latencyMs:
      hasSemanticResult
        ? 50
        : null,

    inputTokens:
      hasSemanticResult
        ? 200
        : null,

    outputTokens:
      hasSemanticResult
        ? 30
        : null,

    reason:
      options?.reason ??
      (
        disposition === "REVIEW"
          ? "SLOW_REMAINS_REVIEW"
          : null
      ),

    haltBatch:
      options?.haltBatch ??
      false
  };
}


function runnersForFastResult(
  fastResult:
    FinalVisionSemanticResult,

  slowResult:
    SlowAgentResult =
      makeSlowResult(
        "CAMERA"
      )
): {
  readonly fastRunner:
    FastRunner;

  readonly slowRunner:
    SlowRunner;

  readonly fastRun:
    ReturnType<typeof vi.fn>;

  readonly slowRun:
    ReturnType<typeof vi.fn>;
} {

  const fastRun =
    vi.fn(
      async (
        _url:
          string
      ) =>
        fastResult
    );

  const slowRun =
    vi.fn(
      async (
        _url:
          string
      ) =>
        slowResult
    );

  return {
    fastRunner: {
      run:
        fastRun
    },

    slowRunner: {
      run:
        slowRun
    },

    fastRun,
    slowRun
  };
}


function runnersForFastError(
  error:
    Error
): {
  readonly fastRunner:
    FastRunner;

  readonly slowRunner:
    SlowRunner;

  readonly fastRun:
    ReturnType<typeof vi.fn>;

  readonly slowRun:
    ReturnType<typeof vi.fn>;
} {

  const fastRun =
    vi.fn(
      async (
        _url:
          string
      ): Promise<
        FinalVisionSemanticResult
      > => {

        throw error;
      }
    );

  const slowRun =
    vi.fn(
      async (
        _url:
          string
      ) =>
        makeSlowResult(
          "CAMERA"
        )
    );

  return {
    fastRunner: {
      run:
        fastRun
    },

    slowRunner: {
      run:
        slowRun
    },

    fastRun,
    slowRun
  };
}


describe(
  "fastSlowRouter",
  () => {

    it(
      "returns FAST CAMERA without invoking SLOW",
      async () => {

        const {
          fastRunner,
          slowRunner,
          fastRun,
          slowRun
        } =
          runnersForFastResult(
            makeFastResult(
              "VALIDATED",
              "CAMERA"
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,

            fastRunner,

            slowRunner
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
            25,

          inputTokens:
            100,

          outputTokens:
            20,

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
      }
    );


    it(
      "returns FAST NON_CAMERA without invoking SLOW",
      async () => {

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastResult(
            makeFastResult(
              "VALIDATED",
              "NON_CAMERA"
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,

            fastRunner,

            slowRunner
          });

        expect(
          result.path
        ).toBe(
          "FAST"
        );

        expect(
          result.disposition
        ).toBe(
          "NON_CAMERA"
        );

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          0
        );
      }
    );


    it.each(
      [
        "NEEDS_REVIEW",
        "AI_UNRESOLVED",
        "UNSUPPORTED_AI_VALUE"
      ] as const
    )(
      "%s escalates to SLOW exactly once",
      async (
        status
      ) => {

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastResult(
            makeFastResult(
              status,
              "CAMERA"
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,

            fastRunner,

            slowRunner
          });

        expect(
          result.path
        ).toBe(
          "SLOW"
        );

        expect(
          result.disposition
        ).toBe(
          "CAMERA"
        );

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    it(
      "VALIDATED UNCERTAIN escalates to SLOW exactly once",
      async () => {

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastResult(
            makeFastResult(
              "VALIDATED",
              "UNCERTAIN"
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,

            fastRunner,

            slowRunner
          });

        expect(
          result.path
        ).toBe(
          "SLOW"
        );

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    it(
      "429 quota returns AI_PENDING, halts batch, and never calls SLOW",
      async () => {

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastError(
            new GeminiVisionQuotaError(
              "GEMINI_VISION_QUOTA_STOP: HTTP 429"
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,

            fastRunner,

            slowRunner
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
      }
    );


    it(
      "exhausted transport returns AI_PENDING without halting batch or calling SLOW",
      async () => {

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastError(
            new GeminiVisionTransportError(
              "GEMINI_VISION_TRANSIENT_EXHAUSTED: HTTP 503"
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,

            fastRunner,

            slowRunner
          });

        expect(
          result
        ).toMatchObject({
          path:
            "NONE",

          disposition:
            "AI_PENDING",

          haltBatch:
            false
        });

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          0
        );
      }
    );


    it(
      "contract failure returns ERROR and never calls SLOW",
      async () => {

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastError(
            new GeminiVisionContractError(
              "GEMINI_VISION_CONTRACT_MISMATCH"
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,

            fastRunner,

            slowRunner
          });

        expect(
          result.disposition
        ).toBe(
          "ERROR"
        );

        expect(
          result.path
        ).toBe(
          "NONE"
        );

        expect(
          result.haltBatch
        ).toBe(
          false
        );

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          0
        );
      }
    );


    it.each(
      [
        400,
        401,
        403
      ]
    )(
      "generic HTTP %i error returns ERROR and never calls SLOW",
      async (
        status
      ) => {

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastError(
            new Error(
              "HTTP " +
              status +
              " provider error"
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,

            fastRunner,

            slowRunner
          });

        expect(
          result.disposition
        ).toBe(
          "ERROR"
        );

        expect(
          result.path
        ).toBe(
          "NONE"
        );

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          0
        );
      }
    );


    it(
      "SLOW unresolved result becomes REVIEW",
      async () => {

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastResult(
            makeFastResult(
              "NEEDS_REVIEW",
              "CAMERA"
            ),

            makeSlowResult(
              "REVIEW",
              {
                status:
                  "NEEDS_REVIEW",

                reason:
                  "SLOW_REMAINS_REVIEW"
              }
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,

            fastRunner,

            slowRunner
          });

        expect(
          result
        ).toMatchObject({
          path:
            "SLOW",

          disposition:
            "REVIEW",

          reason:
            "SLOW_REMAINS_REVIEW",

          haltBatch:
            false
        });

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );


    it(
      "SLOW pending result remains AI_PENDING and is never retried",
      async () => {

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastResult(
            makeFastResult(
              "AI_UNRESOLVED",
              "CAMERA"
            ),

            makeSlowResult(
              "AI_PENDING",
              {
                haltBatch:
                  true,

                reason:
                  "SLOW_QUOTA_STOP"
              }
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,

            fastRunner,

            slowRunner
          });

        expect(
          result
        ).toMatchObject({
          path:
            "SLOW",

          disposition:
            "AI_PENDING",

          reason:
            "SLOW_QUOTA_STOP",

          haltBatch:
            true
        });

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          1
        );
      }
    );

    it(
      "obstructed Canon EOS R50 NON_CAMERA escalates to SLOW exactly once",
      async () => {

        const base =
          makeFastResult(
            "VALIDATED",
            "NON_CAMERA"
          );

        const decision = {
          ...base.decision,
          entity: {
            ...base.decision.entity,
            type:
              "NON_CAMERA" as const,
            evidenceIds: [
              "ev_camera"
            ]
          }
        } as AISemanticDecision;

        const fastResult = {
          ...base,
          sourcePacket: {
            allEvidence: [
              {
                id:
                  "ev_camera",
                fieldHint:
                  "PRODUCT",
                rawValue:
                  "Canon EOS R50",
                sourceKind:
                  "VISIBLE_TEXT",
                sourceUrl:
                  TEST_URL,
                ownershipHint:
                  "PRIMARY_PRODUCT"
              }
            ]
          } as FinalVisionSemanticResult[
            "sourcePacket"
          ],
          visionPacket: {
            productRegionScreenshot: {
              fallback:
                true
            },
            compactDomEvidence: [
              {
                id:
                  "popup",
                fieldHint:
                  "TEXT",
                rawValue:
                  "Nhận ưu đãi",
                sourceKind:
                  "DOM",
                locator:
                  ".promo-popup",
                ownershipHint:
                  "PAGE_CHROME"
              }
            ],
            selectedControls:
              [],
            structuredFacts:
              []
          } as FinalVisionSemanticResult[
            "visionPacket"
          ],
          decision
        };

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastResult(
            fastResult,
            makeSlowResult(
              "REVIEW",
              {
                reason:
                  "OBSTRUCTION_REQUIRES_REVIEW"
              }
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,
            fastRunner,
            slowRunner
          });


        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          result
        ).toMatchObject({
          path:
            "SLOW",
          disposition:
            "REVIEW"
        });
      }
    );


    it(
      "clear Sony FE 50mm lens evidence remains FAST NON_CAMERA despite viewport fallback",
      async () => {

        const base =
          makeFastResult(
            "VALIDATED",
            "NON_CAMERA"
          );

        const decision = {
          ...base.decision,
          entity: {
            ...base.decision.entity,
            type:
              "NON_CAMERA" as const,
            evidenceIds: [
              "ev_lens"
            ]
          }
        } as AISemanticDecision;

        const fastResult = {
          ...base,
          sourcePacket: {
            allEvidence: [
              {
                id:
                  "ev_lens",
                fieldHint:
                  "PRODUCT",
                rawValue:
                  "Sony FE 50mm f/1.8",
                sourceKind:
                  "VISIBLE_TEXT",
                sourceUrl:
                  TEST_URL,
                ownershipHint:
                  "PRIMARY_PRODUCT"
              }
            ]
          } as FinalVisionSemanticResult[
            "sourcePacket"
          ],
          visionPacket: {
            productRegionScreenshot: {
              fallback:
                true
            },
            compactDomEvidence:
              [],
            selectedControls:
              [],
            structuredFacts:
              []
          } as FinalVisionSemanticResult[
            "visionPacket"
          ],
          decision
        };

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastResult(
            fastResult
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,
            fastRunner,
            slowRunner
          });


        expect(
          result.disposition
        ).toBe(
          "NON_CAMERA"
        );

        expect(
          result.path
        ).toBe(
          "FAST"
        );

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          0
        );
      }
    );


    it(
      "clear workshop/blog evidence remains FAST NON_CAMERA",
      async () => {

        const base =
          makeFastResult(
            "VALIDATED",
            "NON_CAMERA"
          );

        const decision = {
          ...base.decision,
          entity: {
            ...base.decision.entity,
            type:
              "NON_CAMERA" as const,
            evidenceIds: [
              "ev_blog"
            ]
          }
        } as AISemanticDecision;

        const fastResult = {
          ...base,
          sourcePacket: {
            allEvidence: [
              {
                id:
                  "ev_blog",
                fieldHint:
                  "PRODUCT",
                rawValue:
                  "Workshop: Kỹ thuật chụp ảnh đường phố",
                sourceKind:
                  "VISIBLE_TEXT",
                sourceUrl:
                  TEST_URL,
                ownershipHint:
                  "UNKNOWN"
              }
            ]
          } as FinalVisionSemanticResult[
            "sourcePacket"
          ],
          visionPacket: {
            productRegionScreenshot: {
              fallback:
                true
            },
            compactDomEvidence:
              [],
            selectedControls:
              [],
            structuredFacts:
              []
          } as FinalVisionSemanticResult[
            "visionPacket"
          ],
          decision
        };

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastResult(
            fastResult
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,
            fastRunner,
            slowRunner
          });


        expect(
          result.disposition
        ).toBe(
          "NON_CAMERA"
        );

        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          0
        );
      }
    );


    it(
      "unclear visual with UNCERTAIN entity still invokes SLOW exactly once",
      async () => {

        const base =
          makeFastResult(
            "VALIDATED",
            "UNCERTAIN"
          );

        const fastResult = {
          ...base,
          visionPacket: {
            productRegionScreenshot: {
              fallback:
                true
            },
            compactDomEvidence:
              [],
            selectedControls:
              [],
            structuredFacts:
              []
          } as FinalVisionSemanticResult[
            "visionPacket"
          ]
        };

        const {
          fastRunner,
          slowRunner,
          slowRun
        } =
          runnersForFastResult(
            fastResult,
            makeSlowResult(
              "REVIEW"
            )
          );

        const result =
          await routeSmartUrl({
            url:
              TEST_URL,
            fastRunner,
            slowRunner
          });


        expect(
          slowRun
        ).toHaveBeenCalledTimes(
          1
        );

        expect(
          result.disposition
        ).toBe(
          "REVIEW"
        );
      }
    );

  }
);
