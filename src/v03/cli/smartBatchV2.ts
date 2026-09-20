#!/usr/bin/env node

import {
  readFile,
  writeFile
} from "node:fs/promises";

import {
  join,
  resolve
} from "node:path";

import {
  pathToFileURL
} from "node:url";

import {
  Command
} from "commander";

import {
  chromium
} from "playwright";

import {
  Gemini36VisualExtractor
} from "../ai/gemini36VisualExtractor.js";

import {
  deterministicSmartPreflight
} from "../agent/smartPreflight.js";

import {
  exportCamera13WorkbookAtomic
} from "../export/camera13Workbook.js";

import type {
  VisualExtractionValidationResult
} from "../validation/visualExtractionValidator.js";

import {
  runVisualProductPipeline,
  type VisualProductPipelineResult
} from "../pipeline/visualProductPipeline.js";


export type SmartBatchV2ItemStatus =
  | "SKIPPED_NON_CAMERA"
  | "VALIDATED"
  | "REVIEW"
  | "ERROR";


export interface SmartBatchV2Item {
  readonly index:
    number;

  readonly url:
    string;

  readonly status:
    SmartBatchV2ItemStatus;

  readonly reason?:
    string;

  readonly finalUrl?:
    string;

  readonly captureManifestPath?:
    string;

  readonly latencyMs?:
    number;

  readonly error?:
    string;
}


export interface SmartBatchV2Report {
  readonly runId:
    string;

  readonly items:
    readonly SmartBatchV2Item[];

  readonly summary: {
    readonly total:
      number;

    readonly validated:
      number;

    readonly review:
      number;

    readonly skippedNonCamera:
      number;

    readonly errors:
      number;
  };
}


export type VisualUrlProcessor =
  (
    url:
      string,
    index:
      number
  ) =>
    Promise<
      VisualProductPipelineResult
    >;


export interface ExecuteSmartBatchV2Input {
  readonly urls:
    readonly string[];

  readonly outputPath:
    string;

  readonly processor:
    VisualUrlProcessor;

  readonly runId?:
    string;

  readonly reportPath?:
    string;

  readonly write?:
    (
      line:
        string
    ) =>
      void;
}


function makeRunId():
  string {

  return (
    "v3-" +
    new Date()
      .toISOString()
      .replace(
        /[:.]/gu,
        "-"
      )
  );
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


export async function executeSmartBatchV2(
  input:
    ExecuteSmartBatchV2Input
): Promise<
  SmartBatchV2Report
> {

  const runId =
    input.runId ??
    makeRunId();

  const items:
    SmartBatchV2Item[] =
      [];

  const validations:
    VisualExtractionValidationResult[] =
      [];

  const write =
    input.write ??
    (
      (
        line:
          string
      ) =>
        console.log(
          line
        )
    );


  for (
    let index =
      0;
    index <
      input.urls.length;
    index +=
      1
  ) {

    const url =
      input.urls[
        index
      ];


    if (
      !url
    ) {
      continue;
    }


    const preflight =
      deterministicSmartPreflight(
        url
      );


    if (
      preflight
    ) {

      items.push({
        index,
        url,
        status:
          "SKIPPED_NON_CAMERA",
        reason:
          preflight.reason
      });

      write(
        "[SKIP] " +
        url +
        " " +
        (
          preflight.reason ??
          ""
        )
      );

      continue;
    }


    try {

      const result =
        await input.processor(
          url,
          index
        );


      validations.push(
        result.validation
      );


      items.push({
        index,
        url,
        status:
          result.validation.status,

        finalUrl:
          result.capture.manifest.finalUrl,

        captureManifestPath:
          result.capture.manifestPath,

        latencyMs:
          result.extraction.telemetry.latencyMs
      });


      write(
        "[" +
        result.validation.status +
        "] " +
        url
      );
    }
    catch (
      error
    ) {

      const message =
        errorMessage(
          error
        );


      items.push({
        index,
        url,
        status:
          "ERROR",
        error:
          message
      });


      write(
        "[ERROR] " +
        url +
        " " +
        message
      );
    }
  }


  await exportCamera13WorkbookAtomic(
    input.outputPath,
    validations,
    {
      runId
    }
  );


  const report:
    SmartBatchV2Report = {
      runId,

      items,

      summary: {
        total:
          items.length,

        validated:
          items.filter(
            item =>
              item.status ===
              "VALIDATED"
          ).length,

        review:
          items.filter(
            item =>
              item.status ===
              "REVIEW"
          ).length,

        skippedNonCamera:
          items.filter(
            item =>
              item.status ===
              "SKIPPED_NON_CAMERA"
          ).length,

        errors:
          items.filter(
            item =>
              item.status ===
              "ERROR"
          ).length
      }
    };


  if (
    input.reportPath
  ) {

    await writeFile(
      input.reportPath,
      JSON.stringify(
        report,
        null,
        2
      ) +
      "\n",
      "utf8"
    );
  }


  return report;
}


interface LiveProcessorOptions {
  readonly apiKey:
    string;

  readonly headless:
    boolean;

  readonly captureRoot:
    string;

  readonly runId:
    string;
}


async function createLiveProcessor(
  options:
    LiveProcessorOptions
): Promise<{
  readonly processor:
    VisualUrlProcessor;

  readonly close:
    () =>
      Promise<void>;
}> {

  const browser =
    await chromium.launch({
      headless:
        options.headless
    });

  const extractor =
    new Gemini36VisualExtractor({
      apiKey:
        options.apiKey
    });


  const processor:
    VisualUrlProcessor =
      async (
        url,
        index
      ) => {

        const context =
          await browser.newContext({
            viewport: {
              width:
                1440,

              height:
                1200
            }
          });


        try {

          const page =
            await context.newPage();


          return await runVisualProductPipeline({
            page,
            url,

            captureDir:
              join(
                options.captureRoot,
                options.runId,
                String(
                  index +
                  1
                ).padStart(
                  4,
                  "0"
                )
              ),

            extractor
          });
        }
        finally {

          await context.close();
        }
      };


  return {
    processor,

    close:
      () =>
        browser.close()
  };
}


function parseUrls(
  raw:
    string
): string[] {

  return raw
    .split(
      /\r?\n/gu
    )
    .map(
      line =>
        line.trim()
    )
    .filter(
      line =>
        line.length >
          0 &&
        !line.startsWith(
          "#"
        )
    );
}


function configuredApiKey():
  string {

  const candidates =
    [
      process.env
        .GEMINI_AUTH_KEY,
      process.env
        .GEMINI_API_KEY
    ];


  for (
    const candidate
    of candidates
  ) {

    const value =
      candidate?.trim();


    if (
      value
    ) {
      return value;
    }
  }


  throw new Error(
    "Gemini credential is not configured. Set GEMINI_AUTH_KEY or GEMINI_API_KEY."
  );
}


export async function runSmartBatchV2Cli(
  argv:
    readonly string[] =
      process.argv
): Promise<void> {

  const program =
    new Command();


  program
    .name(
      "camintel-smart-batch-v2"
    )
    .description(
      "Run the V3 Vision-First capture -> Gemini 3.6 -> validator -> exact 13-column XLSX path."
    )
    .argument(
      "<input-file>",
      "Text file containing one URL per line"
    )
    .requiredOption(
      "--output <xlsx>",
      "Output XLSX file"
    )
    .option(
      "--capture-root <dir>",
      "Local screenshot/capture spool root",
      ".camintel/v3-runs"
    )
    .option(
      "--headless",
      "Hide Chromium",
      false
    )
    .action(
      async (
        inputFile:
          string,

        options:
          {
            readonly output:
              string;

            readonly captureRoot:
              string;

            readonly headless:
              boolean;
          }
      ) => {

        const raw =
          await readFile(
            inputFile,
            "utf8"
          );

        const urls =
          parseUrls(
            raw
          );


        if (
          urls.length ===
          0
        ) {
          throw new Error(
            "Input file contains no URLs."
          );
        }


        const runId =
          makeRunId();

        const live =
          await createLiveProcessor({
            apiKey:
              configuredApiKey(),

            headless:
              options.headless,

            captureRoot:
              options.captureRoot,

            runId
          });


        try {

          const report =
            await executeSmartBatchV2({
              urls,

              outputPath:
                options.output,

              reportPath:
                options.output +
                ".run-report.json",

              runId,

              processor:
                live.processor
            });


          console.log(
            JSON.stringify(
              {
                output:
                  options.output,

                report:
                  options.output +
                  ".run-report.json",

                summary:
                  report.summary
              }
            )
          );


          if (
            report.summary.errors >
            0
          ) {
            process.exitCode =
              1;
          }
        }
        finally {

          await live.close();
        }
      }
    );


  await program.parseAsync(
    [
      ...argv
    ]
  );
}


function isDirectExecution():
  boolean {

  const entry =
    process.argv[
      1
    ];


  if (
    !entry
  ) {
    return false;
  }


  return (
    import.meta.url ===
    pathToFileURL(
      resolve(
        entry
      )
    ).href
  );
}


if (
  isDirectExecution()
) {

  try {

    await runSmartBatchV2Cli();
  }
  catch (
    error
  ) {

    console.error(
      "ERROR: " +
      errorMessage(
        error
      )
    );


    process.exitCode =
      1;
  }
}
