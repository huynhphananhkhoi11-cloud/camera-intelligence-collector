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


const NOW =
  "2026-09-18T05:00:00.000Z";

const HASH_A =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const HASH_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

const REPLAY_JSON =
  JSON.stringify({
    schemaVersion:
      "camera-intelligence.raw-product-facts.v1",

    acquisition: {
      requestedUrl:
        "https://example.com/p/1",

      finalUrl:
        "https://example.com/p/1"
    },

    facts: {
      productName:
        "Camera Test"
    }
  });


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
        "camintel-phase10e-"
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


function prepareInProgressProduct(
  store:
    SQLiteRunStore,
  runId:
    string =
      "run-phase10e",
  url:
    string =
      "https://example.com/p/1"
): void {
  store.createRun({
    runId,

    inputUrl:
      "https://example.com",

    canonicalOrigin:
      "https://example.com",

    startedAt:
      "2026-09-18T04:55:00.000Z",

    codeVersion:
      "058fe31",

    configHash:
      "cfg-phase10e"
  });

  store.startRun(
    runId
  );

  store.registerProductUrls(
    runId,
    [
      {
        canonicalUrl:
          url,

        discoveryScore:
          90,

        sourcesJson:
          JSON.stringify([
            "TEST"
          ])
      }
    ]
  );

  store.beginAttempt(
    runId,
    url
  );
}


describe(
  "Phase 10E detail fetch attempts and raw facts",
  () => {

    test(
      "startDetailFetch creates durable STARTED acquisition attempt",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          prepareInProgressProduct(
            store
          );

          const fetch =
            store.startDetailFetch(
              "run-phase10e",
              "https://example.com/p/1"
            );

          expect(
            fetch
          ).toMatchObject({
            runId:
              "run-phase10e",

            canonicalUrl:
              "https://example.com/p/1",

            attempt:
              1,

            status:
              "STARTED",

            startedAt:
              NOW,

            finishedAt:
              null,

            finalUrl:
              null,

            httpStatus:
              null,

            durationMs:
              null,

            errorClass:
              null,

            errorMessage:
              null,

            contentHash:
              null,

            snapshotPath:
              null
          });

          expect(
            store.listDetailFetches(
              "run-phase10e",
              "https://example.com/p/1"
            )
          ).toHaveLength(
            1
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "multiple acquisition retries are recorded independently from product processing attempts",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          prepareInProgressProduct(
            store
          );

          store.startDetailFetch(
            "run-phase10e",
            "https://example.com/p/1"
          );

          store.finishDetailFetch(
            "run-phase10e",
            "https://example.com/p/1",
            {
              status:
                "FAILED",

              finalUrl:
                null,

              httpStatus:
                null,

              durationMs:
                5000,

              errorClass:
                "TimeoutError",

              errorMessage:
                "navigation timeout",

              contentHash:
                null,

              snapshotPath:
                null,

              rawFacts:
                null
            }
          );


          const second =
            store.startDetailFetch(
              "run-phase10e",
              "https://example.com/p/1"
            );

          expect(
            second.attempt
          ).toBe(
            2
          );


          store.finishDetailFetch(
            "run-phase10e",
            "https://example.com/p/1",
            {
              status:
                "SUCCEEDED",

              finalUrl:
                "https://example.com/p/1",

              httpStatus:
                200,

              durationMs:
                120,

              errorClass:
                null,

              errorMessage:
                null,

              contentHash:
                HASH_A,

              snapshotPath:
                "snapshots/p1.json",

              rawFacts: {
                contentHash:
                  HASH_A,

                extractorVersion:
                  "raw-product-facts-v1",

                factsJson:
                  REPLAY_JSON,

                snapshotPath:
                  "snapshots/p1.json"
              }
            }
          );


          const fetches =
            store.listDetailFetches(
              "run-phase10e",
              "https://example.com/p/1"
            );

          expect(
            fetches.map(
              row => ({
                attempt:
                  row.attempt,

                status:
                  row.status
              })
            )
          ).toEqual([
            {
              attempt:
                1,

              status:
                "FAILED"
            },
            {
              attempt:
                2,

              status:
                "SUCCEEDED"
            }
          ]);


          expect(
            store.listProductUrls(
              "run-phase10e"
            )[0]
              ?.attempts
          ).toBe(
            1
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "successful fetch persists replayable raw facts without changing business decision",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          prepareInProgressProduct(
            store
          );

          store.startDetailFetch(
            "run-phase10e",
            "https://example.com/p/1"
          );

          const finished =
            store.finishDetailFetch(
              "run-phase10e",
              "https://example.com/p/1",
              {
                status:
                  "SUCCEEDED",

                finalUrl:
                  "https://example.com/p/1",

                httpStatus:
                  200,

                durationMs:
                  150,

                errorClass:
                  null,

                errorMessage:
                  null,

                contentHash:
                  HASH_A,

                snapshotPath:
                  "snapshots/p1.json",

                rawFacts: {
                  contentHash:
                    HASH_A,

                  extractorVersion:
                    "raw-product-facts-v1",

                  factsJson:
                    REPLAY_JSON,

                  snapshotPath:
                    "snapshots/p1.json"
                }
              }
            );

          expect(
            finished
          ).toMatchObject({
            status:
              "SUCCEEDED",

            httpStatus:
              200,

            durationMs:
              150,

            contentHash:
              HASH_A,

            snapshotPath:
              "snapshots/p1.json",

            finishedAt:
              NOW
          });


          const facts =
            store.listRawFacts(
              "run-phase10e",
              "https://example.com/p/1"
            );

          expect(
            facts
          ).toHaveLength(
            1
          );

          expect(
            facts[0]
          ).toMatchObject({
            runId:
              "run-phase10e",

            canonicalUrl:
              "https://example.com/p/1",

            contentHash:
              HASH_A,

            extractorVersion:
              "raw-product-facts-v1",

            factsJson:
              REPLAY_JSON,

            capturedAt:
              NOW,

            snapshotPath:
              "snapshots/p1.json"
          });


          expect(
            JSON.parse(
              facts[0]!.factsJson
            )
          ).toEqual(
            JSON.parse(
              REPLAY_JSON
            )
          );


          expect(
            store.listProductUrls(
              "run-phase10e"
            )[0]
              ?.state
          ).toBe(
            "IN_PROGRESS"
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "invalid successful raw-facts payload leaves STARTED fetch unchanged",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          prepareInProgressProduct(
            store
          );

          store.startDetailFetch(
            "run-phase10e",
            "https://example.com/p/1"
          );

          expect(
            () =>
              store.finishDetailFetch(
                "run-phase10e",
                "https://example.com/p/1",
                {
                  status:
                    "SUCCEEDED",

                  finalUrl:
                    "https://example.com/p/1",

                  httpStatus:
                    200,

                  durationMs:
                    100,

                  errorClass:
                    null,

                  errorMessage:
                    null,

                  contentHash:
                    HASH_A,

                  snapshotPath:
                    null,

                  rawFacts: {
                    contentHash:
                      HASH_B,

                    extractorVersion:
                      "raw-product-facts-v1",

                    factsJson:
                      REPLAY_JSON,

                    snapshotPath:
                      null
                  }
                }
              )
          ).toThrow(
            /contentHash/i
          );


          expect(
            store.listDetailFetches(
              "run-phase10e",
              "https://example.com/p/1"
            )[0]
          ).toMatchObject({
            status:
              "STARTED",

            finishedAt:
              null
          });

          expect(
            store.listRawFacts(
              "run-phase10e",
              "https://example.com/p/1"
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
      "crash-style close and reopen preserves unfinished acquisition state",
      () => {
        const temp =
          tempDatabase();

        try {
          const first =
            createStore(
              temp.path
            );

          try {
            prepareInProgressProduct(
              first
            );

            first.startDetailFetch(
              "run-phase10e",
              "https://example.com/p/1"
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
              reopened.listProductUrls(
                "run-phase10e"
              )[0]
            ).toMatchObject({
              state:
                "IN_PROGRESS",

              attempts:
                1
            });

            expect(
              reopened.listDetailFetches(
                "run-phase10e",
                "https://example.com/p/1"
              )[0]
            ).toMatchObject({
              attempt:
                1,

              status:
                "STARTED",

              finishedAt:
                null
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


    test(
      "terminalization is rejected while an acquisition attempt is still STARTED",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          prepareInProgressProduct(
            store
          );

          store.startDetailFetch(
            "run-phase10e",
            "https://example.com/p/1"
          );

          expect(
            () =>
              store.terminalize(
                "run-phase10e",
                "https://example.com/p/1",
                "ACCEPT"
              )
          ).toThrow(
            /detail fetch|STARTED/i
          );

          expect(
            store.listProductUrls(
              "run-phase10e"
            )[0]
              ?.state
          ).toBe(
            "IN_PROGRESS"
          );
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );


    test(
      "completed acquisition can terminalize and finalize the run",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          prepareInProgressProduct(
            store
          );

          store.startDetailFetch(
            "run-phase10e",
            "https://example.com/p/1"
          );

          store.finishDetailFetch(
            "run-phase10e",
            "https://example.com/p/1",
            {
              status:
                "SUCCEEDED",

              finalUrl:
                "https://example.com/p/1",

              httpStatus:
                200,

              durationMs:
                90,

              errorClass:
                null,

              errorMessage:
                null,

              contentHash:
                HASH_A,

              snapshotPath:
                null,

              rawFacts: {
                contentHash:
                  HASH_A,

                extractorVersion:
                  "raw-product-facts-v1",

                factsJson:
                  REPLAY_JSON,

                snapshotPath:
                  null
              }
            }
          );

          store.terminalize(
            "run-phase10e",
            "https://example.com/p/1",
            "ACCEPT"
          );

          store.completeRun(
            "run-phase10e"
          );

          expect(
            store.getRun(
              "run-phase10e"
            )
          ).toMatchObject({
            status:
              "COMPLETED",

            finishedAt:
              NOW
          });

          expect(
            store.getReconciliationReport(
              "run-phase10e"
            )
          ).toMatchObject({
            accepted:
              1,

            pending:
              0,

            inProgress:
              0,

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
  }
);

describe(
  "Phase 10E cross-URL STARTED fetch isolation regression",
  () => {

    test(
      "STARTED acquisition for URL A does not block terminalization of URL B",
      () => {
        const temp =
          tempDatabase();

        const store =
          createStore(
            temp.path
          );

        try {
          const runId =
            "run-cross-url-fetch-isolation";

          const urlA =
            "https://example.com/p/a";

          const urlB =
            "https://example.com/p/b";


          store.createRun({
            runId,

            inputUrl:
              "https://example.com",

            canonicalOrigin:
              "https://example.com",

            startedAt:
              "2026-09-18T04:55:00.000Z",

            codeVersion:
              "037d37d",

            configHash:
              "cfg-cross-url-fetch-isolation"
          });


          store.startRun(
            runId
          );


          store.registerProductUrls(
            runId,
            [
              {
                canonicalUrl:
                  urlA,

                discoveryScore:
                  90,

                sourcesJson:
                  "[]"
              },
              {
                canonicalUrl:
                  urlB,

                discoveryScore:
                  90,

                sourcesJson:
                  "[]"
              }
            ]
          );


          /*
           * URL A owns an unfinished acquisition attempt.
           */
          store.beginAttempt(
            runId,
            urlA
          );

          store.startDetailFetch(
            runId,
            urlA
          );


          /*
           * URL B is independent. Its terminal decision must not
           * be blocked by URL A's STARTED fetch.
           */
          store.beginAttempt(
            runId,
            urlB
          );

          expect(
            () =>
              store.terminalize(
                runId,
                urlB,
                "ACCEPT"
              )
          ).not.toThrow();


          const states =
            new Map(
              store.listProductUrls(
                runId
              ).map(
                row => [
                  row.canonicalUrl,
                  row.state
                ]
              )
            );


          expect(
            states.get(
              urlA
            )
          ).toBe(
            "IN_PROGRESS"
          );

          expect(
            states.get(
              urlB
            )
          ).toBe(
            "ACCEPT"
          );


          /*
           * Run finalization remains correctly run-scoped:
           * URL A still has unfinished work.
           */
          expect(
            () =>
              store.completeRun(
                runId
              )
          ).toThrow();
        }
        finally {
          store.close();
          temp.cleanup();
        }
      }
    );
  }
);