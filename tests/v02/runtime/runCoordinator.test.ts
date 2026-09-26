import {
  mkdtempSync,
  rmSync
} from "node:fs";

import {
  join
} from "node:path";

import {
  tmpdir
} from "node:os";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  RunCoordinator
} from "../../../src/v02/runtime/runCoordinator.ts";

import {
  SQLiteRunStore
} from "../../../src/v02/storage/sqliteRunStore.ts";


const NOW =
  "2026-09-18T09:00:00.000Z";


function tempDatabase() {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "camintel-phase10i-coordinator-"
      )
    );

  return {
    directory,

    path:
      join(
        directory,
        "runtime.sqlite"
      ),

    cleanup:
      () => {
        rmSync(
          directory,
          {
            recursive:
              true,

            force:
              true
          }
        );
      }
  };
}


function coordinator(
  path:
    string
): RunCoordinator {
  return new RunCoordinator(
    path,
    {
      timeoutMs:
        5000,

      now:
        () =>
          NOW
    }
  );
}


function startInput(
  runId:
    string =
      "run-coordinator-001"
) {
  return {
    run: {
      runId,

      inputUrl:
        "https://example.com/catalog",

      canonicalOrigin:
        "https://example.com",

      startedAt:
        "2026-09-18T08:55:00.000Z",

      codeVersion:
        "81a09d3",

      configHash:
        "cfg-phase10i"
    },

    productUrls: [
      {
        canonicalUrl:
          "https://example.com/p/a",

        discoveryScore:
          90,

        sourcesJson:
          JSON.stringify([
            "SITEMAP"
          ])
      },
      {
        canonicalUrl:
          "https://example.com/p/b",

        discoveryScore:
          80,

        sourcesJson:
          JSON.stringify([
            "DOM"
          ])
      }
    ]
  };
}


describe(
  "Phase 10I RunCoordinator",
  () => {

    test(
      "new run persists queue before entering RUNNING",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        try {
          const result =
            runtime.startNewRun(
              startInput()
            );

          expect(
            result
          ).toEqual({
            runId:
              "run-coordinator-001",

            queuedUrls: [
              "https://example.com/p/a",
              "https://example.com/p/b"
            ]
          });


          expect(
            runtime.getActiveRun()
          ).toMatchObject({
            runId:
              "run-coordinator-001",

            status:
              "RUNNING"
          });


          expect(
            runtime.reconciliation()
          ).toMatchObject({
            discovered:
              2,

            pending:
              2,

            inProgress:
              0,

            accounted:
              2,

            balanced:
              true,

            complete:
              false
          });
        }
        finally {
          runtime.close();
          temp.cleanup();
        }
      }
    );


    test(
      "coordinator lifecycle uses persisted reconciliation as source of truth",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        try {
          runtime.startNewRun(
            startInput(
              "run-persisted-truth"
            )
          );


          runtime.beginProduct(
            "https://example.com/p/a"
          );

          runtime.terminalizeProduct(
            "https://example.com/p/a",
            "ACCEPT"
          );


          runtime.beginProduct(
            "https://example.com/p/b"
          );

          runtime.terminalizeProduct(
            "https://example.com/p/b",
            "REVIEW"
          );


          expect(
            runtime.reconciliation()
          ).toMatchObject({
            discovered:
              2,

            pending:
              0,

            accepted:
              1,

            review:
              1,

            excluded:
              0,

            error:
              0,

            inProgress:
              0,

            accounted:
              2,

            balanced:
              true,

            complete:
              true
          });


          expect(
            runtime.finalizeRun()
          ).toMatchObject({
            runId:
              "run-persisted-truth",

            status:
              "COMPLETED",

            finishedAt:
              NOW
          });
        }
        finally {
          runtime.close();
        }


        const inspect =
          new SQLiteRunStore(
            temp.path
          );

        try {
          expect(
            inspect.getRun(
              "run-persisted-truth"
            )
          ).toMatchObject({
            status:
              "COMPLETED",

            finishedAt:
              NOW
          });
        }
        finally {
          inspect.close();
          temp.cleanup();
        }
      }
    );


    test(
      "interrupt is idempotent and blocks scheduling new product work",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        try {
          runtime.startNewRun(
            startInput(
              "run-interrupt"
            )
          );


          runtime.beginProduct(
            "https://example.com/p/a"
          );


          expect(
            runtime.interruptActiveRun()
          ).toEqual({
            runId:
              "run-interrupt",

            interrupted:
              true,

            status:
              "INTERRUPTED"
          });


          expect(
            runtime.isInterruptionRequested()
          ).toBe(
            true
          );


          expect(
            runtime.interruptActiveRun()
          ).toEqual({
            runId:
              "run-interrupt",

            interrupted:
              false,

            status:
              "INTERRUPTED"
          });


          expect(
            () =>
              runtime.beginProduct(
                "https://example.com/p/b"
              )
          ).toThrow(
            /interrupt|cancel/i
          );
        }
        finally {
          runtime.close();
        }


        const resumed =
          coordinator(
            temp.path
          );

        try {
          const plan =
            resumed.resumeRun(
              "run-interrupt"
            );

          expect(
            plan.queuedUrls
          ).toEqual([
            "https://example.com/p/a",
            "https://example.com/p/b"
          ]);

          expect(
            plan.recoveredInProgress
          ).toBe(
            1
          );

          expect(
            resumed.getActiveRun()
          ).toMatchObject({
            status:
              "RUNNING"
          });

          expect(
            resumed.isInterruptionRequested()
          ).toBe(
            false
          );
        }
        finally {
          resumed.close();
          temp.cleanup();
        }
      }
    );


    test(
      "resume never schedules product already terminal before interruption",
      () => {
        const temp =
          tempDatabase();

        const first =
          coordinator(
            temp.path
          );

        try {
          first.startNewRun(
            startInput(
              "run-terminal-skip"
            )
          );


          first.beginProduct(
            "https://example.com/p/a"
          );

          first.terminalizeProduct(
            "https://example.com/p/a",
            "ACCEPT"
          );


          first.interruptActiveRun();
        }
        finally {
          first.close();
        }


        const resumed =
          coordinator(
            temp.path
          );

        try {
          const plan =
            resumed.resumeRun(
              "run-terminal-skip"
            );

          expect(
            plan.queuedUrls
          ).toEqual([
            "https://example.com/p/b"
          ]);

          expect(
            plan.queuedUrls
          ).not.toContain(
            "https://example.com/p/a"
          );
        }
        finally {
          resumed.close();
          temp.cleanup();
        }
      }
    );


    test(
      "finalization refuses persisted pending work and keeps run RUNNING",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        try {
          runtime.startNewRun(
            startInput(
              "run-not-complete"
            )
          );


          expect(
            () =>
              runtime.finalizeRun()
          ).toThrow(
            /reconciliation|incomplete/i
          );


          expect(
            runtime.getActiveRun()
          ).toMatchObject({
            status:
              "RUNNING"
          });
        }
        finally {
          runtime.close();
          temp.cleanup();
        }
      }
    );


    test(
      "one coordinator instance owns only one active run",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        try {
          runtime.startNewRun(
            startInput(
              "run-one"
            )
          );


          expect(
            () =>
              runtime.startNewRun(
                startInput(
                  "run-two"
                )
              )
          ).toThrow(
            /active run|already owns/i
          );


          expect(
            () =>
              runtime.resumeRun(
                "run-one"
              )
          ).toThrow(
            /active run|already owns/i
          );
        }
        finally {
          runtime.close();
          temp.cleanup();
        }
      }
    );


    test(
      "close is idempotent and operations after close are rejected",
      () => {
        const temp =
          tempDatabase();

        const runtime =
          coordinator(
            temp.path
          );

        try {
          runtime.close();

          expect(
            () =>
              runtime.close()
          ).not.toThrow();


          expect(
            () =>
              runtime.startNewRun(
                startInput(
                  "run-after-close"
                )
              )
          ).toThrow(
            /closed/i
          );
        }
        finally {
          try {
            runtime.close();
          }
          finally {
            temp.cleanup();
          }
        }
      }
    );
  }
);