import {
  exportScaleWorkbookAtomic,
  type ScaleCameraRow,
  type ScaleExcludedRow,
  type ScaleReviewRow,
  type ScaleRunSummary
} from "../ai/scaleWorkbookExporter.js";

import type {
  SemanticBatchItemResult,
  SemanticBatchReport
} from "../bulk/semanticBatchTypes.js";


export interface SemanticBatchWorkbookOptions {
  readonly rootUrl?:
    string;

  readonly provider?:
    string;
}


function validationReason(
  item:
    SemanticBatchItemResult
): string {

  if (
    item.reason
  ) {
    return item.reason;
  }


  const issues =
    item.validation
      ?.issues ?? [];


  if (
    issues.length >
      0
  ) {
    return issues
      .map(
        issue =>
          issue.code +
          ": " +
          issue.message
      )
      .join(
        " | "
      );
  }


  return item.disposition;
}


function modelSummary(
  report:
    SemanticBatchReport
): string {

  const models =
    [
      ...new Set(
        report.items
          .map(
            item =>
              item.model
          )
          .filter(
            (
              model
            ): model is
              string =>
                typeof model ===
                  "string" &&
                model.length >
                  0
          )
      )
    ];


  if (
    models.length ===
      0
  ) {
    return "none";
  }


  if (
    models.length ===
      1
  ) {
    return models[0]!;
  }


  return "mixed";
}


export async function exportSemanticBatchWorkbook(
  outputPath:
    string,
  report:
    SemanticBatchReport,
  options:
    SemanticBatchWorkbookOptions = {}
): Promise<void> {

  const cameras:
    ScaleCameraRow[] =
      [];

  const reviews:
    ScaleReviewRow[] =
      [];

  const excluded:
    ScaleExcludedRow[] =
      [];

  let mappingErrors =
    0;


  for (
    const item
    of report.items
  ) {

    switch (
      item.disposition
    ) {

      case "CAMERA": {

        if (
          item.decision &&
          item.validation
        ) {
          cameras.push({
            url:
              item.url,

            model:
              item.model ??
              "unknown",

            decision:
              item.decision,

            validation:
              item.validation
          });

          break;
        }


        mappingErrors +=
          1;

        reviews.push({
          url:
            item.url,

          model:
            item.model,

          status:
            "ERROR",

          reason:
            item.reason ??
            "MISSING_CAMERA_DECISION_OR_VALIDATION"
        });

        break;
      }


      case "NON_CAMERA": {

        excluded.push({
          url:
            item.url,

          reason:
            "validated non-camera"
        });

        break;
      }


      case "REVIEW":
      case "AI_PENDING":
      case "ERROR": {

        reviews.push({
          url:
            item.url,

          model:
            item.model,

          status:
            item.disposition,

          reason:
            validationReason(
              item
            )
        });

        break;
      }
    }
  }


  const summary:
    ScaleRunSummary = {
      rootUrl:
        options.rootUrl ??
        "semantic-batch",

      provider:
        options.provider ??
        "smart-router",

      discovered:
        report.summary.uniqueUrls,

      clearNonCameraSkipped:
        0,

      clearNonProductSkipped:
        0,

      deterministicNonCameraSkipped:
        0,

      attemptedDetail:
        report.summary.attempted,

      qualifiedProductPages:
        report.summary.attempted,

      validatedCameras:
        cameras.length,

      validatedNonCameras:
        excluded.length,

      review:
        reviews.length,

      errors:
        report.summary.errors +
        mappingErrors,

      model:
        modelSummary(
          report
        )
    };


  /*
   * Reuse the existing atomic exporter. It writes to a temporary XLSX,
   * reopens it for row reconciliation, and only then renames it to the
   * requested output path.
   */
  await exportScaleWorkbookAtomic(
    outputPath,
    cameras,
    reviews,
    excluded,
    summary
  );
}
