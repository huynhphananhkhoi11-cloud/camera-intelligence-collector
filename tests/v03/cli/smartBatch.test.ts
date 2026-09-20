import {
  describe,
  expect,
  it,
  vi
} from "vitest";

import type {
  SemanticBatchItemResult,
  SemanticBatchReport,
  SemanticUrlProcessor
} from "../../../src/v03/bulk/semanticBatchTypes.js";

import {
  executeSmartBatch
} from "../../../src/v03/cli/smartBatch.js";


function item(
  url:
    string,

  disposition:
    SemanticBatchItemResult["disposition"],

  overrides:
    Partial<SemanticBatchItemResult> = {}
): SemanticBatchItemResult {

  return {
    url,

    disposition,

    path:
      disposition === "AI_PENDING" ||
      disposition === "ERROR"
        ? "NONE"
        : "FAST",

    model:
      null,

    decision:
      null,

    validation:
      null,

    reason:
      null,

    haltBatch:
      false,

    inputTokens:
      null,

    outputTokens:
      null,

    latencyMs:
      null,

    ...overrides
  };
}


describe(
  "executeSmartBatch",
  () => {

    it(
      "runs the sequential batch and exports exactly one workbook",
      async () => {

        const calls:
          string[] =
            [];

        const processor:
          SemanticUrlProcessor =
            async url => {

              calls.push(
                url
              );

              return item(
                url,
                "CAMERA",
                {
                  model:
                    "gemini-3.5-flash-lite",

                  inputTokens:
                    100,

                  outputTokens:
                    20,

                  latencyMs:
                    50
                }
              );
            };


        const exporter =
          vi.fn(
            async (
              _outputPath:
                string,

              _report:
                SemanticBatchReport
            ) => {}
          );


        const written:
          string[] =
            [];


        const report =
          await executeSmartBatch({
            urls: [
              " https://example.test/a ",
              "https://example.test/b",
              "https://example.test/a"
            ],

            outputPath:
              "CameraIntelligence_Smart.xlsx",

            minGapMs:
              0,

            processor,

            exportWorkbook:
              exporter,

            write:
              line =>
                written.push(
                  line
                )
          });


        expect(
          calls
        ).toEqual([
          "https://example.test/a",
          "https://example.test/b"
        ]);


        expect(
          report.summary
        ).toMatchObject({
          inputUrls:
            3,

          uniqueUrls:
            2,

          attempted:
            2,

          camera:
            2,

          halted:
            false
        });


        expect(
          exporter
        ).toHaveBeenCalledTimes(
          1
        );


        expect(
          exporter
        ).toHaveBeenCalledWith(
          "CameraIntelligence_Smart.xlsx",
          report,
          expect.objectContaining({
            provider:
              "smart-router"
          })
        );


        expect(
          written
        ).toHaveLength(
          1
        );


        expect(
          JSON.parse(
            written[0]!
          )
        ).toMatchObject({
          output:
            "CameraIntelligence_Smart.xlsx",

          summary: {
            attempted:
              2,

            camera:
              2
          }
        });
      }
    );


    it(
      "preserves quota halt so later URLs are never processed",
      async () => {

        const calls:
          string[] =
            [];


        const processor:
          SemanticUrlProcessor =
            async url => {

              calls.push(
                url
              );


              return item(
                url,
                "AI_PENDING",
                {
                  reason:
                    "GEMINI_VISION_QUOTA_STOP",

                  haltBatch:
                    true
                }
              );
            };


        let exportedReport:
          SemanticBatchReport |
          null =
            null;


        const report =
          await executeSmartBatch({
            urls: [
              "https://example.test/a",
              "https://example.test/b",
              "https://example.test/c"
            ],

            outputPath:
              "quota.xlsx",

            minGapMs:
              0,

            processor,

            exportWorkbook:
              async (
                _outputPath,
                value
              ) => {

                exportedReport =
                  value;
              },

            write:
              () => {}
          });


        expect(
          calls
        ).toEqual([
          "https://example.test/a"
        ]);


        expect(
          report.summary.halted
        ).toBe(
          true
        );


        expect(
          report.summary.attempted
        ).toBe(
          1
        );


        expect(
          report.items
            .slice(
              1
            )
            .map(
              value =>
                value.reason
            )
        ).toEqual([
          "SKIPPED_AFTER_QUOTA_STOP",
          "SKIPPED_AFTER_QUOTA_STOP"
        ]);


        expect(
          exportedReport
        ).toBe(
          report
        );
      }
    );
  }
);
