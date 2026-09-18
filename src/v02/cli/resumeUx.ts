import {
  createInterface
} from "node:readline/promises";

import type {
  RunHistoryRecord
} from "../storage/runHistoryStore.js";


export interface ResumeUxIo {
  readonly isInteractive:
    boolean;

  readonly question:
    (
      prompt:
        string
    ) =>
      Promise<string>;

  readonly writeLine:
    (
      message:
        string
    ) =>
      void;
}


export type RunHistoryLoader =
  () =>
    readonly RunHistoryRecord[];


export type ResumeUxDecision =
  | {
      readonly mode:
        "RESUME";

      readonly run:
        RunHistoryRecord;
    }
  | {
      readonly mode:
        "NEW";
    }
  | {
      readonly mode:
        "QUIT";
    };


async function askFromTerminal(
  prompt:
    string
): Promise<string> {

  const readline =
    createInterface({
      input:
        process.stdin,

      output:
        process.stdout
    });


  try {

    return await readline.question(
      prompt
    );
  }
  finally {

    readline.close();
  }
}


function defaultIo():
  ResumeUxIo {

  return {
    isInteractive:
      process.stdin.isTTY ===
        true &&
      process.stdout.isTTY ===
        true,

    question:
      askFromTerminal,

    writeLine:
      message => {

        console.log(
          message
        );
      }
  };
}


export function latestResumableRun(
  runs:
    readonly RunHistoryRecord[]
): RunHistoryRecord |
  null {

  return (
    runs.find(
      run =>
        run.resumable
    ) ??
    null
  );
}


function writeResumeNotice(
  run:
    RunHistoryRecord,

  io:
    ResumeUxIo
): void {

  io.writeLine(
    "Previous unfinished run found:"
  );

  io.writeLine(
    `Run: ${run.runId}`
  );

  io.writeLine(
    `Status: ${run.status}`
  );

  io.writeLine(
    `Remaining: ${run.remaining}`
  );

  io.writeLine(
    "[R] Resume"
  );

  io.writeLine(
    "[N] New run"
  );

  io.writeLine(
    "[Q] Quit"
  );
}


export async function chooseResumeOrNew(
  loadHistory:
    RunHistoryLoader,

  io:
    ResumeUxIo =
      defaultIo()
): Promise<
  ResumeUxDecision
> {

  /*
   * Critical compatibility invariant:
   *
   * non-TTY missing-URL behavior stays owned by resolveCollectUrl().
   * Do not even touch SQLite history here in non-interactive mode.
   */
  if (
    !io.isInteractive
  ) {

    return Object.freeze({
      mode:
        "NEW"
    });
  }


  const run =
    latestResumableRun(
      loadHistory()
    );


  if (
    run ===
      null
  ) {

    return Object.freeze({
      mode:
        "NEW"
    });
  }


  writeResumeNotice(
    run,
    io
  );


  while (
    true
  ) {

    const choice =
      (
        await io.question(
          "Choice > "
        )
      )
        .trim()
        .toUpperCase();


    if (
      choice ===
        "R"
    ) {

      return Object.freeze({
        mode:
          "RESUME",

        run
      });
    }


    if (
      choice ===
        "N"
    ) {

      return Object.freeze({
        mode:
          "NEW"
      });
    }


    if (
      choice ===
        "Q"
    ) {

      return Object.freeze({
        mode:
          "QUIT"
      });
    }


    io.writeLine(
      "Please enter R, N, or Q."
    );
  }
}