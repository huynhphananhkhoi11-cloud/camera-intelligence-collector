import {
  describe,
  expect,
  test
} from "vitest";

import {
  chooseResumeOrNew,
  latestResumableRun,
  type ResumeUxIo
} from "../../../src/v02/cli/resumeUx.ts";

import type {
  RunHistoryRecord
} from "../../../src/v02/storage/runHistoryStore.ts";

import type {
  RunStatus
} from "../../../src/v02/storage/runStore.ts";


function run(
  runId:
    string,

  status:
    RunStatus,

  remaining:
    number,

  startedAt:
    string,

  resumable:
    boolean
): RunHistoryRecord {

  return {
    runId,

    inputUrl:
      `https://example.com/${runId}`,

    canonicalOrigin:
      "https://example.com",

    startedAt,

    finishedAt:
      resumable
        ? null
        : "2026-09-18T09:00:00.000Z",

    status,

    remaining,

    resumable
  };
}


function scriptedIo(
  answers:
    string[],

  output:
    string[],

  interactive:
    boolean =
      true
): ResumeUxIo {

  return {
    isInteractive:
      interactive,

    question:
      async prompt => {

        output.push(
          prompt
        );


        return answers.shift() ??
          "";
      },

    writeLine:
      message => {

        output.push(
          message
        );
      }
  };
}


describe(
  "Phase 11H.2 resume UX",
  () => {

    test(
      "selects the newest resumable run and skips newer terminal runs",
      () => {

        const completed =
          run(
            "run-completed",
            "COMPLETED",
            0,
            "2026-09-18T08:00:00.000Z",
            false
          );

        const interrupted =
          run(
            "run-interrupted",
            "INTERRUPTED",
            17,
            "2026-09-18T07:00:00.000Z",
            true
          );

        const older =
          run(
            "run-running-old",
            "RUNNING",
            30,
            "2026-09-18T06:00:00.000Z",
            true
          );


        expect(
          latestResumableRun([
            completed,
            interrupted,
            older
          ])
        ).toEqual(
          interrupted
        );
      }
    );


    test(
      "non-interactive mode preserves new-run path without reading history",
      async () => {

        let historyReads =
          0;

        const output:
          string[] = [];


        const decision =
          await chooseResumeOrNew(
            () => {

              historyReads +=
                1;

              throw new Error(
                "history must not be touched"
              );
            },

            scriptedIo(
              [],
              output,
              false
            )
          );


        expect(
          decision
        ).toEqual({
          mode:
            "NEW"
        });


        expect(
          historyReads
        ).toBe(
          0
        );


        expect(
          output
        ).toEqual([]);
      }
    );


    test(
      "no resumable run falls through to new URL flow without asking choice",
      async () => {

        const output:
          string[] = [];


        const decision =
          await chooseResumeOrNew(
            () => [
              run(
                "run-done",
                "COMPLETED",
                0,
                "2026-09-18T07:00:00.000Z",
                false
              )
            ],

            scriptedIo(
              [],
              output
            )
          );


        expect(
          decision
        ).toEqual({
          mode:
            "NEW"
        });


        expect(
          output
        ).toEqual([]);
      }
    );


    test(
      "resume notice displays runId status and remaining",
      async () => {

        const output:
          string[] = [];


        const target =
          run(
            "run-interrupted-001",
            "INTERRUPTED",
            224,
            "2026-09-18T07:00:00.000Z",
            true
          );


        const decision =
          await chooseResumeOrNew(
            () => [
              target
            ],

            scriptedIo(
              [
                "R"
              ],
              output
            )
          );


        expect(
          decision
        ).toEqual({
          mode:
            "RESUME",

          run:
            target
        });


        expect(
          output.join(
            "\n"
          )
        ).toContain(
          "Previous unfinished run found:"
        );


        expect(
          output.join(
            "\n"
          )
        ).toContain(
          "Run: run-interrupted-001"
        );


        expect(
          output.join(
            "\n"
          )
        ).toContain(
          "Status: INTERRUPTED"
        );


        expect(
          output.join(
            "\n"
          )
        ).toContain(
          "Remaining: 224"
        );


        expect(
          output
        ).toContain(
          "Choice > "
        );
      }
    );


    test(
      "N chooses a new run",
      async () => {

        const decision =
          await chooseResumeOrNew(
            () => [
              run(
                "run-created",
                "CREATED",
                5,
                "2026-09-18T07:00:00.000Z",
                true
              )
            ],

            scriptedIo(
              [
                "n"
              ],
              []
            )
          );


        expect(
          decision
        ).toEqual({
          mode:
            "NEW"
        });
      }
    );


    test(
      "Q quits without starting either run mode",
      async () => {

        const decision =
          await chooseResumeOrNew(
            () => [
              run(
                "run-running",
                "RUNNING",
                10,
                "2026-09-18T07:00:00.000Z",
                true
              )
            ],

            scriptedIo(
              [
                "q"
              ],
              []
            )
          );


        expect(
          decision
        ).toEqual({
          mode:
            "QUIT"
        });
      }
    );


    test(
      "invalid answers are rejected until R N or Q is entered",
      async () => {

        const output:
          string[] = [];

        let questionCount =
          0;


        const io:
          ResumeUxIo = {
            isInteractive:
              true,

            question:
              async prompt => {

                output.push(
                  prompt
                );

                questionCount +=
                  1;


                return questionCount ===
                  1
                    ? "maybe"
                    : "r";
              },

            writeLine:
              message => {

                output.push(
                  message
                );
              }
          };


        const decision =
          await chooseResumeOrNew(
            () => [
              run(
                "run-running",
                "RUNNING",
                10,
                "2026-09-18T07:00:00.000Z",
                true
              )
            ],
            io
          );


        expect(
          decision.mode
        ).toBe(
          "RESUME"
        );


        expect(
          questionCount
        ).toBe(
          2
        );


        expect(
          output
        ).toContain(
          "Please enter R, N, or Q."
        );
      }
    );
  }
);