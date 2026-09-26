#!/usr/bin/env node

import {
  Command
} from "commander";

import {
  runCollectV2
} from "./collectV2.js";

import {
  resolveCollectUrl
} from "./interactiveUrl.js";

import {
  RunEventBus
} from "../runtime/runEventBus.js";

import {
  TerminalRenderer
} from "./terminalRenderer.js";

import {
  openArtifact
} from "../platform/artifactOpener.js";

import {
  openCompletedArtifactBestEffort
} from "./artifactOpenUx.js";

import {
  existsSync
} from "node:fs";

import {
  resolveStateDatabasePath
} from "../platform/stateDatabasePath.js";

import {
  SQLiteRunHistoryStore
} from "../storage/sqliteRunHistoryStore.js";

import type {
  RunHistoryRecord
} from "../storage/runHistoryStore.js";

import {
  chooseResumeOrNew
} from "./resumeUx.js";


interface CollectOptions {
  siteMode?:
    string;

  headless:
    boolean;

  maxPages?:
    string;

  maxProducts?:
    string;

  concurrency?:
    string;

  resume?:
    string;

  fresh:
    boolean;

  output?:
    string;

  debug:
    boolean;

  open:
    boolean;
}


function collectArgv(
  url:
    string |
    undefined,
  options:
    CollectOptions
): string[] {

  const argv = [
    process.execPath,
    "camintel"
  ];


  if (
    url
  ) {

    argv.push(
      url
    );
  }


  if (
    options.siteMode
  ) {
    argv.push(
      "--site-mode",
      options.siteMode
    );
  }


  if (
    options.headless
  ) {
    argv.push(
      "--headless"
    );
  }


  if (
    options.maxPages
  ) {
    argv.push(
      "--max-pages",
      options.maxPages
    );
  }


  if (
    options.maxProducts
  ) {
    argv.push(
      "--max-products",
      options.maxProducts
    );
  }


  if (
    options.concurrency
  ) {
    argv.push(
      "--concurrency",
      options.concurrency
    );
  }


  if (
    options.resume
  ) {

    argv.push(
      "--resume",
      options.resume
    );
  }


  if (
    options.fresh
  ) {
    argv.push(
      "--fresh"
    );
  }


  if (
    options.output
  ) {
    argv.push(
      "--output",
      options.output
    );
  }


  return argv;
}


function recentRunHistory():
  readonly RunHistoryRecord[] {

  const databasePath =
    resolveStateDatabasePath();


  /*
   * First use legitimately has no state database.
   * Strict read-only history must not create one.
   */
  if (
    !existsSync(
      databasePath
    )
  ) {

    return Object.freeze([]);
  }


  const history =
    new SQLiteRunHistoryStore(
      databasePath
    );


  try {

    return history.listRecentRuns(
      100
    );
  }
  finally {

    history.close();
  }
}


const program =
  new Command();


program
  .name(
    "camintel"
  )
  .description(
    "Camera Intelligence Collector"
  )
  .version(
    "1.0.0"
  )
  .showHelpAfterError();


program
  .command("collect")
  .description(
    "Collect camera product intelligence from a website"
  )
  .argument("[url]")
  .option(
    "--site-mode <mode>",
    "Weak site prior only"
  )
  .option(
    "--headless",
    "Run Chromium headless",
    false
  )
  .option(
    "--max-pages <n>",
    "Maximum catalog pages"
  )
  .option(
    "--max-products <n>",
    "Maximum product detail pages"
  )
  .option(
    "--concurrency <n>",
    "Parallel detail workers"
  )
  .option(
    "--resume <runId>",
    "Resume a persistent run by runId"
  )
  .option(
    "--fresh",
    "Bypass reusable cache for a new run",
    false
  )
  .option(
    "--output <path>",
    "Explicit xlsx output path"
  )
  .option(
    "--no-open",
    "Do not automatically open the completed xlsx"
  )
  .option(
    "--debug",
    "Show per-URL technical diagnostics",
    false
  )
  .action(
    async (
      url:
        string |
        undefined,
      options:
        CollectOptions
    ) => {

      let resolvedUrl:
        string |
        undefined;

      let resumeRunId =
        options.resume
          ?.trim();


      if (
        options.resume !==
          undefined &&
        resumeRunId?.length ===
          0
      ) {

        throw new Error(
          "--resume requires a non-blank runId."
        );
      }


      if (
        resumeRunId &&
        url !==
          undefined &&
        url.trim().length >
          0
      ) {

        throw new Error(
          "--resume cannot be combined with a website URL."
        );
      }


      if (
        resumeRunId &&
        options.fresh
      ) {

        throw new Error(
          "--resume cannot be combined with --fresh."
        );
      }


      if (
        resumeRunId
      ) {

        /*
         * Explicit resume is authoritative.
         * RunCoordinator remains the sole recovery/mutation owner.
         */
      }
      else if (
        url !==
          undefined &&
        url.trim().length >
          0
      ) {

        resolvedUrl =
          await resolveCollectUrl(
            url
          );
      }
      else if (
        options.fresh
      ) {

        /*
         * Explicit new-run intent bypasses unfinished-run history.
         */
        resolvedUrl =
          await resolveCollectUrl(
            undefined
          );
      }
      else {

        const decision =
          await chooseResumeOrNew(
            recentRunHistory
          );


        if (
          decision.mode ===
            "QUIT"
        ) {

          console.log(
            "Cancelled."
          );

          return;
        }


        if (
          decision.mode ===
            "RESUME"
        ) {

          resumeRunId =
            decision.run.runId;
        }
        else {

          resolvedUrl =
            await resolveCollectUrl(
              undefined
            );
        }
      }


      const effectiveOptions:
        CollectOptions = {
          ...options,

          resume:
            resumeRunId
        };


      const eventBus =
        new RunEventBus();


      const renderer =
        new TerminalRenderer();


      const unsubscribeRenderer =
        eventBus.subscribe(
          renderer.onEvent
        );


      let completedArtifactPath:
        string |
        null =
          null;


      const unsubscribeArtifactCapture =
        eventBus.subscribe(
          event => {

            if (
              event.type ===
                "EXPORT_COMPLETED"
            ) {

              completedArtifactPath =
                event.targetPath;
            }
          }
        );


      if (
        !effectiveOptions.resume
      ) {

        console.log(
          "Discovering product URLs... Press Ctrl+C to cancel."
        );
      }


      try {

        await runCollectV2(
          collectArgv(
            resolvedUrl,
            effectiveOptions
          ),
          {
            eventBus,

            debug:
              options.debug,

            onEventError:
              error => {

                if (
                  options.debug
                ) {

                  console.error(
                    "EVENT DIAGNOSTIC:",
                    error
                  );
                }
              }
          }
        );


        await openCompletedArtifactBestEffort({
          enabled:
            options.open,

          artifactPath:
            completedArtifactPath,

          openArtifact:
            openArtifact,

          writeInfo:
            message => {

              console.log(
                message
              );
            },

          writeWarning:
            message => {

              console.error(
                message
              );
            }
        });
      }
      finally {

        unsubscribeArtifactCapture();

        unsubscribeRenderer();
      }
    }
  );


try {
  await program.parseAsync();
}
catch (
  error
) {
  const message =
    error instanceof
      Error
      ? error.message
      : String(
          error
        );


  console.error(
    `ERROR: ${message}`
  );

  process.exitCode =
    1;
}