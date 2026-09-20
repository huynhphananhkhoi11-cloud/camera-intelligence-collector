import {
  readFile
} from "node:fs/promises";

import type {
  Page
} from "playwright";

import {
  captureAdaptiveVisualEvidence,
  type AdaptiveCaptureResult
} from "../vision/adaptiveCapture.js";

import {
  Gemini36VisualExtractor,
  type Gemini36VisualExtractionResult
} from "../ai/gemini36VisualExtractor.js";

import type {
  VisualShot
} from "../ai/visualExtractionSchema.js";

import {
  validateVisualExtraction,
  type VisualExtractionValidationResult
} from "../validation/visualExtractionValidator.js";


export interface VisualProductPipelineInput {
  readonly page:
    Page;

  readonly url:
    string;

  readonly captureDir:
    string;

  readonly extractor:
    Gemini36VisualExtractor;

  readonly maxShots?:
    number;
}


export interface VisualProductPipelineResult {
  readonly capture:
    AdaptiveCaptureResult;

  readonly extraction:
    Gemini36VisualExtractionResult;

  readonly validation:
    VisualExtractionValidationResult;
}


async function buildVisualShots(
  capture:
    AdaptiveCaptureResult
): Promise<
  VisualShot[]
> {

  if (
    capture.manifest.shots.length !==
    capture.imagePaths.length
  ) {
    throw new Error(
      "VISION_CAPTURE_PAIRING_MISMATCH: manifest shots and image paths differ."
    );
  }


  return Promise.all(
    capture.manifest.shots.map(
      async (
        shot,
        index
      ) => {

        const imagePath =
          capture.imagePaths[
            index
          ];


        if (
          !imagePath
        ) {
          throw new Error(
            "VISION_CAPTURE_IMAGE_MISSING: no image path for shot " +
            shot.shotId
          );
        }


        const bytes =
          await readFile(
            imagePath
          );


        return {
          shotId:
            shot.shotId,

          mimeType:
            "image/png" as const,

          base64:
            bytes.toString(
              "base64"
            ),

          resolution:
            shot.resolution,

          sectionLabel:
            shot.sectionLabel
        };
      }
    )
  );
}


function domainFromUrl(
  value:
    string
): string {

  return new URL(
    value
  ).hostname.replace(
    /^www\./u,
    ""
  );
}


export async function runVisualProductPipeline(
  input:
    VisualProductPipelineInput
): Promise<
  VisualProductPipelineResult
> {

  const capture =
    await captureAdaptiveVisualEvidence(
      input.page,
      {
        outputDir:
          input.captureDir,

        url:
          input.url,

        maxShots:
          input.maxShots ??
          6
      }
    );


  const shots =
    await buildVisualShots(
      capture
    );


  if (
    shots.length ===
    0
  ) {
    throw new Error(
      "VISION_CAPTURE_EMPTY: no usable screenshots were captured."
    );
  }


  const extraction =
    await input.extractor.extract({
      pageUrl:
        input.url,

      finalUrl:
        capture.manifest.finalUrl,

      shots
    });


  const validation =
    validateVisualExtraction(
      extraction.extraction,
      {
        expectedUrl:
          capture.manifest.finalUrl,

        expectedDomain:
          domainFromUrl(
            capture.manifest.finalUrl
          ),

        shotIds:
          new Set(
            capture.manifest.shots.map(
              shot =>
                shot.shotId
            )
          ),

        disposition:
          "CAMERA"
      }
    );


  return {
    capture,
    extraction,
    validation
  };
}
