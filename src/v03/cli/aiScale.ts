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
    "Camera-only, disk-bounded, staged Browser -> Qwen3-VL production runner"
  )
  .argument(
    "<url>",
    "Website root URL"
  )
  .option(
    "--model <name>",
    "Installed Ollama model",
    "qwen3-vl:4b-instruct-q4_K_M"
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

      const engine =
        new CameraScaleEngine({
          rootUrl:
            url,

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
