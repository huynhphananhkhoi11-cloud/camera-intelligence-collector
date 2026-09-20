#!/usr/bin/env node

import {
  readFile
} from "node:fs/promises";

import {
  resolve
} from "node:path";

import {
  pathToFileURL
} from "node:url";

import {
  Command
} from "commander";

import {
  GeminiVisionProvider
} from "../ai/geminiVisionProvider.js";

import {
  VisionFastPathSession
} from "../agent/visionFastPathSession.js";

import {
  BrowserSlowAgentRunner
} from "../agent/slowAgentRunner.js";

import {
  routeSmartUrl,
  type FastRunner,
  type SlowRunner
} from "../agent/fastSlowRouter.js";

import {
  runSemanticBatch
} from "../bulk/semanticBatchRunner.js";

import type {
  SemanticBatchReport,
  SemanticUrlProcessor
} from "../bulk/semanticBatchTypes.js";

import {
  exportSemanticBatchWorkbook
} from "../export/semanticBatchWorkbook.js";


export interface ExecuteSmartBatchInput {
  readonly urls:
    readonly string[];

  readonly outputPath:
    string;

  readonly minGapMs:
    number;

  readonly processor:
    SemanticUrlProcessor;

  readonly exportWorkbook?:
    typeof exportSemanticBatchWorkbook;

  readonly write?:
    (
      line:
        string
    ) =>
      void;
}


export async function executeSmartBatch(
  input:
    ExecuteSmartBatchInput
): Promise<
  SemanticBatchReport
> {

  const report =
    await runSemanticBatch(
      input.urls,
      input.processor,
      {
        minGapMs:
          input.minGapMs
      }
    );


  const exporter =
    input.exportWorkbook ??
    exportSemanticBatchWorkbook;


  await exporter(
    input.outputPath,
    report,
    {
      provider:
        "smart-router"
    }
  );


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


  write(
    JSON.stringify(
      {
        output:
          input.outputPath,

        summary:
          report.summary
      }
    )
  );


  return report;
}


interface LiveProcessorOptions {
  readonly apiKey:
    string;

  readonly headless:
    boolean;
}


function createLiveProcessor(
  options:
    LiveProcessorOptions
): SemanticUrlProcessor {

  const fastProvider =
    new GeminiVisionProvider({
      apiKey:
        options.apiKey
    });


  const fastSession =
    new VisionFastPathSession({
      headless:
        options.headless
    });


  const fastRunner:
    FastRunner = {

      run:
        (
          url:
            string
        ) =>
          fastSession.run(
            url,
            fastProvider
          )
  };


  const slowRunner:
    SlowRunner =
      new BrowserSlowAgentRunner({
        apiKey:
          options.apiKey,

        headless:
          options.headless
      });


  return async (
    url:
      string
  ) => {

    const result =
      await routeSmartUrl({
        url,

        fastRunner,

        slowRunner
      });


    /*
     * SemanticBatchItemResult intentionally does not expose
     * per-route attempts. Batch/export owns only the common
     * routing telemetry required by C9E.
     */
    return {
      url:
        result.url,

      disposition:
        result.disposition,

      path:
        result.path,

      model:
        result.model,

      decision:
        result.decision,

      validation:
        result.validation,

      reason:
        result.reason,

      haltBatch:
        result.haltBatch,

      inputTokens:
        result.inputTokens,

      outputTokens:
        result.outputTokens,

      latencyMs:
        result.latencyMs
    };
  };
}


function parseMinGapMs(
  value:
    string
): number {

  const parsed =
    Number(
      value
    );


  if (
    !Number.isFinite(
      parsed
    ) ||
    parsed <
      0
  ) {

    throw new Error(
      "--min-gap-ms must be a non-negative number."
    );
  }


  return Math.floor(
    parsed
  );
}


export async function runSmartBatchCli(
  argv:
    readonly string[] =
      process.argv
): Promise<void> {

  const program =
    new Command();


  program
    .name(
      "camintel-smart-batch"
    )
    .description(
      "Process URL files sequentially using quota-aware FAST/SLOW routing and export an atomic XLSX workbook."
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
      "--min-gap-ms <milliseconds>",
      "Minimum delay between attempted URLs",
      "0"
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

            readonly minGapMs:
              string;

            readonly headless:
              boolean;
          }
      ) => {

        const apiKey =
          process.env
            .GEMINI_API_KEY
            ?.trim();


        if (
          !apiKey
        ) {

          throw new Error(
            "GEMINI_API_KEY is not set."
          );
        }


        const raw =
          await readFile(
            inputFile,
            "utf8"
          );


        const urls =
          raw.split(
            /\r?\n/
          )
            .filter(
              line => {

                const trimmed =
                  line.trim();


                return (
                  trimmed.length >
                    0 &&
                  !trimmed.startsWith(
                    "#"
                  )
                );
              }
            );


        const processor =
          createLiveProcessor({
            apiKey,

            headless:
              options.headless
          });


        const report =
          await executeSmartBatch({
            urls,

            outputPath:
              options.output,

            minGapMs:
              parseMinGapMs(
                options.minGapMs
              ),

            processor
          });


        /*
         * AI_PENDING is an operational state and is not
         * automatically a process failure. ERROR rows are.
         */
        if (
          report.summary.errors >
            0
        ) {

          process.exitCode =
            1;
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
    process.argv[1];


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

    await runSmartBatchCli();
  }
  catch (
    error
  ) {

    console.error(
      "ERROR: " +
      (
        error instanceof
          Error
          ? error.message
          : String(
              error
            )
      )
    );


    process.exitCode =
      1;
  }
}