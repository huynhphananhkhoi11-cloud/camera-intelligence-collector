import {
  DatabaseSync
} from "node:sqlite";

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
  SQLiteRunStore,
  configureSqliteConnection
} from "../../../src/v02/storage/sqliteRunStore.ts";


const NOW =
  "2026-09-18T03:10:00.000Z";


function pragmaScalar(
  db:
    DatabaseSync,
  pragma:
    string
): unknown {
  const row =
    db.prepare(
      pragma
    ).get();

  if (
    !row ||
    typeof row !==
      "object"
  ) {
    return undefined;
  }

  return Object.values(
    row
  )[0];
}


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
        "camintel-run-store-"
      )
    );

  const path =
    join(
      directory,
      "run-ledger.sqlite"
    );

  return {
    directory,
    path,

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


function baseRun() {
  return {
    runId:
      "run-core-001",

    inputUrl:
      "https://example.com",

    canonicalOrigin:
      "https://example.com",

    startedAt:
      "2026-09-18T03:00:00.000Z",

    codeVersion:
      "6ea1760",

    configHash:
      "cfg-core-001"
  };
}


describe(
  "Phase 10C SQLiteRunStore",
  () => {

    test(
      "configures required SQLite connection policy",
      () => {
        const temp =
          tempDatabase();

        const db =
          new DatabaseSync(
            temp.path
          );

        try {
          configureSqliteConnection(
            db
          );

          expect(
            String(
              pragmaScalar(
                db,
                "PRAGMA journal_mode"
              )
            ).toLowerCase()
          ).toBe(
            "wal"
          );

          expect(
            Number(
              pragmaScalar(
                db,
                "PRAGMA foreign_keys"
              )
            )
          ).toBe(
            1
          );

          expect(
            Number(
              pragmaScalar(
                db,
                "PRAGMA synchronous"
              )
            )
          ).toBe(
            2
          );

          expect(
            Number(
              pragmaScalar(
                db,
                "PRAGMA busy_timeout"
              )
            )
          ).toBe(
            5000
          );
        }
        finally {
          db.close();
          temp.cleanup();
        }
      }
    );


    test(
      "createRun persists a CREATED run record",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          expect(
            store.getRun(
              input.runId
            )
          ).toEqual({
            ...input,

            finishedAt:
              null,

            status:
              "CREATED"
          });
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "registerProductUrls deduplicates canonical URLs and starts at DISCOVERED",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          store.registerProductUrls(
            input.runId,
            [
              {
                canonicalUrl:
                  "https://example.com/p/1",

                discoveryScore:
                  80,

                sourcesJson:
                  JSON.stringify([
                    "SITEMAP"
                  ])
              },
              {
                canonicalUrl:
                  "https://example.com/p/1",

                discoveryScore:
                  80,

                sourcesJson:
                  JSON.stringify([
                    "SITEMAP"
                  ])
              }
            ]
          );

          const rows =
            store.listProductUrls(
              input.runId
            );

          expect(
            rows
          ).toHaveLength(
            1
          );

          expect(
            rows[0]
          ).toMatchObject({
            runId:
              input.runId,

            canonicalUrl:
              "https://example.com/p/1",

            discoveryScore:
              80,

            state:
              "DISCOVERED",

            attempts:
              0,

            discoveredAt:
              NOW,

            updatedAt:
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
      "beginAttempt atomically moves DISCOVERED to IN_PROGRESS and increments attempts",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          store.registerProductUrls(
            input.runId,
            [
              {
                canonicalUrl:
                  "https://example.com/p/1",

                discoveryScore:
                  90,

                sourcesJson:
                  "[]"
              }
            ]
          );

          store.beginAttempt(
            input.runId,
            "https://example.com/p/1"
          );

          expect(
            store.listProductUrls(
              input.runId
            )[0]
          ).toMatchObject({
            state:
              "IN_PROGRESS",

            attempts:
              1,

            updatedAt:
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
      "terminalize requires IN_PROGRESS and prevents double terminalization",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          store.registerProductUrls(
            input.runId,
            [
              {
                canonicalUrl:
                  "https://example.com/p/1",

                discoveryScore:
                  null,

                sourcesJson:
                  "[]"
              }
            ]
          );

          store.beginAttempt(
            input.runId,
            "https://example.com/p/1"
          );

          store.terminalize(
            input.runId,
            "https://example.com/p/1",
            "ACCEPT"
          );

          expect(
            store.listProductUrls(
              input.runId
            )[0]
              ?.state
          ).toBe(
            "ACCEPT"
          );

          expect(
            () =>
              store.terminalize(
                input.runId,
                "https://example.com/p/1",
                "REVIEW"
              )
          ).toThrow(
            /terminal|state/i
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "unknown URL cannot begin an attempt",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          expect(
            () =>
              store.beginAttempt(
                input.runId,
                "https://example.com/unknown"
              )
          ).toThrow(
            /registered|unknown|url/i
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "registerProductUrls rolls back the whole batch if one row violates schema",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          expect(
            () =>
              store.registerProductUrls(
                input.runId,
                [
                  {
                    canonicalUrl:
                      "https://example.com/p/valid",

                    discoveryScore:
                      50,

                    sourcesJson:
                      "[]"
                  },
                  {
                    canonicalUrl:
                      "https://example.com/p/invalid",

                    discoveryScore:
                      101,

                    sourcesJson:
                      "[]"
                  }
                ]
              )
          ).toThrow();

          expect(
            store.listProductUrls(
              input.runId
            )
          ).toEqual(
            []
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
  "Phase 10C SQLiteRunStore hardening",
  () => {

    test(
      "persists run and terminal URL state across close and reopen",
      () => {
        const temp =
          tempDatabase();

        try {
          const input =
            baseRun();

          const first =
            createStore(
              temp.path
            );

          try {
            first.createRun(
              input
            );

            first.registerProductUrls(
              input.runId,
              [
                {
                  canonicalUrl:
                    "https://example.com/p/reopen",

                  discoveryScore:
                    88,

                  sourcesJson:
                    JSON.stringify([
                      "SITEMAP",
                      "DOM"
                    ])
                }
              ]
            );

            first.beginAttempt(
              input.runId,
              "https://example.com/p/reopen"
            );

            first.terminalize(
              input.runId,
              "https://example.com/p/reopen",
              "REVIEW"
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
            ).toEqual({
              ...input,

              finishedAt:
                null,

              status:
                "CREATED"
            });

            expect(
              reopened.listProductUrls(
                input.runId
              )
            ).toEqual([
              {
                runId:
                  input.runId,

                canonicalUrl:
                  "https://example.com/p/reopen",

                discoveryScore:
                  88,

                sourcesJson:
                  JSON.stringify([
                    "SITEMAP",
                    "DOM"
                  ]),

                state:
                  "REVIEW",

                attempts:
                  1,

                discoveredAt:
                  NOW,

                updatedAt:
                  NOW
              }
            ]);
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


    test(
      "repeated registration remains idempotent and preserves first discovery metadata",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          store.registerProductUrls(
            input.runId,
            [
              {
                canonicalUrl:
                  "https://example.com/p/stable",

                discoveryScore:
                  40,

                sourcesJson:
                  JSON.stringify([
                    "SITEMAP"
                  ])
              }
            ]
          );

          store.registerProductUrls(
            input.runId,
            [
              {
                canonicalUrl:
                  "https://example.com/p/stable",

                discoveryScore:
                  99,

                sourcesJson:
                  JSON.stringify([
                    "DOM"
                  ])
              }
            ]
          );

          expect(
            store.listProductUrls(
              input.runId
            )
          ).toEqual([
            {
              runId:
                input.runId,

              canonicalUrl:
                "https://example.com/p/stable",

              discoveryScore:
                40,

              sourcesJson:
                JSON.stringify([
                  "SITEMAP"
                ]),

              state:
                "DISCOVERED",

              attempts:
                0,

              discoveredAt:
                NOW,

              updatedAt:
                NOW
            }
          ]);
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "second beginAttempt is rejected without incrementing attempts again",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          store.registerProductUrls(
            input.runId,
            [
              {
                canonicalUrl:
                  "https://example.com/p/attempt",

                discoveryScore:
                  70,

                sourcesJson:
                  "[]"
              }
            ]
          );

          store.beginAttempt(
            input.runId,
            "https://example.com/p/attempt"
          );

          expect(
            () =>
              store.beginAttempt(
                input.runId,
                "https://example.com/p/attempt"
              )
          ).toThrow(
            /state|attempt/i
          );

          expect(
            store.listProductUrls(
              input.runId
            )[0]
          ).toMatchObject({
            state:
              "IN_PROGRESS",

            attempts:
              1
          });
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "terminalize rejects DISCOVERED URL and leaves lifecycle unchanged",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          store.registerProductUrls(
            input.runId,
            [
              {
                canonicalUrl:
                  "https://example.com/p/not-started",

                discoveryScore:
                  null,

                sourcesJson:
                  "[]"
              }
            ]
          );

          expect(
            () =>
              store.terminalize(
                input.runId,
                "https://example.com/p/not-started",
                "ACCEPT"
              )
          ).toThrow(
            /state|terminal/i
          );

          expect(
            store.listProductUrls(
              input.runId
            )[0]
          ).toMatchObject({
            state:
              "DISCOVERED",

            attempts:
              0
          });
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "duplicate run creation fails without overwriting original run",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          expect(
            () =>
              store.createRun({
                ...input,

                inputUrl:
                  "https://changed.example.com",

                configHash:
                  "cfg-overwrite-attempt"
              })
          ).toThrow();

          expect(
            store.getRun(
              input.runId
            )
          ).toEqual({
            ...input,

            finishedAt:
              null,

            status:
              "CREATED"
          });
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "blank sourcesJson rolls back an entire mixed registration batch",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const input =
            baseRun();

          store.createRun(
            input
          );

          expect(
            () =>
              store.registerProductUrls(
                input.runId,
                [
                  {
                    canonicalUrl:
                      "https://example.com/p/good",

                    discoveryScore:
                      50,

                    sourcesJson:
                      "[]"
                  },
                  {
                    canonicalUrl:
                      "https://example.com/p/bad",

                    discoveryScore:
                      50,

                    sourcesJson:
                      "   "
                  }
                ]
              )
          ).toThrow(
            /sourcesJson/i
          );

          expect(
            store.listProductUrls(
              input.runId
            )
          ).toEqual(
            []
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "close is idempotent and operations after close are rejected",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          store.close();

          expect(
            () =>
              store.close()
          ).not.toThrow();

          expect(
            () =>
              store.getRun(
                "run-after-close"
              )
          ).toThrow(
            /closed/i
          );

          expect(
            () =>
              store.listProductUrls(
                "run-after-close"
              )
          ).toThrow(
            /closed/i
          );
        }
        finally {
          try {
            store.close();
          }
          finally {
            temp.cleanup();
          }
        }
      }
    );
  }
);