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
  SQLiteRunStore
} from "../../../src/v02/storage/sqliteRunStore.ts";

import {
  SQLiteIntelligenceAuditStore
} from "../../../src/v02/storage/sqliteIntelligenceAuditStore.ts";

import {
  SQLiteResumeStore
} from "../../../src/v02/storage/sqliteResumeStore.ts";


const NOW =
  "2026-09-18T07:00:00.000Z";


function tempDatabase() {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "camintel-phase10g-"
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


function runStore(
  path:
    string
): SQLiteRunStore {
  return new SQLiteRunStore(
    path,
    {
      now:
        () =>
          NOW
    }
  );
}


function resumeStore(
  path:
    string
): SQLiteResumeStore {
  return new SQLiteResumeStore(
    path,
    {
      now:
        () =>
          NOW
    }
  );
}


function createRun(
  store:
    SQLiteRunStore,
  runId:
    string,
  startedAt:
    string,
  origin:
    string =
      "https://example.com"
): void {
  store.createRun({
    runId,

    inputUrl:
      origin,

    canonicalOrigin:
      origin,

    startedAt,

    codeVersion:
      "037d37d",

    configHash:
      "cfg-phase10g"
  });
}


function registerUrls(
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
      canonicalUrl => ({
        canonicalUrl,

        discoveryScore:
          90,

        sourcesJson:
          "[]"
      })
    )
  );
}


function seedMixedInterruptedRun(
  path:
    string
): {
  runId:
    string;

  discovered:
    string;

  stale:
    string;

  accepted:
    string;

  review:
    string;

  retriableError:
    string;

  permanentError:
    string;
} {
  const ids = {
    runId:
      "run-resume-mixed",

    discovered:
      "https://example.com/p/discovered",

    stale:
      "https://example.com/p/stale",

    accepted:
      "https://example.com/p/accepted",

    review:
      "https://example.com/p/review",

    retriableError:
      "https://example.com/p/retry-error",

    permanentError:
      "https://example.com/p/permanent-error"
  };


  const store =
    runStore(
      path
    );

  try {
    createRun(
      store,
      ids.runId,
      "2026-09-18T06:00:00.000Z"
    );

    store.startRun(
      ids.runId
    );

    registerUrls(
      store,
      ids.runId,
      [
        ids.discovered,
        ids.stale,
        ids.accepted,
        ids.review,
        ids.retriableError,
        ids.permanentError
      ]
    );


    /*
     * Crash-like stale URL:
     * product IN_PROGRESS + acquisition STARTED.
     */
    store.beginAttempt(
      ids.runId,
      ids.stale
    );

    store.startDetailFetch(
      ids.runId,
      ids.stale
    );


    store.beginAttempt(
      ids.runId,
      ids.accepted
    );

    store.terminalize(
      ids.runId,
      ids.accepted,
      "ACCEPT"
    );


    store.beginAttempt(
      ids.runId,
      ids.review
    );

    store.terminalize(
      ids.runId,
      ids.review,
      "REVIEW"
    );


    store.beginAttempt(
      ids.runId,
      ids.retriableError
    );

    store.terminalize(
      ids.runId,
      ids.retriableError,
      "ERROR"
    );


    store.beginAttempt(
      ids.runId,
      ids.permanentError
    );

    store.terminalize(
      ids.runId,
      ids.permanentError,
      "ERROR"
    );


    store.interruptRun(
      ids.runId
    );
  }
  finally {
    store.close();
  }


  const audit =
    new SQLiteIntelligenceAuditStore(
      path,
      {
        now:
          () =>
            NOW
      }
    );

  try {
    audit.appendError({
      runId:
        ids.runId,

      canonicalUrl:
        ids.retriableError,

      stage:
        "DETAIL",

      errorClass:
        "TimeoutError",

      message:
        "retry me",

      attempts:
        1,

      lastStatus:
        503,

      retriable:
        true,

      diagnosticPath:
        null
    });


    audit.appendError({
      runId:
        ids.runId,

      canonicalUrl:
        ids.permanentError,

      stage:
        "DETAIL",

      errorClass:
        "BlockedError",

      message:
        "do not retry",

      attempts:
        1,

      lastStatus:
        403,

      retriable:
        false,

      diagnosticPath:
        null
    });
  }
  finally {
    audit.close();
  }


  return ids;
}


describe(
  "Phase 10G resume semantics",
  () => {

    test(
      "findLatestIncompleteRun ignores completed runs and other origins",
      () => {
        const temp =
          tempDatabase();

        try {
          const store =
            runStore(
              temp.path
            );

          try {
            createRun(
              store,
              "run-old-incomplete",
              "2026-09-18T05:00:00.000Z"
            );

            store.startRun(
              "run-old-incomplete"
            );

            store.interruptRun(
              "run-old-incomplete"
            );


            createRun(
              store,
              "run-new-completed",
              "2026-09-18T06:00:00.000Z"
            );

            store.startRun(
              "run-new-completed"
            );

            store.completeRun(
              "run-new-completed"
            );


            createRun(
              store,
              "run-other-origin",
              "2026-09-18T06:30:00.000Z",
              "https://other.example.com"
            );

            store.startRun(
              "run-other-origin"
            );

            store.interruptRun(
              "run-other-origin"
            );
          }
          finally {
            store.close();
          }


          const resume =
            resumeStore(
              temp.path
            );

          try {
            expect(
              resume.findLatestIncompleteRun(
                "https://example.com"
              )
            ).toMatchObject({
              runId:
                "run-old-incomplete",

              status:
                "INTERRUPTED"
            });

            expect(
              resume.findLatestIncompleteRun(
                "https://missing.example.com"
              )
            ).toBeNull();
          }
          finally {
            resume.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "resume queues DISCOVERED stale IN_PROGRESS and retriable ERROR only",
      () => {
        const temp =
          tempDatabase();

        try {
          const ids =
            seedMixedInterruptedRun(
              temp.path
            );

          const resume =
            resumeStore(
              temp.path
            );

          let plan;

          try {
            plan =
              resume.prepareResume(
                ids.runId
              );
          }
          finally {
            resume.close();
          }


          expect(
            plan.queuedUrls
          ).toEqual(
            [
              ids.discovered,
              ids.retriableError,
              ids.stale
            ].sort()
          );

          expect(
            plan
          ).toMatchObject({
            alreadyDiscovered:
              1,

            recoveredInProgress:
              1,

            requeuedRetriableErrors:
              1,

            staleFetchesRecovered:
              1,

            skippedTerminal:
              3
          });


          const inspect =
            runStore(
              temp.path
            );

          try {
            const rows =
              inspect.listProductUrls(
                ids.runId
              );

            const states =
              new Map(
                rows.map(
                  row => [
                    row.canonicalUrl,
                    row.state
                  ]
                )
              );

            expect(
              states.get(
                ids.discovered
              )
            ).toBe(
              "DISCOVERED"
            );

            expect(
              states.get(
                ids.stale
              )
            ).toBe(
              "DISCOVERED"
            );

            expect(
              states.get(
                ids.retriableError
              )
            ).toBe(
              "DISCOVERED"
            );

            expect(
              states.get(
                ids.accepted
              )
            ).toBe(
              "ACCEPT"
            );

            expect(
              states.get(
                ids.review
              )
            ).toBe(
              "REVIEW"
            );

            expect(
              states.get(
                ids.permanentError
              )
            ).toBe(
              "ERROR"
            );

            expect(
              inspect.getRun(
                ids.runId
              )?.status
            ).toBe(
              "RUNNING"
            );
          }
          finally {
            inspect.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "resume closes stale STARTED acquisition as FAILED without deleting history",
      () => {
        const temp =
          tempDatabase();

        try {
          const ids =
            seedMixedInterruptedRun(
              temp.path
            );

          const resume =
            resumeStore(
              temp.path
            );

          try {
            resume.prepareResume(
              ids.runId
            );
          }
          finally {
            resume.close();
          }


          const inspect =
            runStore(
              temp.path
            );

          try {
            const fetches =
              inspect.listDetailFetches(
                ids.runId,
                ids.stale
              );

            expect(
              fetches
            ).toHaveLength(
              1
            );

            expect(
              fetches[0]
            ).toMatchObject({
              attempt:
                1,

              status:
                "FAILED",

              finishedAt:
                NOW,

              errorClass:
                "ResumeRecovery"
            });

            expect(
              fetches[0]
                ?.errorMessage
            ).toMatch(
              /resume|recovered|crash/i
            );
          }
          finally {
            inspect.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "terminal URLs never enter resume queue",
      () => {
        const temp =
          tempDatabase();

        try {
          const ids =
            seedMixedInterruptedRun(
              temp.path
            );

          const resume =
            resumeStore(
              temp.path
            );

          try {
            const queue =
              resume.prepareResume(
                ids.runId
              )
                .queuedUrls;

            expect(
              queue
            ).not.toContain(
              ids.accepted
            );

            expect(
              queue
            ).not.toContain(
              ids.review
            );

            expect(
              queue
            ).not.toContain(
              ids.permanentError
            );
          }
          finally {
            resume.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "crash-left RUNNING run is recoverable without graceful interrupt",
      () => {
        const temp =
          tempDatabase();

        try {
          const store =
            runStore(
              temp.path
            );

          try {
            createRun(
              store,
              "run-crash-running",
              "2026-09-18T06:10:00.000Z"
            );

            store.startRun(
              "run-crash-running"
            );

            registerUrls(
              store,
              "run-crash-running",
              [
                "https://example.com/p/pending",
                "https://example.com/p/stale"
              ]
            );

            store.beginAttempt(
              "run-crash-running",
              "https://example.com/p/stale"
            );
          }
          finally {
            /*
             * Simulates process death state:
             * persisted run still says RUNNING.
             */
            store.close();
          }


          const resume =
            resumeStore(
              temp.path
            );

          try {
            const plan =
              resume.prepareResume(
                "run-crash-running"
              );

            expect(
              plan.queuedUrls
            ).toEqual([
              "https://example.com/p/pending",
              "https://example.com/p/stale"
            ]);

            expect(
              plan.recoveredInProgress
            ).toBe(
              1
            );
          }
          finally {
            resume.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "prepareResume is idempotent and never duplicates queue entries",
      () => {
        const temp =
          tempDatabase();

        try {
          const ids =
            seedMixedInterruptedRun(
              temp.path
            );

          const resume =
            resumeStore(
              temp.path
            );

          try {
            const first =
              resume.prepareResume(
                ids.runId
              );

            const second =
              resume.prepareResume(
                ids.runId
              );

            expect(
              second.queuedUrls
            ).toEqual(
              first.queuedUrls
            );

            expect(
              second.recoveredInProgress
            ).toBe(
              0
            );

            expect(
              second.requeuedRetriableErrors
            ).toBe(
              0
            );

            expect(
              second.staleFetchesRecovered
            ).toBe(
              0
            );

            expect(
              second.alreadyDiscovered
            ).toBe(
              first.queuedUrls.length
            );

            expect(
              new Set(
                second.queuedUrls
              ).size
            ).toBe(
              second.queuedUrls.length
            );
          }
          finally {
            resume.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "completed run cannot be resumed",
      () => {
        const temp =
          tempDatabase();

        try {
          const store =
            runStore(
              temp.path
            );

          try {
            createRun(
              store,
              "run-done",
              "2026-09-18T06:20:00.000Z"
            );

            store.startRun(
              "run-done"
            );

            store.completeRun(
              "run-done"
            );
          }
          finally {
            store.close();
          }


          const resume =
            resumeStore(
              temp.path
            );

          try {
            expect(
              () =>
                resume.prepareResume(
                  "run-done"
                )
            ).toThrow(
              /not resumable|COMPLETED/i
            );
          }
          finally {
            resume.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "CREATED run can resume after URLs were persisted before workers started",
      () => {
        const temp =
          tempDatabase();

        try {
          const store =
            runStore(
              temp.path
            );

          try {
            createRun(
              store,
              "run-created",
              "2026-09-18T06:40:00.000Z"
            );

            registerUrls(
              store,
              "run-created",
              [
                "https://example.com/p/a",
                "https://example.com/p/b"
              ]
            );
          }
          finally {
            store.close();
          }


          const resume =
            resumeStore(
              temp.path
            );

          try {
            expect(
              resume.prepareResume(
                "run-created"
              )
            ).toMatchObject({
              queuedUrls: [
                "https://example.com/p/a",
                "https://example.com/p/b"
              ],

              alreadyDiscovered:
                2
            });
          }
          finally {
            resume.close();
          }


          const inspect =
            runStore(
              temp.path
            );

          try {
            expect(
              inspect.getRun(
                "run-created"
              )?.status
            ).toBe(
              "RUNNING"
            );
          }
          finally {
            inspect.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );
  }
);