import {
  collectProductObservationsFromHtml
} from "../observations/observationCollector.js";

import {
  buildEvidencePacket
} from "./evidencePacket.js";

import type {
  EvidencePacket
} from "./evidenceTypes.js";

import {
  validateSemanticDecision
} from "./groundingValidator.js";

import {
  OllamaSemanticProvider
} from "./ollamaSemanticProvider.js";

import {
  doctorRuntime,
  memorySnapshot,
  selectInstalledModel,
  type RuntimeDoctorReport
} from "./runtimeDoctor.js";

import type {
  AISemanticDecision,
  SemanticValidationResult
} from "./semanticContracts.js";

import {
  VisualEvidenceCapture
} from "./visualEvidenceCapture.js";


export interface HumanLikeReaderOptions {
  readonly model?:
    string;

  readonly ollamaBaseUrl?:
    string;

  readonly headless?:
    boolean;

  readonly timeoutMs?:
    number;

  readonly contextLength?:
    number;
}


export interface HumanReadRuntimeMetrics {
  readonly freeRamBeforeBytes:
    number;

  readonly freeRamAfterBytes:
    number;

  readonly reserveRamBytes:
    number;

  readonly totalDurationMs:
    number |
    null;

  readonly loadDurationMs:
    number |
    null;

  readonly promptEvalCount:
    number |
    null;

  readonly evalCount:
    number |
    null;
}


export interface HumanReadResult {
  readonly url:
    string;

  readonly finalUrl:
    string |
    null;

  readonly model:
    string |
    null;

  readonly doctor:
    RuntimeDoctorReport;

  readonly packet:
    EvidencePacket |
    null;

  readonly decision:
    AISemanticDecision |
    null;

  readonly validation:
    SemanticValidationResult;

  readonly runtime:
    HumanReadRuntimeMetrics |
    null;

  readonly error:
    string |
    null;
}


export class HumanLikeProductReader {
  private readonly requestedModel:
    string;


  private readonly ollamaBaseUrl:
    string;


  private readonly capture:
    VisualEvidenceCapture;


  private readonly provider:
    OllamaSemanticProvider;


  constructor(
    options:
      HumanLikeReaderOptions = {}
  ) {

    this.requestedModel =
      options.model ??
      "auto";


    this.ollamaBaseUrl =
      options.ollamaBaseUrl ??
      "http://127.0.0.1:11434";


    this.capture =
      new VisualEvidenceCapture({
        headless:
          options.headless ??
          true
      });


    this.provider =
      new OllamaSemanticProvider({
        baseUrl:
          this.ollamaBaseUrl,

        timeoutMs:
          options.timeoutMs,

        contextLength:
          options.contextLength
      });
  }


  async read(
    url:
      string
  ):
    Promise<
      HumanReadResult
    > {

    const doctor =
      await doctorRuntime(
        this.ollamaBaseUrl
      );


    let model:
      string |
      null =
        null;


    let finalUrl:
      string |
      null =
        null;


    let packet:
      EvidencePacket |
      null =
        null;


    try {

      model =
        selectInstalledModel(
          doctor,
          this.requestedModel
        ).name;


      const captured =
        await this.capture.capture(
          url
        );


      finalUrl =
        captured.finalUrl;


      const observations =
        collectProductObservationsFromHtml(
          captured.renderedHtml,
          url,
          captured.finalUrl
        );


      packet =
        buildEvidencePacket({
          pageUrl:
            url,

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


      const before =
        memorySnapshot();


      const analyzed =
        await this.provider.analyze(
          packet,
          model
        );


      const after =
        memorySnapshot();


      const validation =
        validateSemanticDecision(
          packet,
          analyzed.decision
        );


      return {
        url,

        finalUrl:
          captured.finalUrl,

        model:
          analyzed.model,

        doctor,

        packet,

        decision:
          analyzed.decision,

        validation,

        runtime: {
          freeRamBeforeBytes:
            before.freeRamBytes,

          freeRamAfterBytes:
            after.freeRamBytes,

          reserveRamBytes:
            before.reserveRamBytes,

          totalDurationMs:
            analyzed.totalDurationMs,

          loadDurationMs:
            analyzed.loadDurationMs,

          promptEvalCount:
            analyzed.promptEvalCount,

          evalCount:
            analyzed.evalCount
        },

        error:
          null
      };
    }
    catch (
      error
    ) {

      return {
        url,

        finalUrl,

        model,

        doctor,

        packet,

        decision:
          null,

        validation: {
          status:
            "AI_UNRESOLVED",

          issues: [
            {
              code:
                "AI_UNRESOLVED",

              message:
                error instanceof
                  Error
                  ? error.message
                  : String(
                      error
                    )
            }
          ]
        },

        runtime:
          null,

        error:
          error instanceof
            Error
            ? error.message
            : String(
                error
              )
      };
    }
  }
}
