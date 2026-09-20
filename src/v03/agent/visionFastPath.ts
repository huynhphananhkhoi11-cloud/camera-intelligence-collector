import type {
  Page
} from "playwright";

import {
  validateSemanticDecision
} from "../ai/groundingValidator.js";

import type {
  GeminiVisionEvidenceInput,
  GeminiVisionResult
} from "../ai/geminiVisionProvider.js";

import type {
  EvidencePacket
} from "../ai/evidenceTypes.js";

import type {
  AISemanticDecision,
  SemanticValidationResult
} from "../ai/semanticContracts.js";

import {
  captureFinalEvidencePacket
} from "./browserAgentSession.js";

import {
  captureVisionEvidencePacket
} from "../vision/visionEvidenceCapture.js";

import type {
  VisionEvidencePacket
} from "../vision/visionEvidenceTypes.js";


export interface VisionSemanticAnalyzer {
  analyze(
    input:
      GeminiVisionEvidenceInput
  ):
    Promise<
      GeminiVisionResult
    >;
}


export interface FinalVisionSemanticResult {
  readonly sourcePacket:
    EvidencePacket;

  readonly visionPacket:
    VisionEvidencePacket;

  readonly decision:
    AISemanticDecision;

  readonly validation:
    SemanticValidationResult;

  readonly providerResult:
    GeminiVisionResult;
}


export function toGeminiVisionEvidenceInput(
  visionPacket:
    VisionEvidencePacket
): GeminiVisionEvidenceInput {

  return {
    screenshot: {
      mimeType:
        visionPacket
          .productRegionScreenshot
          .mimeType,

      base64:
        visionPacket
          .productRegionScreenshot
          .base64,

      evidenceId:
        visionPacket
          .productRegionScreenshot
          .imageId
    },

    compactDomEvidence:
      visionPacket
        .compactDomEvidence,

    selectedControls:
      visionPacket
        .selectedControls,

    structuredFacts:
      visionPacket
        .structuredFacts
  };
}


function assertPacketLineage(
  sourcePacket:
    EvidencePacket,
  visionPacket:
    VisionEvidencePacket
): void {

  if (
    visionPacket
      .sourceEvidencePacketId !==
    sourcePacket.packetId
  ) {
    throw new Error(
      "VISION_PACKET_SOURCE_MISMATCH: " +
      visionPacket.sourceEvidencePacketId +
      " != " +
      sourcePacket.packetId
    );
  }


  if (
    visionPacket.pageUrl !==
      sourcePacket.pageUrl ||
    visionPacket.finalUrl !==
      sourcePacket.finalUrl
  ) {
    throw new Error(
      "VISION_PACKET_URL_MISMATCH"
    );
  }
}


export async function analyzeFinalVisionEvidence(
  input:
    {
      readonly sourcePacket:
        EvidencePacket;

      readonly visionPacket:
        VisionEvidencePacket;

      readonly provider:
        VisionSemanticAnalyzer;

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
  FinalVisionSemanticResult
> {

  assertPacketLineage(
    input.sourcePacket,
    input.visionPacket
  );


  const providerResult =
    await input.provider.analyze(
      toGeminiVisionEvidenceInput(
        input.visionPacket
      )
    );


  const validation =
    (
      input.validate ??
      validateSemanticDecision
    )(
      input.sourcePacket,
      providerResult.decision
    );


  return {
    sourcePacket:
      input.sourcePacket,

    visionPacket:
      input.visionPacket,

    decision:
      providerResult.decision,

    validation,

    providerResult
  };
}


export async function captureAndAnalyzeVisionPage(
  input:
    {
      readonly page:
        Page;

      readonly requestedUrl:
        string;

      readonly provider:
        VisionSemanticAnalyzer;

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
  FinalVisionSemanticResult
> {

  const sourcePacket =
    await captureFinalEvidencePacket(
      input.page,
      input.requestedUrl
    );


  const visionPacket =
    await captureVisionEvidencePacket(
      input.page,
      sourcePacket
    );


  return analyzeFinalVisionEvidence({
    sourcePacket,
    visionPacket,
    provider:
      input.provider,
    validate:
      input.validate
  });
}
