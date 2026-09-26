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
  RunReconciliation
} from "../../../src/v02/coverage/runReconciliation.ts";

import {
  SQLiteRunStore
} from "../../../src/v02/storage/sqliteRunStore.ts";


const NOW =
  "2026-09-18T04:00:00.000Z";


function tempDatabase():
  {
    directory:
      string;

    path:
      string;

    cleanup:
      () => void;
  } {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "camintel-run-ledger-reconciliation-"
      )
    );

  return {
    directory,

    path:
      join(
        directory,
        "run-ledger.sqlite"
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


function createStore(
  path:
    string
): SQLiteRunStore {
  return new SQLiteRunStore(
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


function runInput(
  runId:
    string =
      "run-10d-001"
) {
  return {
    runId,

    inputUrl:
      "https://example.com",

    canonicalOrigin:
      "https://example.com",

    startedAt:
      "2026-09-18T03:50:00.000Z",

    codeVersion:
      "9a7e5bb",

    configHash:
      "cfg-phase10d"
  };
}


function register(
  store:
    SQLiteRunStore,
  runId:
    string,
  urls:
    readonly string[]
): void {
  store.registerProductUrls(
    runId,
    urls.map(
      (
        canonicalUrl,
        index
      ) => ({
        canonicalUrl,

        discoveryScore:
          80 + index,

        sourcesJson:
          JSON.stringify([
            "TEST"
          ])
      })
    )
  );
}


describe(
  "Phase 10D persisted reconciliation",
  () => {

    test(
      "counts persistent DISCOVERED queue separately from total discovered scope",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            runInput();

          store.createRun(
            input
          );

          register(
            store,
            input.runId,
            [
              "https://example.com/p/1",
              "https://example.com/p/2",
              "https://example.com/p/3",
              "https://example.com/p/4"
            ]
          );

          expect(
            store.getReconciliationReport(
              input.runId
            )
          ).toEqual({
            runId:
              input.runId,

            discovered:
              4,

            pending:
              4,

            accepted:
              0,

            review:
              0,

            excluded:
              0,

            error:
              0,

            inProgress:
              0,

            accounted:
              4,

            balanced:
              true,

            complete:
              false
          });
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "persistent report remains balanced through mixed lifecycle states",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            runInput(
              "run-10d-mixed"
            );

          store.createRun(
            input
          );

          const urls = [
            "https://example.com/p/a",
            "https://example.com/p/b",
            "https://example.com/p/c",
            "https://example.com/p/d",
            "https://example.com/p/e"
          ];

          register(
            store,
            input.runId,
            urls
          );

          const terminals = [
            "ACCEPT",
            "REVIEW",
            "EXCLUDE",
            "ERROR"
          ] as const;

          for (
            let index = 0;
            index <
              terminals.length;
            index++
          ) {
            store.beginAttempt(
              input.runId,
              urls[index]!
            );

            store.terminalize(
              input.runId,
              urls[index]!,
              terminals[index]!
            );
          }

          expect(
            store.getReconciliationReport(
              input.runId
            )
          ).toMatchObject({
            discovered:
              5,

            pending:
              1,

            accepted:
              1,

            review:
              1,

            excluded:
              1,

            error:
              1,

            inProgress:
              0,

            accounted:
              5,

            balanced:
              true,

            complete:
              false
          });


          store.beginAttempt(
            input.runId,
            urls[4]!
          );

          expect(
            store.getReconciliationReport(
              input.runId
            )
          ).toMatchObject({
            pending:
              0,

            inProgress:
              1,

            complete:
              false
          });


          store.terminalize(
            input.runId,
            urls[4]!,
            "ACCEPT"
          );

          expect(
            store.getReconciliationReport(
              input.runId
            )
          ).toMatchObject({
            discovered:
              5,

            pending:
              0,

            accepted:
              2,

            review:
              1,

            excluded:
              1,

            error:
              1,

            inProgress:
              0,

            accounted:
              5,

            balanced:
              true,

            complete:
              true
          });
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "final persistent reconciliation matches Phase 9 invariant counts",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            runInput(
              "run-10d-phase9-equivalence"
            );

          const urls = [
            "https://example.com/p/accept",
            "https://example.com/p/review",
            "https://example.com/p/exclude",
            "https://example.com/p/error"
          ];

          store.createRun(
            input
          );

          register(
            store,
            input.runId,
            urls
          );


          store.beginAttempt(
            input.runId,
            urls[0]!
          );

          store.terminalize(
            input.runId,
            urls[0]!,
            "ACCEPT"
          );


          store.beginAttempt(
            input.runId,
            urls[1]!
          );

          store.terminalize(
            input.runId,
            urls[1]!,
            "REVIEW"
          );


          store.beginAttempt(
            input.runId,
            urls[2]!
          );

          store.terminalize(
            input.runId,
            urls[2]!,
            "EXCLUDE"
          );


          store.beginAttempt(
            input.runId,
            urls[3]!
          );

          store.terminalize(
            input.runId,
            urls[3]!,
            "ERROR"
          );


          const persisted =
            store.getReconciliationReport(
              input.runId
            );


          const phase9 =
            new RunReconciliation(
              input.runId,
              urls
            );

          phase9.markDecision(
            urls[0]!,
            "ACCEPT"
          );

          phase9.markDecision(
            urls[1]!,
            "REVIEW"
          );

          phase9.markDecision(
            urls[2]!,
            "EXCLUDE"
          );

          phase9.markError(
            urls[3]!,
            {
              stage:
                "DETAIL",

              errorClass:
                "TestError",

              message:
                "synthetic failure",

              attempts:
                1,

              lastStatus:
                null,

              retriable:
                true,

              diagnosticPath:
                null
            }
          );

          const legacy =
            phase9.assertComplete();


          expect(
            {
              discovered:
                persisted.discovered,

              accepted:
                persisted.accepted,

              review:
                persisted.review,

              excluded:
                persisted.excluded,

              error:
                persisted.error,

              inProgress:
                persisted.inProgress,

              balanced:
                persisted.balanced,

              complete:
                persisted.complete
            }
          ).toEqual({
            discovered:
              legacy.discovered,

            accepted:
              legacy.accepted,

            review:
              legacy.review,

            excluded:
              legacy.excluded,

            error:
              legacy.error,

            inProgress:
              legacy.inProgress,

            balanced:
              legacy.balanced,

            complete:
              legacy.complete
          });

          expect(
            persisted.pending
          ).toBe(
            0
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "unknown run cannot produce a reconciliation report",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          expect(
            () =>
              store.getReconciliationReport(
                "missing-run"
              )
          ).toThrow(
            /run.*registered|registered.*run/i
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );
  }
);


describe(
  "Phase 10D persisted run lifecycle",
  () => {

    test(
      "run transitions from CREATED to RUNNING exactly once",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            runInput(
              "run-10d-start"
            );

          store.createRun(
            input
          );

          expect(
            store.getRun(
              input.runId
            )?.status
          ).toBe(
            "CREATED"
          );

          store.startRun(
            input.runId
          );

          expect(
            store.getRun(
              input.runId
            )?.status
          ).toBe(
            "RUNNING"
          );

          expect(
            () =>
              store.startRun(
                input.runId
              )
          ).toThrow(
            /status|start/i
          );

          expect(
            store.getRun(
              input.runId
            )?.status
          ).toBe(
            "RUNNING"
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "RUNNING run can be interrupted without pretending it finished",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            runInput(
              "run-10d-interrupt"
            );

          store.createRun(
            input
          );

          store.startRun(
            input.runId
          );

          store.interruptRun(
            input.runId
          );

          expect(
            store.getRun(
              input.runId
            )
          ).toMatchObject({
            status:
              "INTERRUPTED",

            finishedAt:
              null
          });

          expect(
            () =>
              store.interruptRun(
                input.runId
              )
          ).toThrow(
            /status|interrupt/i
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "completeRun refuses incomplete reconciliation and leaves run RUNNING",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            runInput(
              "run-10d-incomplete"
            );

          store.createRun(
            input
          );

          store.startRun(
            input.runId
          );

          register(
            store,
            input.runId,
            [
              "https://example.com/p/pending"
            ]
          );

          expect(
            () =>
              store.completeRun(
                input.runId
              )
          ).toThrow(
            /reconciliation|incomplete/i
          );

          expect(
            store.getRun(
              input.runId
            )
          ).toMatchObject({
            status:
              "RUNNING",

            finishedAt:
              null
          });
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "completeRun sets COMPLETED when reconciliation has no technical errors",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            runInput(
              "run-10d-complete"
            );

          store.createRun(
            input
          );

          store.startRun(
            input.runId
          );

          register(
            store,
            input.runId,
            [
              "https://example.com/p/a",
              "https://example.com/p/b"
            ]
          );

          store.beginAttempt(
            input.runId,
            "https://example.com/p/a"
          );

          store.terminalize(
            input.runId,
            "https://example.com/p/a",
            "ACCEPT"
          );

          store.beginAttempt(
            input.runId,
            "https://example.com/p/b"
          );

          store.terminalize(
            input.runId,
            "https://example.com/p/b",
            "REVIEW"
          );

          store.completeRun(
            input.runId
          );

          expect(
            store.getRun(
              input.runId
            )
          ).toMatchObject({
            status:
              "COMPLETED",

            finishedAt:
              NOW
          });
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "completeRun sets COMPLETED_WITH_ERRORS when reconciliation is balanced with ERROR terminals",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            runInput(
              "run-10d-complete-errors"
            );

          store.createRun(
            input
          );

          store.startRun(
            input.runId
          );

          register(
            store,
            input.runId,
            [
              "https://example.com/p/error"
            ]
          );

          store.beginAttempt(
            input.runId,
            "https://example.com/p/error"
          );

          store.terminalize(
            input.runId,
            "https://example.com/p/error",
            "ERROR"
          );

          store.completeRun(
            input.runId
          );

          expect(
            store.getRun(
              input.runId
            )
          ).toMatchObject({
            status:
              "COMPLETED_WITH_ERRORS",

            finishedAt:
              NOW
          });
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "completed run lifecycle survives close and reopen",
      () => {
        const temp =
          tempDatabase();

        try {
          const input =
            runInput(
              "run-10d-reopen"
            );

          const first =
            createStore(
              temp.path
            );

          try {
            first.createRun(
              input
            );

            first.startRun(
              input.runId
            );

            register(
              first,
              input.runId,
              [
                "https://example.com/p/final"
              ]
            );

            first.beginAttempt(
              input.runId,
              "https://example.com/p/final"
            );

            first.terminalize(
              input.runId,
              "https://example.com/p/final",
              "ACCEPT"
            );

            first.completeRun(
              input.runId
            );
          }
          finally {
            first.close();
          }


          const reopened =
            createStore(
              temp.path
            );

          try {
            expect(
              reopened.getRun(
                input.runId
              )
            ).toMatchObject({
              status:
                "COMPLETED",

              finishedAt:
                NOW
            });

            expect(
              reopened.getReconciliationReport(
                input.runId
              )
            ).toMatchObject({
              discovered:
                1,

              pending:
                0,

              accepted:
                1,

              inProgress:
                0,

              complete:
                true
            });
          }
          finally {
            reopened.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );
  }
);