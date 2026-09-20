import {
  GeminiVisionContractError,
  GeminiVisionQuotaError,
  GeminiVisionTransportError
} from "../ai/geminiVisionProvider.js";

import type {
  AISemanticDecision,
  SemanticValidationResult
} from "../ai/semanticContracts.js";

import type {
  FinalVisionSemanticResult
} from "./visionFastPath.js";


export type SmartPath =
  | "FAST"
  | "SLOW"
  | "NONE";


export type SmartDisposition =
  | "CAMERA"
  | "NON_CAMERA"
  | "REVIEW"
  | "AI_PENDING"
  | "ERROR";


export interface SmartRouteResult {
  readonly url:
    string;

  readonly path:
    SmartPath;

  readonly disposition:
    SmartDisposition;

  readonly decision:
    AISemanticDecision |
    null;

  readonly validation:
    SemanticValidationResult |
    null;

  readonly model:
    string |
    null;

  readonly attempts:
    number;

  readonly latencyMs:
    number |
    null;

  readonly inputTokens:
    number |
    null;

  readonly outputTokens:
    number |
    null;

  readonly reason:
    string |
    null;

  readonly haltBatch:
    boolean;
}


export interface FastRunner {
  run(
    url:
      string
  ):
    Promise<
      FinalVisionSemanticResult
    >;
}


export interface SlowAgentResult {
  readonly disposition:
    SmartDisposition;

  readonly decision:
    AISemanticDecision |
    null;

  readonly validation:
    SemanticValidationResult |
    null;

  readonly model:
    string |
    null;

  readonly attempts:
    number;

  readonly latencyMs:
    number |
    null;

  readonly inputTokens:
    number |
    null;

  readonly outputTokens:
    number |
    null;

  readonly reason:
    string |
    null;

  readonly haltBatch:
    boolean;
}


export interface SlowRunner {
  run(
    url:
      string
  ):
    Promise<
      SlowAgentResult
    >;
}


export interface SmartRouteInput {
  readonly url:
    string;

  readonly fastRunner:
    FastRunner;

  readonly slowRunner:
    SlowRunner;
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


function fastPendingResult(
  url:
    string,

  reason:
    string,

  haltBatch:
    boolean
): SmartRouteResult {

  return {
    url,

    path:
      "NONE",

    disposition:
      "AI_PENDING",

    decision:
      null,

    validation:
      null,

    model:
      null,

    attempts:
      0,

    latencyMs:
      null,

    inputTokens:
      null,

    outputTokens:
      null,

    reason,

    haltBatch
  };
}


function fastErrorResult(
  url:
    string,

  reason:
    string
): SmartRouteResult {

  return {
    url,

    path:
      "NONE",

    disposition:
      "ERROR",

    decision:
      null,

    validation:
      null,

    model:
      null,

    attempts:
      0,

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


function fastValidatedResult(
  url:
    string,

  result:
    FinalVisionSemanticResult,

  disposition:
    "CAMERA" |
    "NON_CAMERA"
): SmartRouteResult {

  return {
    url,

    path:
      "FAST",

    disposition,

    decision:
      result.decision,

    validation:
      result.validation,

    model:
      result.providerResult.model,

    attempts:
      result.providerResult.attempts,

    latencyMs:
      result.providerResult.latencyMs,

    inputTokens:
      result.providerResult
        .usage
        .inputTokens,

    outputTokens:
      result.providerResult
        .usage
        .outputTokens,

    reason:
      null,

    haltBatch:
      false
  };
}


function slowResult(
  url:
    string,

  result:
    SlowAgentResult
): SmartRouteResult {

  return {
    url,

    path:
      "SLOW",

    disposition:
      result.disposition,

    decision:
      result.decision,

    validation:
      result.validation,

    model:
      result.model,

    attempts:
      result.attempts,

    latencyMs:
      result.latencyMs,

    inputTokens:
      result.inputTokens,

    outputTokens:
      result.outputTokens,

    reason:
      result.reason,

    haltBatch:
      result.haltBatch
  };
}


function needsSlowPath(
  result:
    FinalVisionSemanticResult
): boolean {

  if (
    result.decision
      .entity
      .type ===
        "UNCERTAIN"
  ) {

    return true;
  }


  return result.validation.status !==
    "VALIDATED";
}


export async function routeSmartUrl(
  input:
    SmartRouteInput
): Promise<
  SmartRouteResult
> {

  let fastResult:
    FinalVisionSemanticResult;


  try {

    fastResult =
      await input.fastRunner.run(
        input.url
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
      error instanceof
        GeminiVisionQuotaError
    ) {

      return fastPendingResult(
        input.url,
        reason,
        true
      );
    }


    if (
      error instanceof
        GeminiVisionTransportError
    ) {

      return fastPendingResult(
        input.url,
        reason,
        false
      );
    }


    if (
      error instanceof
        GeminiVisionContractError
    ) {

      return fastErrorResult(
        input.url,
        reason
      );
    }


    /*
     * Unknown FAST errors, including generic
     * provider/auth/config failures, must never
     * become a reason to invoke SLOW.
     *
     * Fail closed as ERROR.
     */
    return fastErrorResult(
      input.url,
      reason
    );
  }


  if (
    !needsSlowPath(
      fastResult
    )
  ) {

    if (
      fastResult.decision
        .entity
        .type ===
          "CAMERA"
    ) {

      return fastValidatedResult(
        input.url,
        fastResult,
        "CAMERA"
      );
    }


    if (
      fastResult.decision
        .entity
        .type ===
          "NON_CAMERA"
    ) {

      return fastValidatedResult(
        input.url,
        fastResult,
        "NON_CAMERA"
      );
    }
  }


  /*
   * Quality/grounding insufficiency is the only
   * route from FAST into SLOW.
   *
   * Exactly one invocation. No loop here.
   */
  const slow =
    await input.slowRunner.run(
      input.url
    );


  return slowResult(
    input.url,
    slow
  );
}
