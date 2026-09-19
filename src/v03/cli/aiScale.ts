#!/usr/bin/env node

import {
  Command
} from "commander";

import {
  resolve
} from "node:path";

import {
  CameraScaleEngine
} from "../ai/cameraScaleEngine.js";


interface Options {
  readonly provider:
    string;

  readonly model:
    string;

  readonly ollama:
    string;

  readonly maxCandidates:
    number;

  readonly batchSize:
    number;

  readonly browseSeconds:
    number;

  readonly aiTimeoutSeconds:
    number;

  readonly maxConsecutiveAiTimeouts:
    number;

  readonly headed:
    boolean;

  readonly output:
    string;

  readonly keepTemp:
    boolean;
}


const program =
  new Command();


program
  .name(
    "camintel-ai-scale"
  )
  .description(
    "Camera-only staged Browser -> Gemini/Ollama semantic production runner"
  )
  .argument(
    "<url>",
    "Website root URL"
  )
  .option(
    "--provider <name>",
    "Semantic provider: gemini or ollama",
    "gemini"
  )
  .option(
    "--model <name>",
    "Semantic model; auto selects the provider default",
    "auto"
  )
  .option(
    "--ollama <url>",
    "Ollama base URL",
    process.env.OLLAMA_HOST ??
    "http://127.0.0.1:11434"
  )
  .option(
    "--max-candidates <n>",
    "Maximum discovered URLs considered",
    value =>
      Number.parseInt(
        value,
        10
      ),
    5000
  )
  .option(
    "--batch-size <n>",
    "Capture/AI batch size",
    value =>
      Number.parseInt(
        value,
        10
      ),
    30
  )
  .option(
    "--browse-seconds <n>",
    "Maximum adaptive browse budget per URL",
    value =>
      Number.parseInt(
        value,
        10
      ),
    45
  )
  .option(
    "--ai-timeout-seconds <n>",
    "Maximum local AI inference time per product",
    value =>
      Number.parseInt(
        value,
        10
      ),
    240
  )
  .option(
    "--max-consecutive-ai-timeouts <n>",
    "Stop run after this many consecutive AI timeouts",
    value =>
      Number.parseInt(
        value,
        10
      ),
    2
  )
  .option(
    "--headed",
    "Show Chromium",
    false
  )
  .option(
    "--output <path>",
    "Final xlsx output path",
    "./CameraIntelligence_AI.xlsx"
  )
  .option(
    "--keep-temp",
    "Keep evidence spool after a successful final Excel",
    false
  )
  .action(
    async (
      url:
        string,
      options:
        Options
    ) => {

      const providerName =
        options.provider
          .trim()
          .toLowerCase();


      if (
        providerName !==
          "gemini" &&
        providerName !==
          "ollama"
      ) {
        throw new Error(
          "--provider must be gemini or ollama."
        );
      }


      const engine =
        new CameraScaleEngine({
          rootUrl:
            url,

          semanticProvider:
            providerName as
              "gemini" |
              "ollama",

          geminiApiKey:
            process.env.GEMINI_API_KEY,

          outputPath:
            resolve(
              options.output
            ),

          model:
            options.model,

          ollamaBaseUrl:
            options.ollama,

          maxCandidates:
            options.maxCandidates,

          batchSize:
            options.batchSize,

          browseBudgetMs:
            options.browseSeconds *
            1000,

          aiTimeoutMs:
            options.aiTimeoutSeconds *
            1000,

          maxConsecutiveAiTimeouts:
            options.maxConsecutiveAiTimeouts,

          headless:
            !options.headed,

          keepTempOnSuccess:
            options.keepTemp
        });


      const result =
        await engine.run();


      process.stdout.write(
        [
          "",
          "=== AI SCALE COMPLETE ===",
          "Discovered: " +
            result.discovered,
          "Camera rows: " +
            result.cameras,
          "Review: " +
            result.review,
          "Excluded: " +
            result.excluded,
          "Errors: " +
            result.errors,
          "Excel: " +
            result.outputPath,
          ""
        ].join(
          "\n"
        )
      );
    }
  );


try {
  await program.parseAsync(
    process.argv
  );
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
