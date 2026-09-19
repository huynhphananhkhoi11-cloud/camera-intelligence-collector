import {
  validateSemanticDecision
} from "./groundingValidator.js";

import type {
  EvidencePacket
} from "./evidenceTypes.js";

import type {
  GeminiAnalyzeResult
} from "./geminiSemanticProvider.js";

import type {
  AISemanticDecision,
  SemanticValidationResult
} from "./semanticContracts.js";


export type AdaptiveReasoningProfile =
  | "LOW"
  | "MEDIUM";


export interface AdaptiveGeminiAnalyzer {
  analyze(
    packet:
      EvidencePacket,
    model:
      string,
    timeoutMsOverride?:
      number,
    thinkingLevelOverride?:
      "minimal" |
      "low" |
      "medium" |
      "high"
  ):
    Promise<GeminiAnalyzeResult>;
}


export interface AdaptiveGeminiAttempt {
  readonly reasoningProfile:
    AdaptiveReasoningProfile;

  readonly result:
    GeminiAnalyzeResult;

  readonly validation:
    SemanticValidationResult;
}


export interface AdaptiveGeminiResult {
  readonly decision:
    AISemanticDecision;

  readonly validation:
    SemanticValidationResult;

  readonly reasoningProfile:
    AdaptiveReasoningProfile;

  readonly providerResult:
    GeminiAnalyzeResult;

  readonly attempts:
    readonly AdaptiveGeminiAttempt[];
}


export interface AdaptiveGeminiOptions {
  readonly packet:
    EvidencePacket;

  readonly provider:
    AdaptiveGeminiAnalyzer;

  readonly model:
    string;

  readonly timeoutMs?:
    number;
}


function attempt(
  reasoningProfile:
    AdaptiveReasoningProfile,
  result:
    GeminiAnalyzeResult,
  validation:
    SemanticValidationResult
): AdaptiveGeminiAttempt {

  return {
    reasoningProfile,
    result,
    validation
  };
}


export async function analyzeWithAdaptiveGemini(
  options:
    AdaptiveGeminiOptions
): Promise<AdaptiveGeminiResult> {

  /*
   * PASS A — LOW.
   *
   * Every page starts here. The validator, not a heuristic guess,
   * decides whether more reasoning is justified.
   */
  const lowResult =
    await options.provider.analyze(
      options.packet,
      options.model,
      options.timeoutMs,
      "low"
    );


  const lowValidation =
    validateSemanticDecision(
      options.packet,
      lowResult.decision
    );


  const attempts:
    AdaptiveGeminiAttempt[] = [
      attempt(
        "LOW",
        lowResult,
        lowValidation
      )
    ];


  if (
    lowValidation.status ===
      "VALIDATED"
  ) {
    return {
      decision:
        lowResult.decision,

      validation:
        lowValidation,

      reasoningProfile:
        "LOW",

      providerResult:
        lowResult,

      attempts
    };
  }


  /*
   * PASS B — MEDIUM, exactly once.
   *
   * Completeness, grounding or semantic quality failure may justify
   * more reasoning. We never loop indefinitely.
   */
  const mediumResult =
    await options.provider.analyze(
      options.packet,
      options.model,
      options.timeoutMs,
      "medium"
    );


  const mediumValidation =
    validateSemanticDecision(
      options.packet,
      mediumResult.decision
    );


  attempts.push(
    attempt(
      "MEDIUM",
      mediumResult,
      mediumValidation
    )
  );


  return {
    decision:
      mediumResult.decision,

    validation:
      mediumValidation,

    reasoningProfile:
      "MEDIUM",

    providerResult:
      mediumResult,

    attempts
  };
}