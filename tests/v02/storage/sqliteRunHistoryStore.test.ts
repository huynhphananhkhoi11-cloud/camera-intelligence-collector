import {
  createHash
} from "node:crypto";

import {
  mkdtempSync,
  readFileSync,
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
  isResumableRunStatus
} from "../../../src/v02/storage/runHistoryStore.ts";

import {
  SQLiteRunHistoryStore
} from "../../../src/v02/storage/sqliteRunHistoryStore.ts";

import type {
  RunStatus
} from "../../../src/v02/storage/runStore.ts";


function tempDatabase():
  {
    readonly directory:
      string;

    readonly path:
      string;

    readonly cleanup:
      () =>
        void;
  } {

  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "camintel-run-history-"
      )
    );


  return {
    directory,

    path:
      join(
        directory,
        "state.sqlite"
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


function createRun(
  store:
    SQLiteRunStore,

  runId:
    string,

  startedAt:
    string
): void {

  store.createRun({
    runId,

    inputUrl:
      `https://example.com/catalog/${runId}`,

    canonicalOrigin:
      "https://example.com",

    startedAt,

    codeVersion:
      "11h1-test",

    configHash:
      "cfg-history"
  });
}


function registerUrls(
  store:
    SQLiteRunStore,

  runId:
    string,

  count:
    number
): string[] {

  const urls =
    Array.from(
      {
        length:
          count
      },
      (
        _,
        index
      ) =>
        `https://example.com/${runId}/p/${index + 1}`
    );


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


  return urls;
}


function sha256(
  path:
    string
): string {

  return createHash(
    "sha256"
  )
    .update(
      readFileSync(
        path
      )
    )
    .digest(
      "hex"
    );
}


function seedHistory(
  path:
    string
): void {

  const store =
    new SQLiteRunStore(
      path,
      {
        now:
          () =>
            "2026-09-18T08:00:00.000Z"
      }
    );


  try {

    /*
     * CREATED:
     * two persisted DISCOVERED URLs.
     */
    createRun(
      store,
      "run-created",
      "2026-09-18T03:00:00.000Z"
    );

    registerUrls(
      store,
      "run-created",
      2
    );


    /*
     * COMPLETED:
     * terminal run must remain visible in history but not resumable.
     */
    createRun(
      store,
      "run-completed",
      "2026-09-18T04:00:00.000Z"
    );

    store.startRun(
      "run-completed"
    );

    store.completeRun(
      "run-completed"
    );


    /*
     * INTERRUPTED:
     * one DISCOVERED + one IN_PROGRESS = remaining 2.
     */
    createRun(
      store,
      "run-interrupted",
      "2026-09-18T05:00:00.000Z"
    );

    store.startRun(
      "run-interrupted"
    );

    const interruptedUrls =
      registerUrls(
        store,
        "run-interrupted",
        2
      );

    store.beginAttempt(
      "run-interrupted",
      interruptedUrls[0]!
    );

    store.interruptRun(
      "run-interrupted"
    );


    /*
     * RUNNING crash residue:
     * two DISCOVERED + one IN_PROGRESS = remaining 3.
     */
    createRun(
      store,
      "run-running",
      "2026-09-18T06:00:00.000Z"
    );

    store.startRun(
      "run-running"
    );

    const runningUrls =
      registerUrls(
        store,
        "run-running",
        3
      );

    store.beginAttempt(
      "run-running",
      runningUrls[0]!
    );
  }
  finally {

    store.close();
  }
}


describe(
  "Phase 11H.1 read-only run history",
  () => {

    test(
      "resumability exactly mirrors locked resume semantics",
      () => {

        const resumable:
          readonly RunStatus[] = [
            "CREATED",
            "RUNNING",
            "INTERRUPTED"
          ];


        const terminal:
          readonly RunStatus[] = [
            "COMPLETED",
            "COMPLETED_WITH_ERRORS",
            "FAILED_INVARIANT",
            "FAILED_FATAL"
          ];


        for (
          const status
          of resumable
        ) {

          expect(
            isResumableRunStatus(
              status
            )
          ).toBe(
            true
          );
        }


        for (
          const status
          of terminal
        ) {

          expect(
            isResumableRunStatus(
              status
            )
          ).toBe(
            false
          );
        }
      }
    );


    test(
      "lists newest runs with persisted remaining counts",
      () => {

        const temp =
          tempDatabase();


        try {

          seedHistory(
            temp.path
          );


          const history =
            new SQLiteRunHistoryStore(
              temp.path
            );


          try {

            expect(
              history.listRecentRuns()
            ).toEqual([
              {
                runId:
                  "run-running",

                inputUrl:
                  "https://example.com/catalog/run-running",

                canonicalOrigin:
                  "https://example.com",

                startedAt:
                  "2026-09-18T06:00:00.000Z",

                finishedAt:
                  null,

                status:
                  "RUNNING",

                remaining:
                  3,

                resumable:
                  true
              },
              {
                runId:
                  "run-interrupted",

                inputUrl:
                  "https://example.com/catalog/run-interrupted",

                canonicalOrigin:
                  "https://example.com",

                startedAt:
                  "2026-09-18T05:00:00.000Z",

                finishedAt:
                  null,

                status:
                  "INTERRUPTED",

                remaining:
                  2,

                resumable:
                  true
              },
              {
                runId:
                  "run-completed",

                inputUrl:
                  "https://example.com/catalog/run-completed",

                canonicalOrigin:
                  "https://example.com",

                startedAt:
                  "2026-09-18T04:00:00.000Z",

                finishedAt:
                  "2026-09-18T08:00:00.000Z",

                status:
                  "COMPLETED",

                remaining:
                  0,

                resumable:
                  false
              },
              {
                runId:
                  "run-created",

                inputUrl:
                  "https://example.com/catalog/run-created",

                canonicalOrigin:
                  "https://example.com",

                startedAt:
                  "2026-09-18T03:00:00.000Z",

                finishedAt:
                  null,

                status:
                  "CREATED",

                remaining:
                  2,

                resumable:
                  true
              }
            ]);
          }
          finally {

            history.close();
          }
        }
        finally {

          temp.cleanup();
        }
      }
    );


    test(
      "limit applies after deterministic newest-first ordering",
      () => {

        const temp =
          tempDatabase();


        try {

          seedHistory(
            temp.path
          );


          const history =
            new SQLiteRunHistoryStore(
              temp.path
            );


          try {

            expect(
              history.listRecentRuns(
                2
              )
                .map(
                  run =>
                    run.runId
                )
            ).toEqual([
              "run-running",
              "run-interrupted"
            ]);
          }
          finally {

            history.close();
          }
        }
        finally {

          temp.cleanup();
        }
      }
    );


    test(
      "history query does not modify database bytes",
      () => {

        const temp =
          tempDatabase();


        try {

          seedHistory(
            temp.path
          );


          const before =
            sha256(
              temp.path
            );


          const history =
            new SQLiteRunHistoryStore(
              temp.path
            );


          try {

            expect(
              history.listRecentRuns()
            ).toHaveLength(
              4
            );
          }
          finally {

            history.close();
          }


          expect(
            sha256(
              temp.path
            )
          ).toBe(
            before
          );
        }
        finally {

          temp.cleanup();
        }
      }
    );


    test(
      "read-only mode refuses to create a missing database",
      () => {

        const temp =
          tempDatabase();


        try {

          const missing =
            join(
              temp.directory,
              "missing.sqlite"
            );


          expect(
            () =>
              new SQLiteRunHistoryStore(
                missing
              )
          ).toThrow();
        }
        finally {

          temp.cleanup();
        }
      }
    );


    test(
      "limit must be an integer from 1 to 100",
      () => {

        const temp =
          tempDatabase();


        try {

          seedHistory(
            temp.path
          );


          const history =
            new SQLiteRunHistoryStore(
              temp.path
            );


          try {

            expect(
              () =>
                history.listRecentRuns(
                  0
                )
            ).toThrow(
              /limit/i
            );


            expect(
              () =>
                history.listRecentRuns(
                  101
                )
            ).toThrow(
              /limit/i
            );


            expect(
              () =>
                history.listRecentRuns(
                  1.5
                )
            ).toThrow(
              /limit/i
            );
          }
          finally {

            history.close();
          }
        }
        finally {

          temp.cleanup();
        }
      }
    );


    test(
      "close is idempotent and reads after close fail",
      () => {

        const temp =
          tempDatabase();


        try {

          seedHistory(
            temp.path
          );


          const history =
            new SQLiteRunHistoryStore(
              temp.path
            );


          history.close();


          expect(
            () =>
              history.close()
          ).not.toThrow();


          expect(
            () =>
              history.listRecentRuns()
          ).toThrow(
            /closed/i
          );
        }
        finally {

          temp.cleanup();
        }
      }
    );
  }
);