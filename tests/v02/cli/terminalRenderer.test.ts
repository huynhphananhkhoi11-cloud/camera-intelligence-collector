import {
  describe,
  expect,
  test
} from "vitest";

import {
  TerminalRenderer,
  type TerminalRendererOutput
} from "../../../src/v02/cli/terminalRenderer.ts";

import type {
  RunCounterSnapshot,
  RunEvent,
  RunEventPayload
} from "../../../src/v02/runtime/runEventBus.ts";


function event(
  payload:
    RunEventPayload,

  sequence:
    number =
      1,

  timestamp:
    string =
      "2026-09-18T12:00:00.000Z"
): RunEvent {

  return {
    ...payload,

    sequence,

    timestamp
  } as
    RunEvent;
}


function counters(
  overrides:
    Partial<
      RunCounterSnapshot
    > = {}
): RunCounterSnapshot {

  return {
    accept:
      0,

    review:
      0,

    exclude:
      0,

    error:
      0,

    inProgress:
      0,

    total:
      0,

    ...overrides
  };
}


class FakeOutput
implements
  TerminalRendererOutput {

  readonly writes:
    string[] = [];

  readonly cursorCalls:
    string[] = [];


  constructor(
    readonly isTTY:
      boolean,

    readonly columns:
      number =
        120,

    readonly withCursor:
      boolean =
        true
  ) {
  }


  write(
    chunk:
      string
  ): void {

    this.writes.push(
      chunk
    );
  }


  cursorTo =
    (
      x:
        number
    ): void => {

      if (
        !this.withCursor
      ) {
        return;
      }


      this.cursorCalls.push(
        `cursorTo:${x}`
      );
    };


  moveCursor =
    (
      dx:
        number,
      dy:
        number
    ): void => {

      if (
        !this.withCursor
      ) {
        return;
      }


      this.cursorCalls.push(
        `moveCursor:${dx}:${dy}`
      );
    };


  clearScreenDown =
    (): void => {

      if (
        !this.withCursor
      ) {
        return;
      }


      this.cursorCalls.push(
        "clearScreenDown"
      );
    };
}


function nonCursorOutput(
  isTTY:
    boolean
): {
  output:
    TerminalRendererOutput;

  writes:
    string[];
} {

  const writes:
    string[] = [];


  return {
    writes,

    output: {
      isTTY,

      columns:
        120,

      write:
        chunk => {
          writes.push(
            chunk
          );
        }
    }
  };
}


function started(
  overrides:
    Partial<
      Extract<
        RunEventPayload,
        {
          type:
            "RUN_STARTED";
        }
      >
    > = {}
): RunEventPayload {

  return {
    type:
      "RUN_STARTED",

    runId:
      "run-renderer",

    inputUrl:
      "https://www.example.com/catalog",

    mode:
      "NEW",

    options: {
      headless:
        false,

      workers:
        3,

      fresh:
        false,

      outputPath:
        null
    },

    ...overrides
  };
}


describe(
  "TerminalRenderer truthful state",
  () => {

    test(
      "retains pre-RUN_STARTED counters without rendering early",
      () => {

        const fake =
          new FakeOutput(
            true
          );


        const renderer =
          new TerminalRenderer({
            output:
              fake,

            now:
              () =>
                Date.parse(
                  "2026-09-18T12:00:05.000Z"
                )
          });


        renderer.onEvent(
          event({
            type:
              "COUNTERS_UPDATED",

            runId:
              "run-renderer",

            counters:
              counters({
                inProgress:
                  4,

                total:
                  4
              })
          })
        );


        expect(
          fake.writes
        ).toEqual(
          []
        );


        renderer.onEvent(
          event(
            started(),
            2
          )
        );


        const snapshot =
          renderer.snapshot();


        expect(
          snapshot.runId
        ).toBe(
          "run-renderer"
        );


        expect(
          snapshot.counters.total
        ).toBe(
          4
        );


        expect(
          snapshot.counters.inProgress
        ).toBe(
          4
        );


        expect(
          fake.writes.length
        ).toBe(
          1
        );
      }
    );


    test(
      "detail percent comes only from authoritative terminal counters",
      () => {

        const fake =
          new FakeOutput(
            true
          );


        const renderer =
          new TerminalRenderer({
            output:
              fake,

            now:
              () =>
                Date.parse(
                  "2026-09-18T12:00:10.000Z"
                )
          });


        renderer.onEvent(
          event(
            started()
          )
        );


        renderer.onEvent(
          event({
            type:
              "STAGE_STARTED",

            runId:
              "run-renderer",

            stage:
              "DETAIL_COLLECTION"
          },
          2)
        );


        renderer.onEvent(
          event({
            type:
              "DETAIL_STARTED",

            runId:
              "run-renderer",

            url:
              "https://example.com/p/one",

            workerId:
              1,

            index:
              1,

            total:
              4
          },
          3)
        );


        renderer.onEvent(
          event({
            type:
              "DETAIL_FINISHED",

            runId:
              "run-renderer",

            url:
              "https://example.com/p/one",

            workerId:
              1,

            decision:
              "ACCEPT",

            durationMs:
              120
          },
          4)
        );


        const beforeCounters =
          renderer.snapshot();


        expect(
          beforeCounters.detailCompleted
        ).toBe(
          0
        );


        expect(
          beforeCounters.detailPercent
        ).toBeNull();


        renderer.onEvent(
          event({
            type:
              "COUNTERS_UPDATED",

            runId:
              "run-renderer",

            counters:
              counters({
                accept:
                  1,

                review:
                  1,

                inProgress:
                  2,

                total:
                  4
              })
          },
          5)
        );


        const afterCounters =
          renderer.snapshot();


        expect(
          afterCounters.detailCompleted
        ).toBe(
          2
        );


        expect(
          afterCounters.detailTotal
        ).toBe(
          4
        );


        expect(
          afterCounters.detailPercent
        ).toBe(
          50
        );
      }
    );


    test(
      "tracks current visible URL deterministically with worker 1 priority",
      () => {

        const fake =
          new FakeOutput(
            true
          );


        const renderer =
          new TerminalRenderer({
            output:
              fake
          });


        renderer.onEvent(
          event(
            started()
          )
        );


        renderer.onEvent(
          event({
            type:
              "DETAIL_STARTED",

            runId:
              "run-renderer",

            url:
              "https://example.com/p/two",

            workerId:
              2,

            index:
              2,

            total:
              4
          },
          2)
        );


        expect(
          renderer
            .snapshot()
            .currentVisible
        ).toBe(
          "https://example.com/p/two"
        );


        renderer.onEvent(
          event({
            type:
              "DETAIL_STARTED",

            runId:
              "run-renderer",

            url:
              "https://example.com/p/one",

            workerId:
              1,

            index:
              1,

            total:
              4
          },
          3)
        );


        expect(
          renderer
            .snapshot()
            .currentVisible
        ).toBe(
          "https://example.com/p/one"
        );


        renderer.onEvent(
          event({
            type:
              "DETAIL_FINISHED",

            runId:
              "run-renderer",

            url:
              "https://example.com/p/one",

            workerId:
              1,

            decision:
              "ACCEPT",

            durationMs:
              10
          },
          4)
        );


        expect(
          renderer
            .snapshot()
            .currentVisible
        ).toBe(
          "https://example.com/p/two"
        );
      }
    );


    test(
      "frame is text-complete without relying on color",
      () => {

        const fake =
          new FakeOutput(
            true
          );


        const renderer =
          new TerminalRenderer({
            output:
              fake,

            now:
              () =>
                Date.parse(
                  "2026-09-18T12:08:31.000Z"
                )
          });


        renderer.onEvent(
          event(
            started()
          )
        );


        renderer.onEvent(
          event({
            type:
              "STAGE_STARTED",

            runId:
              "run-renderer",

            stage:
              "DETAIL_COLLECTION"
          },
          2)
        );


        renderer.onEvent(
          event({
            type:
              "COUNTERS_UPDATED",

            runId:
              "run-renderer",

            counters:
              counters({
                accept:
                  103,

                review:
                  7,

                exclude:
                  29,

                error:
                  3,

                inProgress:
                  285,

                total:
                  427
              })
          },
          3)
        );


        const frame =
          renderer.frame();


        expect(
          frame
        ).toContain(
          "CAMERA INTELLIGENCE COLLECTOR"
        );


        expect(
          frame
        ).toContain(
          "Run: run-renderer"
        );


        expect(
          frame
        ).toContain(
          "Website: example.com"
        );


        expect(
          frame
        ).toContain(
          "Browser: VISIBLE | Workers: 3 | Output: AUTO"
        );


        expect(
          frame
        ).toContain(
          "[>] Detail collection 142 / 427 (33%)"
        );


        expect(
          frame
        ).toContain(
          "ACCEPT 103 REVIEW 7 EXCLUDE 29 ERROR 3 IN_PROGRESS 285"
        );


        expect(
          frame
        ).toContain(
          "Elapsed: 00:08:31"
        );


        /*
         * Unobserved stages must not be fabricated as if the
         * current runtime emitted them.
         */
        expect(
          frame
        ).not.toContain(
          "Root discovery"
        );
      }
    );
  }
);


describe(
  "TerminalRenderer output policy",
  () => {

    test(
      "cursor-capable TTY repaints the same terminal region",
      () => {

        const fake =
          new FakeOutput(
            true,
            120,
            true
          );


        const renderer =
          new TerminalRenderer({
            output:
              fake
          });


        expect(
          renderer.isRepaintMode()
        ).toBe(
          true
        );


        renderer.onEvent(
          event(
            started()
          )
        );


        expect(
          fake.cursorCalls
        ).toEqual(
          []
        );


        renderer.onEvent(
          event({
            type:
              "STAGE_STARTED",

            runId:
              "run-renderer",

            stage:
              "DETAIL_COLLECTION"
          },
          2)
        );


        expect(
          fake.cursorCalls
        ).toContain(
          "cursorTo:0"
        );


        expect(
          fake.cursorCalls.some(
            value =>
              value.startsWith(
                "moveCursor:0:-"
              )
          )
        ).toBe(
          true
        );


        expect(
          fake.cursorCalls
        ).toContain(
          "clearScreenDown"
        );
      }
    );


    test(
      "non-TTY fallback logs stage boundaries but throttles progress",
      () => {

        let now =
          0;


        const {
          output,
          writes
        } =
          nonCursorOutput(
            false
          );


        const renderer =
          new TerminalRenderer({
            output,

            now:
              () =>
                now,

            plainIntervalMs:
              5000
          });


        renderer.onEvent(
          event(
            started()
          )
        );


        renderer.onEvent(
          event({
            type:
              "STAGE_STARTED",

            runId:
              "run-renderer",

            stage:
              "DETAIL_COLLECTION"
          },
          2)
        );


        renderer.onEvent(
          event({
            type:
              "COUNTERS_UPDATED",

            runId:
              "run-renderer",

            counters:
              counters({
                accept:
                  1,

                inProgress:
                  3,

                total:
                  4
              })
          },
          3)
        );


        const afterFirstProgress =
          writes.length;


        now =
          1000;


        renderer.onEvent(
          event({
            type:
              "COUNTERS_UPDATED",

            runId:
              "run-renderer",

            counters:
              counters({
                accept:
                  2,

                inProgress:
                  2,

                total:
                  4
              })
          },
          4)
        );


        expect(
          writes.length
        ).toBe(
          afterFirstProgress
        );


        now =
          6000;


        renderer.onEvent(
          event({
            type:
              "COUNTERS_UPDATED",

            runId:
              "run-renderer",

            counters:
              counters({
                accept:
                  3,

                inProgress:
                  1,

                total:
                  4
              })
          },
          5)
        );


        expect(
          writes.length
        ).toBe(
          afterFirstProgress +
          1
        );


        const text =
          writes.join(
            ""
          );


        expect(
          text
        ).toContain(
          "[STAGE] DETAIL_COLLECTION START"
        );


        expect(
          text
        ).toContain(
          "[PROGRESS] detail 3/4 (75%)"
        );
      }
    );


    test(
      "TTY without cursor primitives uses plain fallback",
      () => {

        const {
          output,
          writes
        } =
          nonCursorOutput(
            true
          );


        const renderer =
          new TerminalRenderer({
            output
          });


        expect(
          renderer.isRepaintMode()
        ).toBe(
          false
        );


        renderer.onEvent(
          event(
            started()
          )
        );


        expect(
          writes.join(
            ""
          )
        ).toContain(
          "[RUN]"
        );
      }
    );


    test(
      "export completion and run completion preserve real artifact path",
      () => {

        const fake =
          new FakeOutput(
            true
          );


        const renderer =
          new TerminalRenderer({
            output:
              fake
          });


        renderer.onEvent(
          event(
            started()
          )
        );


        renderer.onEvent(
          event({
            type:
              "EXPORT_STARTED",

            runId:
              "run-renderer",

            targetPath:
              "C:\\Temp\\camera.xlsx"
          },
          2)
        );


        renderer.onEvent(
          event({
            type:
              "EXPORT_COMPLETED",

            runId:
              "run-renderer",

            targetPath:
              "C:\\Temp\\camera.xlsx",

            fileHash:
              "abc123",

            fileSize:
              4096
          },
          3)
        );


        renderer.onEvent(
          event({
            type:
              "RUN_COMPLETED",

            runId:
              "run-renderer",

            status:
              "COMPLETED",

            outputPath:
              null,

            summary:
              counters({
                accept:
                  4,

                total:
                  4
              })
          },
          4)
        );


        const snapshot =
          renderer.snapshot();


        expect(
          snapshot.runStatus
        ).toBe(
          "COMPLETED"
        );


        expect(
          snapshot.outputPath
        ).toBe(
          "C:\\Temp\\camera.xlsx"
        );


        expect(
          renderer.frame()
        ).toContain(
          "Status: COMPLETED"
        );
      }
    );


    test(
      "RUN_FAILED becomes visible even if RUN_STARTED was never observed",
      () => {

        const {
          output,
          writes
        } =
          nonCursorOutput(
            false
          );


        const renderer =
          new TerminalRenderer({
            output
          });


        renderer.onEvent(
          event({
            type:
              "RUN_FAILED",

            runId:
              "run-before-start",

            errorClass:
              "InvariantError",

            message:
              "persistent state mismatch"
          })
        );


        const snapshot =
          renderer.snapshot();


        expect(
          snapshot.runId
        ).toBe(
          "run-before-start"
        );


        expect(
          snapshot.runStatus
        ).toBe(
          "FAILED"
        );


        expect(
          writes.join(
            ""
          )
        ).toContain(
          "persistent state mismatch"
        );
      }
    );
  }
);