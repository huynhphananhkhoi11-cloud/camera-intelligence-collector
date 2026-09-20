#!/usr/bin/env node

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
  type SlowRunner,
  type SmartRouteResult
} from "../agent/fastSlowRouter.js";


export interface ExecuteSmartReadInput {
  readonly url:
    string;

  readonly fastRunner:
    FastRunner;

  readonly slowRunner:
    SlowRunner;

  readonly write?:
    (
      line:
        string
    ) =>
      void;
}


export async function executeSmartRead(
  input:
    ExecuteSmartReadInput
): Promise<
  SmartRouteResult
> {

  const result =
    await routeSmartUrl({
      url:
        input.url,

      fastRunner:
        input.fastRunner,

      slowRunner:
        input.slowRunner
    });


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


  /*
   * One canonical JSON object is the machine-readable
   * smart-read output contract.
   *
   * path/disposition already expose whether FAST,
   * SLOW, REVIEW, pending, or error won.
   */
  write(
    JSON.stringify(
      result
    )
  );


  return result;
}


interface LiveRunnerOptions {
  readonly apiKey:
    string;

  readonly headless:
    boolean;
}


function createLiveRunners(
  options:
    LiveRunnerOptions
): {
  readonly fastRunner:
    FastRunner;

  readonly slowRunner:
    SlowRunner;
} {

  /*
   * FAST keeps the existing C9B provider/session
   * untouched: one normal Gemini multimodal call,
   * planner calls = 0.
   */
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


  /*
   * SLOW is instantiated but routeSmartUrl invokes it
   * only after a quality/grounding escalation.
   */
  const slowRunner =
    new BrowserSlowAgentRunner({
      apiKey:
        options.apiKey,

      headless:
        options.headless
    });


  return {
    fastRunner,
    slowRunner
  };
}


export async function runSmartReadCli(
  argv:
    readonly string[] =
      process.argv
): Promise<void> {

  const program =
    new Command();


  program
    .name(
      "camintel-smart-read"
    )
    .description(
      "Read one URL using FAST first and escalate to SLOW only for semantic quality/grounding insufficiency."
    )
    .argument(
      "<url>",
      "Product or page URL"
    )
    .option(
      "--headless",
      "Hide Chromium",
      false
    )
    .action(
      async (
        url:
          string,

        options:
          {
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


        const {
          fastRunner,
          slowRunner
        } =
          createLiveRunners({
            apiKey,

            headless:
              options.headless
          });


        const result =
          await executeSmartRead({
            url,

            fastRunner,

            slowRunner
          });


        /*
         * REVIEW and AI_PENDING are valid operational
         * dispositions, not CLI crashes.
         *
         * ERROR represents an actual code/config/provider
         * failure and should make shell automation fail.
         */
        if (
          result.disposition ===
            "ERROR"
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

    await runSmartReadCli();
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
