import {
  BrowserAgentSession
} from "./browserAgentSession.js";

import {
  analyzeFinalEvidenceLow,
  type FinalSemanticLowResult
} from "./semanticFinalizer.js";

import {
  GeminiRateLimitError,
  GeminiSemanticProvider
} from "../ai/geminiSemanticProvider.js";

import type {
  EvidencePacket
} from "../ai/evidenceTypes.js";

import type {
  SlowAgentResult,
  SlowRunner
} from "./fastSlowRouter.js";


const DEFAULT_SLOW_MODEL =
  "gemini-3.6-flash";

const DEFAULT_SEMANTIC_TIMEOUT_MS =
  60_000;


export interface SlowBrowserSession {
  run(
    url:
      string,

    finalizeBeforeClose?:
      (
        packet:
          EvidencePacket
      ) =>
        Promise<void>
  ):
    Promise<unknown>;
}


export type SlowSessionFactory =
  () =>
    SlowBrowserSession;


export type SlowSemanticAnalyzer =
  (
    packet:
      EvidencePacket
  ) =>
    Promise<
      FinalSemanticLowResult
    >;


export interface BrowserSlowAgentRunnerOptions {
  readonly apiKey:
    string;

  readonly model?:
    string;

  readonly headless?:
    boolean;

  readonly maxPlannerTurns?:
    number;

  readonly timeoutMs?:
    number;

  readonly createSession?:
    SlowSessionFactory;

  readonly analyzeLow?:
    SlowSemanticAnalyzer;
}


function errorMessage(
  error:
    unknown
): string {

  return error instanceof
    Error
      ? error.message
      : String(
          error
        );
}


function validationReason(
  semantic:
    FinalSemanticLowResult
): string {

  if (
    semantic.decision
      .entity
      .type ===
        "UNCERTAIN"
  ) {

    return "SLOW_ENTITY_UNCERTAIN";
  }


  const issueCodes =
    semantic.validation
      .issues
      .map(
        issue =>
          issue.code
      )
      .filter(
        code =>
          code.length >
          0
      );


  return [
    "SLOW_VALIDATION_" +
      semantic.validation.status,

    ...issueCodes
  ].join(
    ":"
  );
}


function semanticResultToSlowResult(
  semantic:
    FinalSemanticLowResult
): SlowAgentResult {

  const entityType =
    semantic.decision
      .entity
      .type;


  if (
    semantic.validation.status ===
      "VALIDATED" &&
    (
      entityType ===
        "CAMERA" ||
      entityType ===
        "NON_CAMERA"
    )
  ) {

    return {
      disposition:
        entityType,

      decision:
        semantic.decision,

      validation:
        semantic.validation,

      model:
        semantic.providerResult.model,

      attempts:
        1,

      latencyMs:
        semantic.providerResult
          .totalDurationMs,

      inputTokens:
        semantic.providerResult
          .promptEvalCount,

      outputTokens:
        semantic.providerResult
          .evalCount,

      reason:
        null,

      haltBatch:
        false
    };
  }


  return {
    disposition:
      "REVIEW",

    decision:
      semantic.decision,

    validation:
      semantic.validation,

    model:
      semantic.providerResult.model,

    attempts:
      1,

    latencyMs:
      semantic.providerResult
        .totalDurationMs,

    inputTokens:
      semantic.providerResult
        .promptEvalCount,

    outputTokens:
      semantic.providerResult
        .evalCount,

    reason:
      validationReason(
        semantic
      ),

    haltBatch:
      false
  };
}


function pendingResult(
  reason:
    string,

  attempts:
    number
): SlowAgentResult {

  return {
    disposition:
      "AI_PENDING",

    decision:
      null,

    validation:
      null,

    model:
      null,

    attempts,

    latencyMs:
      null,

    inputTokens:
      null,

    outputTokens:
      null,

    reason,

    haltBatch:
      true
  };
}


function errorResult(
  reason:
    string,

  attempts:
    number
): SlowAgentResult {

  return {
    disposition:
      "ERROR",

    decision:
      null,

    validation:
      null,

    model:
      null,

    attempts,

    latencyMs:
      null,

    inputTokens:
      null,

    outputTokens:
      null,

    reason,

    haltBatch:
      false
  };
}


function isQuotaError(
  error:
    unknown
): boolean {

  if (
    error instanceof
      GeminiRateLimitError
  ) {

    return true;
  }


  const message =
    errorMessage(
      error
    );


  return (
    message.includes(
      "429"
    ) ||
    message
      .toLowerCase()
      .includes(
        "rate limit"
      )
  );
}


export class BrowserSlowAgentRunner
implements SlowRunner {

  private readonly createSession:
    SlowSessionFactory;

  private readonly analyzeLow:
    SlowSemanticAnalyzer;


  constructor(
    options:
      BrowserSlowAgentRunnerOptions
  ) {

    const model =
      options.model ??
      DEFAULT_SLOW_MODEL;

    const timeoutMs =
      options.timeoutMs ??
      DEFAULT_SEMANTIC_TIMEOUT_MS;


    this.createSession =
      options.createSession ??
      (
        () =>
          new BrowserAgentSession({
            apiKey:
              options.apiKey,

            model,

            headless:
              options.headless,

            maxPlannerTurns:
              options.maxPlannerTurns
          })
      );


    if (
      options.analyzeLow
    ) {

      this.analyzeLow =
        options.analyzeLow;
    }
    else {

      /*
       * Preserve the existing agent-browse semantic policy:
       * semantic LOW runs once at orchestration level.
       *
       * Do not introduce an additional retry loop here.
       */
      const provider =
        new GeminiSemanticProvider({
          apiKey:
            options.apiKey,

          timeoutMs,

          maxRetries:
            0
        });


      this.analyzeLow =
        (
          packet:
            EvidencePacket
        ) =>
          analyzeFinalEvidenceLow({
            packet,

            provider,

            model,

            timeoutMs
          });
    }
  }


  async run(
    url:
      string
  ): Promise<
    SlowAgentResult
  > {

    let semanticAttempts =
      0;

    let semantic:
      FinalSemanticLowResult |
      null =
        null;


    try {

      const session =
        this.createSession();


      await session.run(
        url,

        async (
          packet:
            EvidencePacket
        ) => {

          semanticAttempts +=
            1;


          semantic =
            await this.analyzeLow(
              packet
            );
        }
      );


      if (
        !semantic
      ) {

        return errorResult(
          "SLOW_SEMANTIC_NOT_FINALIZED",
          semanticAttempts
        );
      }


      return semanticResultToSlowResult(
        semantic
      );
    }
    catch (
      error
    ) {

      const reason =
        errorMessage(
          error
        );


      if (
        isQuotaError(
          error
        )
      ) {

        return pendingResult(
          reason,
          semanticAttempts
        );
      }


      return errorResult(
        reason,
        semanticAttempts
      );
    }
  }
}
