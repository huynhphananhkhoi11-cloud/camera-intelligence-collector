import type {
  EvidencePacket
} from "../ai/evidenceTypes.js";

import {
  validateSemanticDecision
} from "../ai/groundingValidator.js";

import {
  normalizeEntityConsistency
} from "../ai/entityConsistency.js";

import type {
  GeminiAnalyzeResult
} from "../ai/geminiSemanticProvider.js";

import type {
  AISemanticDecision,
  SemanticValidationResult
} from "../ai/semanticContracts.js";


export interface LowSemanticAnalyzer {
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


export interface FinalSemanticLowResult {
  readonly decision:
    AISemanticDecision;

  readonly validation:
    SemanticValidationResult;

  readonly reasoningProfile:
    "LOW";

  readonly providerResult:
    GeminiAnalyzeResult;
}


export async function analyzeFinalEvidenceLow(
  input:
    {
      readonly packet:
        EvidencePacket;

      readonly provider:
        LowSemanticAnalyzer;

      readonly model:
        string;

      readonly timeoutMs?:
        number;

      readonly validate?:
        (
          packet:
            EvidencePacket,

          decision:
            AISemanticDecision
        ) =>
          SemanticValidationResult;
    }
): Promise<
  FinalSemanticLowResult
> {

  const providerResult =
    await input.provider.analyze(
      input.packet,
      input.model,
      input.timeoutMs,
      "low"
    );


  const decision =
    normalizeEntityConsistency(
      providerResult.decision
    );


  const validation =
    (
      input.validate ??
      validateSemanticDecision
    )(
      input.packet,
      decision
    );


  return {
    decision,

    validation,

    reasoningProfile:
      "LOW",

    providerResult
  };
}