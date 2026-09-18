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

import type {
  DetailAcquisitionResult
} from "../../../src/v02/extraction/detailAcquisitionTypes.ts";

import {
  OFFLINE_REPLAY_SCHEMA_VERSION
} from "../../../src/v02/extraction/offlineReplaySnapshot.ts";

import {
  replaySnapshotContentHash
} from "../../../src/v02/runtime/persistentPipelineBridge.ts";

import {
  PersistentDetailProcessor
} from "../../../src/v02/runtime/persistentDetailProcessor.ts";

import {
  SQLiteRunStore
} from "../../../src/v02/storage/sqliteRunStore.ts";

import {
  SQLiteResumeStore
} from "../../../src/v02/storage/sqliteResumeStore.ts";

import {
  SQLiteIntelligenceAuditStore
} from "../../../src/v02/storage/sqliteIntelligenceAuditStore.ts";


const NOW =
  "2026-09-18T11:30:00.000Z";


const VERSIONS = {
  classifierVersion:
    "phase10i3b1-classifier-test-v1",

  resolverVersion:
    "phase10i3b1-resolver-test-v1",

  auditVersion:
    "phase10i3b1-audit-test-v1"
} as const;


function tempDatabase() {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "camintel-phase10i3b1-"
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


function acquisition(
  url:
    string
): DetailAcquisitionResult {
  return {
    requestedUrl:
      url,

    finalUrl:
      url,

    canonicalUrl:
      url,

    html: `
      <html>
        <body>
          <nav class="breadcrumb">
            <a>Home</a>
            <a>Camera</a>
          </nav>

          <h1>
            Sony A6400 Mirrorless Camera
          </h1>

          <div class="price">
            360000 VND per day
          </div>

          <button>
            Rent now
          </button>

          <section>
            <h2>
              Specifications
            </h2>

            <div>
              Mirrorless APS-C.
              Video 4K.
            </div>
          </section>

          <section>
            <h2>
              Accessories
            </h2>

            <div>
              Battery and charger.
            </div>
          </section>
        </body>
      </html>
    `,

    networkSnapshot: {
      requests:
        [],

      responses:
        [],

      outcomes:
        [],

      apiCandidates:
        []
    },

    interactions:
      [],

    timing: {
      navigationMs:
        100,

      settleMs:
        20,

      interactionMs:
        0,

      totalMs:
        120
    },

    errors:
      []
  };
}


function acquisitionWithErrors(
  url:
    string,
  errors:
    DetailAcquisitionResult["errors"]
): DetailAcquisitionResult {
  return {
    ...acquisition(
      url
    ),

    errors
  };
}


function seedInProgress(
  databasePath:
    string,
  runId:
    string,
  url:
    string
): void {
  const store =
    new SQLiteRunStore(
      databasePath,
      {
        now:
          () =>
            NOW
      }
    );

  try {
    store.createRun({
      runId,

      inputUrl:
        "https://example.com/catalog",

      canonicalOrigin:
        "https://example.com",

      startedAt:
        "2026-09-18T11:25:00.000Z",

      codeVersion:
        "94ae9d7",

      configHash:
        "cfg-phase10i3b1"
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
            JSON.stringify({
              reasons: [
                "test"
              ]
            })
        }
      ]
    );

    store.beginAttempt(
      runId,
      url
    );
  }
  finally {
    store.close();
  }
}


function processor(
  databasePath:
    string,
  runId:
    string
): PersistentDetailProcessor {
  return new PersistentDetailProcessor(
    databasePath,
    runId,
    {
      siteMode:
        "UNKNOWN",

      versions:
        VERSIONS,

      now:
        () =>
          NOW
    }
  );
}


describe(
  "Phase 10I.3B1 persistent detail processor",
  () => {

    test(
      "live acquisition persists successful fetch replay facts and audit",
      async () => {
        const temp =
          tempDatabase();

        const runId =
          "run-live-success";

        const url =
          "https://example.com/p/a6400";

        seedInProgress(
          temp.path,
          runId,
          url
        );


        const runtime =
          processor(
            temp.path,
            runId
          );

        try {
          const processed =
            await runtime.process(
              url,
              async () =>
                acquisition(
                  url
                )
            );


          expect(
            processed.source
          ).toBe(
            "LIVE"
          );

          expect(
            processed.contentHash
          ).toMatch(
            /^[a-f0-9]{64}$/
          );

          expect(
            processed.result.facts.url
          ).toBe(
            url
          );
        }
        finally {
          runtime.close();
        }


        const runStore =
          new SQLiteRunStore(
            temp.path
          );

        try {
          const fetches =
            runStore.listDetailFetches(
              runId,
              url
            );

          expect(
            fetches
          ).toHaveLength(
            1
          );

          expect(
            fetches[0]
          ).toMatchObject({
            status:
              "SUCCEEDED",

            finalUrl:
              url,

            durationMs:
              120,

            errorClass:
              null,

            errorMessage:
              null
          });


          const facts =
            runStore.listRawFacts(
              runId,
              url
            );

          expect(
            facts
          ).toHaveLength(
            1
          );

          expect(
            facts[0]
              ?.extractorVersion
          ).toBe(
            OFFLINE_REPLAY_SCHEMA_VERSION
          );

          expect(
            facts[0]
              ?.factsJson
          ).toContain(
            OFFLINE_REPLAY_SCHEMA_VERSION
          );


          /*
           * Regression for Phase 10I.3B1:
           * contentHash must describe the exact factsJson bytes that
           * survive SQLite close/reopen, not a pre-persistence variant.
           */
          expect(
            replaySnapshotContentHash(
              facts[0]!
                .factsJson
            )
          ).toBe(
            facts[0]!
              .contentHash
          );
        }
        finally {
          runStore.close();
        }


        const audit =
          new SQLiteIntelligenceAuditStore(
            temp.path
          );

        try {
          const persisted =
            audit.getProductAudit(
              runId,
              url,
              VERSIONS.auditVersion
            );

          expect(
            persisted
          ).not.toBeNull();

          expect(
            persisted
          ).toMatchObject({
            runId,

            canonicalUrl:
              url,

            classifierVersion:
              VERSIONS.classifierVersion,

            resolverVersion:
              VERSIONS.resolverVersion,

            auditVersion:
              VERSIONS.auditVersion
          });
        }
        finally {
          audit.close();
          temp.cleanup();
        }
      }
    );


    test(
      "acquisition exception closes STARTED fetch as FAILED and preserves no fake raw facts",
      async () => {
        const temp =
          tempDatabase();

        const runId =
          "run-live-failure";

        const url =
          "https://example.com/p/failure";

        seedInProgress(
          temp.path,
          runId,
          url
        );


        const runtime =
          processor(
            temp.path,
            runId
          );

        try {
          await expect(
            runtime.process(
              url,
              async () => {
                throw new Error(
                  "synthetic acquisition failure"
                );
              }
            )
          ).rejects.toThrow(
            /synthetic acquisition failure/i
          );
        }
        finally {
          runtime.close();
        }


        const runStore =
          new SQLiteRunStore(
            temp.path
          );

        try {
          expect(
            runStore.listDetailFetches(
              runId,
              url
            )
          ).toMatchObject([
            {
              status:
                "FAILED",

              errorClass:
                "Error",

              errorMessage:
                "synthetic acquisition failure",

              contentHash:
                null
            }
          ]);


          expect(
            runStore.listRawFacts(
              runId,
              url
            )
          ).toEqual(
            []
          );
        }
        finally {
          runStore.close();
          temp.cleanup();
        }
      }
    );


    test(
      "crash recovery replays compatible persisted facts without a second browser acquisition",
      async () => {
        const temp =
          tempDatabase();

        const runId =
          "run-crash-replay";

        const url =
          "https://example.com/p/a6400";

        seedInProgress(
          temp.path,
          runId,
          url
        );


        const first =
          processor(
            temp.path,
            runId
          );

        try {
          const live =
            await first.process(
              url,
              async () =>
                acquisition(
                  url
                )
            );

          expect(
            live.source
          ).toBe(
            "LIVE"
          );
        }
        finally {
          first.close();
        }


        /*
         * Simulate process death after raw facts/audit persistence
         * but before the product is terminalized.
         */
        const resumeStore =
          new SQLiteResumeStore(
            temp.path,
            {
              now:
                () =>
                  NOW
            }
          );

        try {
          const plan =
            resumeStore.prepareResume(
              runId
            );

          expect(
            plan.recoveredInProgress
          ).toBe(
            1
          );

          expect(
            plan.queuedUrls
          ).toContain(
            url
          );
        }
        finally {
          resumeStore.close();
        }


        const runStore =
          new SQLiteRunStore(
            temp.path,
            {
              now:
                () =>
                  NOW
            }
          );

        try {
          runStore.beginAttempt(
            runId,
            url
          );
        }
        finally {
          runStore.close();
        }


        let acquireCalls =
          0;

        const resumed =
          processor(
            temp.path,
            runId
          );

        try {
          const replayed =
            await resumed.process(
              url,
              async () => {
                acquireCalls++;

                return acquisition(
                  url
                );
              }
            );


          expect(
            replayed.source
          ).toBe(
            "REPLAY"
          );

          expect(
            acquireCalls
          ).toBe(
            0
          );
        }
        finally {
          resumed.close();
        }


        const inspect =
          new SQLiteRunStore(
            temp.path
          );

        try {
          expect(
            inspect.listDetailFetches(
              runId,
              url
            )
          ).toHaveLength(
            1
          );

          expect(
            inspect.listRawFacts(
              runId,
              url
            )
          ).toHaveLength(
            1
          );
        }
        finally {
          inspect.close();
          temp.cleanup();
        }
      }
    );


    test(
      "same-version corrupt replay payload fails hard instead of silently re-fetching",
      async () => {
        const temp =
          tempDatabase();

        const runId =
          "run-corrupt-replay";

        const url =
          "https://example.com/p/corrupt";

        seedInProgress(
          temp.path,
          runId,
          url
        );


        const malformed =
          "{}";

        const contentHash =
          replaySnapshotContentHash(
            malformed
          );


        const runStore =
          new SQLiteRunStore(
            temp.path,
            {
              now:
                () =>
                  NOW
            }
          );

        try {
          runStore.startDetailFetch(
            runId,
            url
          );

          runStore.finishDetailFetch(
            runId,
            url,
            {
              status:
                "SUCCEEDED",

              finalUrl:
                url,

              httpStatus:
                null,

              durationMs:
                10,

              errorClass:
                null,

              errorMessage:
                null,

              contentHash,

              snapshotPath:
                null,

              rawFacts: {
                contentHash,

                extractorVersion:
                  OFFLINE_REPLAY_SCHEMA_VERSION,

                factsJson:
                  malformed,

                snapshotPath:
                  null
              }
            }
          );
        }
        finally {
          runStore.close();
        }


        let acquireCalls =
          0;

        const runtime =
          processor(
            temp.path,
            runId
          );

        try {
          await expect(
            runtime.process(
              url,
              async () => {
                acquireCalls++;

                return acquisition(
                  url
                );
              }
            )
          ).rejects.toThrow(
            /replay|snapshot|schema/i
          );

          expect(
            acquireCalls
          ).toBe(
            0
          );
        }
        finally {
          runtime.close();
          temp.cleanup();
        }
      }
    );


    test(
      "content hash mismatch is treated as persistent corruption",
      async () => {
        const temp =
          tempDatabase();

        const runId =
          "run-hash-mismatch";

        const url =
          "https://example.com/p/hash-mismatch";

        seedInProgress(
          temp.path,
          runId,
          url
        );


        const factsJson =
          JSON.stringify({
            schemaVersion:
              OFFLINE_REPLAY_SCHEMA_VERSION
          });


        const runStore =
          new SQLiteRunStore(
            temp.path,
            {
              now:
                () =>
                  NOW
            }
          );

        try {
          runStore.startDetailFetch(
            runId,
            url
          );

          runStore.finishDetailFetch(
            runId,
            url,
            {
              status:
                "SUCCEEDED",

              finalUrl:
                url,

              httpStatus:
                null,

              durationMs:
                10,

              errorClass:
                null,

              errorMessage:
                null,

              contentHash:
                "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

              snapshotPath:
                null,

              rawFacts: {
                contentHash:
                  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",

                extractorVersion:
                  OFFLINE_REPLAY_SCHEMA_VERSION,

                factsJson,

                snapshotPath:
                  null
              }
            }
          );
        }
        finally {
          runStore.close();
        }


        let acquireCalls =
          0;

        const runtime =
          processor(
            temp.path,
            runId
          );

        try {
          await expect(
            runtime.process(
              url,
              async () => {
                acquireCalls++;

                return acquisition(
                  url
                );
              }
            )
          ).rejects.toThrow(
            /hash.*mismatch|mismatch.*hash/i
          );

          expect(
            acquireCalls
          ).toBe(
            0
          );
        }
        finally {
          runtime.close();
          temp.cleanup();
        }
      }
    );


    test(
      "non-retriable structured acquisition error becomes failed fetch with no raw facts or audit",
      async () => {
        const temp =
          tempDatabase();

        const runId =
          "run-http-404";

        const url =
          "https://example.com/p/missing";

        seedInProgress(
          temp.path,
          runId,
          url
        );


        const runtime =
          processor(
            temp.path,
            runId
          );

        let caught:
          unknown =
            null;

        try {
          try {
            await runtime.process(
              url,
              async () =>
                acquisitionWithErrors(
                  url,
                  [
                    {
                      stage:
                        "NAVIGATION",

                      code:
                        "HTTP_NOT_FOUND",

                      message:
                        "Product detail page returned HTTP 404.",

                      retriable:
                        false,

                      status:
                        404,

                      timestamp:
                        NOW
                    }
                  ]
                )
            );
          }
          catch (error) {
            caught =
              error;
          }


          expect(
            caught
          ).toMatchObject({
            name:
              "DetailAcquisitionFailure",

            stage:
              "NAVIGATION",

            code:
              "HTTP_NOT_FOUND",

            retriable:
              false,

            status:
              404
          });
        }
        finally {
          runtime.close();
        }


        const runStore =
          new SQLiteRunStore(
            temp.path
          );

        try {
          expect(
            runStore.listDetailFetches(
              runId,
              url
            )
          ).toMatchObject([
            {
              status:
                "FAILED",

              httpStatus:
                404,

              errorClass:
                "HTTP_NOT_FOUND",

              errorMessage:
                "Product detail page returned HTTP 404.",

              contentHash:
                null
            }
          ]);


          expect(
            runStore.listRawFacts(
              runId,
              url
            )
          ).toEqual(
            []
          );
        }
        finally {
          runStore.close();
        }


        const audit =
          new SQLiteIntelligenceAuditStore(
            temp.path
          );

        try {
          expect(
            audit.getProductAudit(
              runId,
              url,
              VERSIONS.auditVersion
            )
          ).toBeNull();
        }
        finally {
          audit.close();
          temp.cleanup();
        }
      }
    );


    test(
      "retriable structured acquisition failure remains explicitly retriable for caller error ledger",
      async () => {
        const temp =
          tempDatabase();

        const runId =
          "run-navigation-timeout";

        const url =
          "https://example.com/p/timeout";

        seedInProgress(
          temp.path,
          runId,
          url
        );


        const runtime =
          processor(
            temp.path,
            runId
          );

        let caught:
          unknown =
            null;

        try {
          try {
            await runtime.process(
              url,
              async () =>
                acquisitionWithErrors(
                  url,
                  [
                    {
                      stage:
                        "NAVIGATION",

                      code:
                        "NAVIGATION_TIMEOUT",

                      message:
                        "synthetic navigation timeout",

                      retriable:
                        true,

                      status:
                        null,

                      timestamp:
                        NOW
                    }
                  ]
                )
            );
          }
          catch (error) {
            caught =
              error;
          }


          expect(
            caught
          ).toMatchObject({
            name:
              "DetailAcquisitionFailure",

            stage:
              "NAVIGATION",

            code:
              "NAVIGATION_TIMEOUT",

            retriable:
              true,

            status:
              null
          });
        }
        finally {
          runtime.close();
        }


        const runStore =
          new SQLiteRunStore(
            temp.path
          );

        try {
          expect(
            runStore.listDetailFetches(
              runId,
              url
            )
          ).toMatchObject([
            {
              status:
                "FAILED",

              httpStatus:
                null,

              errorClass:
                "NAVIGATION_TIMEOUT",

              errorMessage:
                "synthetic navigation timeout"
            }
          ]);


          expect(
            runStore.listRawFacts(
              runId,
              url
            )
          ).toEqual(
            []
          );
        }
        finally {
          runStore.close();
          temp.cleanup();
        }
      }
    );


    test(
      "non-retriable acquisition error dominates mixed structured errors",
      async () => {
        const temp =
          tempDatabase();

        const runId =
          "run-mixed-errors";

        const url =
          "https://example.com/p/gone";

        seedInProgress(
          temp.path,
          runId,
          url
        );


        const runtime =
          processor(
            temp.path,
            runId
          );

        let caught:
          unknown =
            null;

        try {
          try {
            await runtime.process(
              url,
              async () =>
                acquisitionWithErrors(
                  url,
                  [
                    {
                      stage:
                        "SETTLE",

                      code:
                        "SETTLE_FAILED",

                      message:
                        "synthetic settle failure",

                      retriable:
                        true,

                      status:
                        null,

                      timestamp:
                        NOW
                    },
                    {
                      stage:
                        "NAVIGATION",

                      code:
                        "HTTP_GONE",

                      message:
                        "Product detail page returned HTTP 410.",

                      retriable:
                        false,

                      status:
                        410,

                      timestamp:
                        NOW
                    }
                  ]
                )
            );
          }
          catch (error) {
            caught =
              error;
          }


          expect(
            caught
          ).toMatchObject({
            name:
              "DetailAcquisitionFailure",

            stage:
              "NAVIGATION",

            code:
              "HTTP_GONE",

            retriable:
              false,

            status:
              410
          });
        }
        finally {
          runtime.close();
          temp.cleanup();
        }
      }
    );


    test(
      "close is idempotent and processing after close is rejected",
      async () => {
        const temp =
          tempDatabase();

        const runId =
          "run-close";

        const url =
          "https://example.com/p/close";

        seedInProgress(
          temp.path,
          runId,
          url
        );


        const runtime =
          processor(
            temp.path,
            runId
          );

        try {
          runtime.close();

          expect(
            () =>
              runtime.close()
          ).not.toThrow();


          await expect(
            runtime.process(
              url,
              async () =>
                acquisition(
                  url
                )
            )
          ).rejects.toThrow(
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