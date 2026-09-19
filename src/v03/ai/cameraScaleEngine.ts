import {
  resolve
} from "node:path";

import {
  collectProductObservationsFromHtml
} from "../observations/observationCollector.js";

import {
  qualifyProductDetailPage
} from "../entities/productPageQualification.js";

import {
  MultiSourceDiscoveryHub
} from "../discovery/multiSourceDiscoveryHub.js";

import type {
  UrlDiscoveryEvidence
} from "../discovery/multiSourceDiscoveryTypes.js";

import {
  buildEvidencePacket
} from "./evidencePacket.js";

import {
  BatchVisualEvidenceCapture
} from "./batchVisualEvidenceCapture.js";

import {
  decideCameraCandidate
} from "./cameraCandidateGate.js";

import {
  EvidenceSpool,
  SpoolQuotaExceededError,
  type SpooledPacketRef
} from "./evidenceSpool.js";

import {
  validateSemanticDecision
} from "./groundingValidator.js";

import {
  OllamaSemanticProvider
} from "./ollamaSemanticProvider.js";

import {
  doctorRuntime,
  selectInstalledModel
} from "./runtimeDoctor.js";

import {
  exportScaleWorkbookAtomic,
  type ScaleCameraRow,
  type ScaleExcludedRow,
  type ScaleReviewRow
} from "./scaleWorkbookExporter.js";


export interface CameraScaleEngineOptions {
  readonly rootUrl:
    string;

  readonly outputPath:
    string;

  readonly model?:
    string;

  readonly ollamaBaseUrl?:
    string;

  readonly maxCandidates?:
    number;

  readonly batchSize?:
    number;

  readonly browseBudgetMs?:
    number;

  readonly headless?:
    boolean;

  readonly runRoot?:
    string;

  readonly keepTempOnSuccess?:
    boolean;

  readonly writeInfo?:
    (
      message:
        string
    ) =>
      void;
}


export interface CameraScaleEngineResult {
  readonly outputPath:
    string;

  readonly discovered:
    number;

  readonly cameras:
    number;

  readonly review:
    number;

  readonly excluded:
    number;

  readonly errors:
    number;
}


function positiveInteger(
  value:
    number,
  name:
    string
): number {

  if (
    !Number.isInteger(
      value
    ) ||
    value <=
      0
  ) {
    throw new Error(
      name +
      " must be a positive integer."
    );
  }


  return value;
}


function evidenceByUrl(
  evidence:
    readonly UrlDiscoveryEvidence[]
): Map<
  string,
  UrlDiscoveryEvidence[]
> {

  const output =
    new Map<
      string,
      UrlDiscoveryEvidence[]
    >();


  for (
    const item
    of evidence
  ) {

    const list =
      output.get(
        item.url
      ) ??
      [];


    list.push(
      item
    );


    output.set(
      item.url,
      list
    );
  }


  return output;
}


function chunks<T>(
  values:
    readonly T[],
  size:
    number
): T[][] {

  const output:
    T[][] =
      [];


  for (
    let index =
      0;
    index <
      values.length;
    index +=
      size
  ) {
    output.push(
      values.slice(
        index,
        index +
        size
      )
    );
  }


  return output;
}


function sleep(
  ms:
    number
):
  Promise<void> {

  return new Promise(
    resolvePromise =>
      setTimeout(
        resolvePromise,
        ms
      )
  );
}


function isObviousNonHtmlResource(
  value:
    string
): boolean {

  try {

    const url =
      new URL(
        value
      );


    return /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|tiff?|webp|css|m?js|map|eot|otf|ttf|woff2?|pdf|zip|rar|7z|gz|mp3|m4a|wav|ogg|mp4|m4v|mov|avi|webm)$/iu
      .test(
        url.pathname
      );
  }
  catch {
    return true;
  }
}


export class CameraScaleEngine {
  private readonly options:
    Required<
      Pick<
        CameraScaleEngineOptions,
        | "model"
        | "ollamaBaseUrl"
        | "maxCandidates"
        | "batchSize"
        | "browseBudgetMs"
        | "headless"
        | "keepTempOnSuccess"
      >
    > &
    CameraScaleEngineOptions;


  private readonly writeInfo:
    (
      message:
        string
    ) =>
      void;


  constructor(
    options:
      CameraScaleEngineOptions
  ) {

    this.options = {
      ...options,

      model:
        options.model ??
        "qwen3-vl:4b-instruct-q4_K_M",

      ollamaBaseUrl:
        options.ollamaBaseUrl ??
        "http://127.0.0.1:11434",

      maxCandidates:
        positiveInteger(
          options.maxCandidates ??
          5_000,
          "maxCandidates"
        ),

      batchSize:
        positiveInteger(
          options.batchSize ??
          30,
          "batchSize"
        ),

      browseBudgetMs:
        positiveInteger(
          options.browseBudgetMs ??
          45_000,
          "browseBudgetMs"
        ),

      headless:
        options.headless ??
        true,

      keepTempOnSuccess:
        options.keepTempOnSuccess ??
        false
    };


    this.writeInfo =
      options.writeInfo ??
      (
        message =>
          console.log(
            message
          )
      );
  }


  async run():
    Promise<
      CameraScaleEngineResult
    > {

    const rootUrl =
      new URL(
        this.options.rootUrl
      ).toString();


    const runId =
      "run_" +
      Date.now();


    const runRoot =
      resolve(
        this.options.runRoot ??
        (
          "data/runs/" +
          runId
        )
      );


    const spool =
      new EvidenceSpool({
        rootDir:
          runRoot
      });


    await spool.init();


    const cameras:
      ScaleCameraRow[] =
        [];


    const reviews:
      ScaleReviewRow[] =
        [];


    const excluded:
      ScaleExcludedRow[] =
        [];


    let errors =
      0;


    let qualifiedProductPages =
      0;


    let validatedNonCameras =
      0;


    let attemptedDetail =
      0;


    let clearNonCameraSkipped =
      0;


    this.writeInfo(
      "[1/6] Discovering catalog URLs..."
    );


    const discovery =
      await new MultiSourceDiscoveryHub({
        maxCandidates:
          this.options.maxCandidates
      }).discover(
        rootUrl
      );


    const byUrl =
      evidenceByUrl(
        discovery.evidence
      );


    const routed =
      discovery.allDiscoveredUrls
        .slice(
          0,
          this.options.maxCandidates
        )
        .map(
          url => ({
            url,

            decision:
              decideCameraCandidate(
                url,
                byUrl.get(
                  url
                ) ??
                []
              )
          })
        );


    const detailQueue:
      string[] =
        [];


    for (
      const item
      of routed
    ) {

      if (
        isObviousNonHtmlResource(
          item.url
        )
      ) {

        excluded.push({
          url:
            item.url,

          reason:
            "non_html_resource"
        });


        continue;
      }


      if (
        item.decision.route ===
          "CLEAR_NON_CAMERA"
      ) {

        clearNonCameraSkipped +=
          1;


        excluded.push({
          url:
            item.url,

          reason:
            "early_clear_non_camera: " +
            item.decision.reasons.join(
              "; "
            )
        });


        continue;
      }


      detailQueue.push(
        item.url
      );
    }


    this.writeInfo(
      "[2/6] Early routing complete. discovered=" +
      discovery.allDiscoveredUrls.length +
      " ai/detail candidates=" +
      detailQueue.length +
      " clear non-camera skipped=" +
      clearNonCameraSkipped
    );


    const doctor =
      await doctorRuntime(
        this.options.ollamaBaseUrl
      );


    const model =
      selectInstalledModel(
        doctor,
        this.options.model
      ).name;


    const provider =
      new OllamaSemanticProvider({
        baseUrl:
          this.options.ollamaBaseUrl
      });


    const capture =
      new BatchVisualEvidenceCapture({
        headless:
          this.options.headless,

        browseBudgetMs:
          this.options.browseBudgetMs,

        writeInfo:
          this.writeInfo
      });


    const batches =
      chunks(
        detailQueue,
        this.options.batchSize
      );


    try {

      for (
        let batchIndex =
          0;
        batchIndex <
          batches.length;
        batchIndex +=
          1
      ) {

        const batch =
          batches[
            batchIndex
          ]!;


        this.writeInfo(
          "[3/6] Capture batch " +
          (
            batchIndex +
            1
          ) +
          "/" +
          batches.length +
          " (" +
          batch.length +
          " URLs)"
        );


        const references:
          SpooledPacketRef[] =
            [];


        await capture.run(
          batch,
          async captured => {

            attemptedDetail +=
              1;


            const observations =
              collectProductObservationsFromHtml(
                captured.renderedHtml,
                captured.requestedUrl,
                captured.finalUrl
              );


            const qualification =
              qualifyProductDetailPage(
                observations
              );


            if (
              !qualification.isProductDetail
            ) {

              excluded.push({
                url:
                  captured.finalUrl,

                reason:
                  "not_product_detail: " +
                  qualification.reasons.join(
                    ", "
                  )
              });


              return;
            }


            qualifiedProductPages +=
              1;


            const packet =
              buildEvidencePacket({
                pageUrl:
                  captured.requestedUrl,

                finalUrl:
                  captured.finalUrl,

                observations:
                  observations.observations,

                primaryRegionText:
                  captured.primaryRegionText,

                controls:
                  captured.controls,

                evidenceBoard:
                  captured.evidenceBoard
              });


            try {

              references.push(
                await spool.writePacket(
                  packet
                )
              );
            }
            catch (
              error
            ) {

              if (
                error instanceof
                  SpoolQuotaExceededError
              ) {

                reviews.push({
                  url:
                    captured.finalUrl,

                  model:
                    null,

                  status:
                    "SPOOL_QUOTA",

                  reason:
                    error.message
                });


                return;
              }


              throw error;
            }
          },
          async failure => {

            errors +=
              1;


            reviews.push({
              url:
                failure.requestedUrl,

              model:
                null,

              status:
                "CAPTURE_ERROR",

              reason:
                failure.message
            });
          }
        );


        /*
         * Browser/context is closed here before the VLM starts.
         * Give Windows a small cooldown so Chromium working sets can
         * be returned before llama-server expands.
         */
        await sleep(
          2_000
        );


        this.writeInfo(
          "[4/6] AI batch " +
          (
            batchIndex +
            1
          ) +
          "/" +
          batches.length +
          " (" +
          references.length +
          " qualified packets)"
        );


        for (
          let packetIndex =
            0;
          packetIndex <
            references.length;
          packetIndex +=
            1
        ) {

          const reference =
            references[
              packetIndex
            ]!;


          const packet =
            await spool.readPacket(
              reference
            );


          this.writeInfo(
            "[AI " +
            (
              packetIndex +
              1
            ) +
            "/" +
            references.length +
            "] " +
            packet.finalUrl
          );


          try {

            const analyzed =
              await provider.analyze(
                packet,
                model
              );


            const validation =
              validateSemanticDecision(
                packet,
                analyzed.decision
              );


            if (
              validation.status ===
                "VALIDATED" &&
              analyzed.decision.entity.type ===
                "CAMERA"
            ) {

              cameras.push({
                url:
                  packet.finalUrl,

                model:
                  analyzed.model,

                decision:
                  analyzed.decision,

                validation
              });


              await spool.delete(
                reference
              );
            }
            else if (
              validation.status ===
                "VALIDATED" &&
              analyzed.decision.entity.type ===
                "NON_CAMERA"
            ) {

              validatedNonCameras +=
                1;


              excluded.push({
                url:
                  packet.finalUrl,

                reason:
                  "AI validated non-camera: " +
                  analyzed.decision.entity.subtype
              });


              await spool.delete(
                reference
              );
            }
            else {

              reviews.push({
                url:
                  packet.finalUrl,

                model:
                  analyzed.model,

                status:
                  validation.status,

                reason:
                  validation.issues
                    .map(
                      issue =>
                        issue.code +
                        ": " +
                        issue.message
                    )
                    .join(
                      " | "
                    )
              });


              await spool.retainForReview(
                reference
              );
            }
          }
          catch (
            error
          ) {

            errors +=
              1;


            reviews.push({
              url:
                packet.finalUrl,

              model,

              status:
                "AI_UNRESOLVED",

              reason:
                error instanceof
                  Error
                  ? error.message
                  : String(
                      error
                    )
            });


            await spool.retainForReview(
              reference
            );
          }
        }


        /*
         * Keep the model resident within the batch, then explicitly
         * unload at the batch boundary to return RAM before the next
         * browser acquisition phase.
         */
        await provider.unload(
          model
        );


        await sleep(
          2_000
        );


        const usage =
          await spool.usage();


        this.writeInfo(
          "[BATCH DONE] temp=" +
          Math.round(
            usage.usedBytes /
            (
              1024 *
              1024
            )
          ) +
          "MB quota=" +
          Math.round(
            usage.quotaBytes /
            (
              1024 *
              1024
            )
          ) +
          "MB cameras=" +
          cameras.length +
          " review=" +
          reviews.length
        );
      }


      this.writeInfo(
        "[5/6] Writing and verifying final Excel..."
      );


      await exportScaleWorkbookAtomic(
        this.options.outputPath,
        cameras,
        reviews,
        excluded,
        {
          rootUrl,
          discovered:
            discovery.allDiscoveredUrls.length,

          clearNonCameraSkipped,

          attemptedDetail,

          qualifiedProductPages,

          validatedCameras:
            cameras.length,

          validatedNonCameras,

          review:
            reviews.length,

          errors,

          model
        }
      );


      this.writeInfo(
        "[6/6] Final Excel verified."
      );


      if (
        !this.options.keepTempOnSuccess
      ) {

        this.writeInfo(
          "Cleaning temporary evidence and returning disk space..."
        );


        await spool.cleanupAll();
      }


      return {
        outputPath:
          this.options.outputPath,

        discovered:
          discovery.allDiscoveredUrls.length,

        cameras:
          cameras.length,

        review:
          reviews.length,

        excluded:
          excluded.length,

        errors
      };
    }
    catch (
      error
    ) {

      /*
       * On failure we intentionally KEEP the spool for resume/debug.
       * Never destroy recoverable work after a failed run.
       */
      try {
        await provider.unload(
          model
        );
      }
      catch {
        // Best effort RAM release.
      }


      throw error;
    }
  }
}
