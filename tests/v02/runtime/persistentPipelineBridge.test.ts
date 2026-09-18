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
  processProductHtml,
  processRawProductFacts
} from "../../../src/v02/pipeline/productPipeline.ts";

import {
  createOfflineReplaySnapshot,
  OFFLINE_REPLAY_SCHEMA_VERSION,
  serializeOfflineReplaySnapshot
} from "../../../src/v02/extraction/offlineReplaySnapshot.ts";

import {
  SQLiteRunStore
} from "../../../src/v02/storage/sqliteRunStore.ts";

import {
  SQLiteIntelligenceAuditStore
} from "../../../src/v02/storage/sqliteIntelligenceAuditStore.ts";

import {
  buildPersistProductAuditInput,
  loadTerminalPipelineResults,
  replaySnapshotContentHash,
  toExportErrorRows,
  toExportReconciliation,
  toPersistentConflictSeverity
} from "../../../src/v02/runtime/persistentPipelineBridge.ts";


const NOW =
  "2026-09-18T11:00:00.000Z";


const HTML = `
  <html>
    <body>
      <nav class="breadcrumb">
        <a>Home</a>
        <a>Camera</a>
      </nav>

      <h1>Sony A6400 Mirrorless Camera</h1>

      <div class="product">
        <div class="price">
          360.000đ/ngày
        </div>

        <button>
          Thuê ngay
        </button>
      </div>

      <section>
        <h2>Thông số kỹ thuật</h2>
        <div>
          Mirrorless APS-C.
          ISO 100-32000.
          Video 4K.
        </div>
      </section>

      <section>
        <h2>Phụ kiện</h2>
        <div>
          Pin và sạc.
        </div>
      </section>
    </body>
  </html>
`;


function tempDatabase() {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "camintel-phase10i3a-"
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


function replayPayload(
  url:
    string
) {
  const result =
    processProductHtml(
      HTML,
      url,
      "UNKNOWN"
    );

  const snapshot =
    createOfflineReplaySnapshot(
      {
        requestedUrl:
          url,

        finalUrl:
          url,

        canonicalUrl:
          url,

        interactions:
          [],

        timing: {
          navigationMs:
            0,

          settleMs:
            0,

          interactionMs:
            0,

          totalMs:
            0
        },

        errors:
          []
      },
      result.facts,
      {
        capturedAt:
          NOW
      }
    );

  const serialized =
    serializeOfflineReplaySnapshot(
      snapshot
    );

  return {
    result,

    serialized,

    contentHash:
      replaySnapshotContentHash(
        serialized
      )
  };
}


function seedTerminalProduct(
  databasePath:
    string,
  runId:
    string,
  url:
    string,
  terminalOverride?:
    "ACCEPT" |
    "REVIEW" |
    "EXCLUDE"
) {
  const replay =
    replayPayload(
      url
    );

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
        "2026-09-18T10:55:00.000Z",

      codeVersion:
        "f3c24ee",

      configHash:
        "cfg-phase10i3a"
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

    store.startDetailFetch(
      runId,
      url
    );

    store.finishDetailFetch(
      runId,
      url,
      {
        status:
          "SUCCEEDED",

        finalUrl:
          url,

        httpStatus:
          200,

        durationMs:
          100,

        errorClass:
          null,

        errorMessage:
          null,

        contentHash:
          replay.contentHash,

        snapshotPath:
          null,

        rawFacts: {
          contentHash:
            replay.contentHash,

          extractorVersion:
            OFFLINE_REPLAY_SCHEMA_VERSION,

          factsJson:
            replay.serialized,

          snapshotPath:
            null
        }
      }
    );

    store.terminalize(
      runId,
      url,
      terminalOverride ??
        replay.result.validation.decision
    );
  }
  finally {
    store.close();
  }

  return replay;
}


describe(
  "Phase 10I.3A persistent pipeline replay bridge",
  () => {

    test(
      "raw-product-facts entry point preserves locked pipeline truth",
      () => {
        const url =
          "https://example.com/p/a6400";

        const original =
          processProductHtml(
            HTML,
            url,
            "UNKNOWN"
          );

        const replayed =
          processRawProductFacts(
            original.facts,
            "UNKNOWN"
          );

        expect(
          replayed
        ).toEqual(
          original
        );
      }
    );


    test(
      "replay snapshot hash is deterministic SHA-256 identity",
      () => {
        const first =
          replaySnapshotContentHash(
            "{\"a\":1}\n"
          );

        const second =
          replaySnapshotContentHash(
            "{\"a\":1}\n"
          );

        expect(
          first
        ).toBe(
          second
        );

        expect(
          first
        ).toMatch(
          /^[a-f0-9]{64}$/
        );

        expect(
          replaySnapshotContentHash(
            "{\"a\":2}\n"
          )
        ).not.toBe(
          first
        );
      }
    );


    test(
      "maps core conflict severity without losing original severity semantics",
      () => {
        expect(
          toPersistentConflictSeverity(
            "HIGH"
          )
        ).toBe(
          "REVIEW"
        );

        expect(
          toPersistentConflictSeverity(
            "MEDIUM"
          )
        ).toBe(
          "INFO"
        );

        expect(
          toPersistentConflictSeverity(
            "INFO"
          )
        ).toBe(
          "INFO"
        );
      }
    );


    test(
      "pipeline result becomes versioned persistent audit and round-trips",
      () => {
        const temp =
          tempDatabase();

        const runId =
          "run-audit-roundtrip";

        const url =
          "https://example.com/p/a6400";

        try {
          const replay =
            seedTerminalProduct(
              temp.path,
              runId,
              url
            );

          const audit =
            new SQLiteIntelligenceAuditStore(
              temp.path,
              {
                now:
                  () =>
                    NOW
              }
            );

          try {
            const input =
              buildPersistProductAuditInput(
                replay.result,
                runId,
                url,
                replay.contentHash,
                {
                  classifierVersion:
                    "classifier-test-v1",

                  resolverVersion:
                    "resolver-test-v1",

                  auditVersion:
                    "audit-test-v1"
                }
              );

            expect(
              input.runId
            ).toBe(
              runId
            );

            expect(
              input.canonicalUrl
            ).toBe(
              url
            );

            expect(
              input.contentHash
            ).toBe(
              replay.contentHash
            );

            expect(
              input.entity
            ).toEqual(
              replay.result.analysis.entity
            );

            expect(
              input.offer
            ).toEqual(
              replay.result.analysis.offer
            );

            expect(
              input.condition
            ).toEqual(
              replay.result.analysis.condition
            );

            expect(
              input.validation
            ).toEqual(
              replay.result.validation
            );

            expect(
              input.resolvedFields.length
            ).toBeGreaterThan(
              0
            );

            expect(
              input.evidence.length
            ).toBeGreaterThan(
              0
            );

            audit.persistProductAudit(
              input
            );

            const persisted =
              audit.getProductAudit(
                runId,
                url,
                "audit-test-v1"
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

              contentHash:
                replay.contentHash,

              classifierVersion:
                "classifier-test-v1",

              resolverVersion:
                "resolver-test-v1",

              auditVersion:
                "audit-test-v1"
            });

            expect(
              persisted?.validation
            ).toEqual(
              replay.result.validation
            );

            expect(
              persisted?.evidence.length
            ).toBe(
              input.evidence.length
            );
          }
          finally {
            audit.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "terminal product is rebuilt from persisted raw facts after process restart",
      () => {
        const temp =
          tempDatabase();

        const runId =
          "run-replay-terminal";

        const url =
          "https://example.com/p/a6400";

        try {
          const seeded =
            seedTerminalProduct(
              temp.path,
              runId,
              url
            );

          const rebuilt =
            loadTerminalPipelineResults(
              temp.path,
              runId,
              "UNKNOWN"
            );

          expect(
            rebuilt
          ).toHaveLength(
            1
          );

          expect(
            rebuilt[0]
          ).toEqual(
            seeded.result
          );
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "non-terminal DISCOVERED product is not materialized for final workbook",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteRunStore(
            temp.path,
            {
              now:
                () =>
                  NOW
            }
          );

        try {
          store.createRun({
            runId:
              "run-pending",

            inputUrl:
              "https://example.com",

            canonicalOrigin:
              "https://example.com",

            startedAt:
              NOW,

            codeVersion:
              "f3c24ee",

            configHash:
              "cfg"
          });

          store.startRun(
            "run-pending"
          );

          store.registerProductUrls(
            "run-pending",
            [
              {
                canonicalUrl:
                  "https://example.com/p/pending",

                discoveryScore:
                  50,

                sourcesJson:
                  "[]"
              }
            ]
          );
        }
        finally {
          store.close();
        }

        try {
          expect(
            loadTerminalPipelineResults(
              temp.path,
              "run-pending",
              "UNKNOWN"
            )
          ).toEqual(
            []
          );
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "terminal product without persisted raw facts is a hard invariant failure",
      () => {
        const temp =
          tempDatabase();

        const store =
          new SQLiteRunStore(
            temp.path,
            {
              now:
                () =>
                  NOW
            }
          );

        try {
          store.createRun({
            runId:
              "run-missing-facts",

            inputUrl:
              "https://example.com",

            canonicalOrigin:
              "https://example.com",

            startedAt:
              NOW,

            codeVersion:
              "f3c24ee",

            configHash:
              "cfg"
          });

          store.startRun(
            "run-missing-facts"
          );

          store.registerProductUrls(
            "run-missing-facts",
            [
              {
                canonicalUrl:
                  "https://example.com/p/missing",

                discoveryScore:
                  50,

                sourcesJson:
                  "[]"
              }
            ]
          );

          store.beginAttempt(
            "run-missing-facts",
            "https://example.com/p/missing"
          );

          store.terminalize(
            "run-missing-facts",
            "https://example.com/p/missing",
            "REVIEW"
          );
        }
        finally {
          store.close();
        }

        try {
          expect(
            () =>
              loadTerminalPipelineResults(
                temp.path,
                "run-missing-facts",
                "UNKNOWN"
              )
          ).toThrow(
            /raw facts|replay|terminal/i
          );
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "replay refuses silent business-decision drift",
      () => {
        const temp =
          tempDatabase();

        const runId =
          "run-decision-drift";

        const url =
          "https://example.com/p/a6400";

        try {
          const preview =
            replayPayload(
              url
            );

          const wrongDecision =
            preview.result.validation.decision ===
            "ACCEPT"
              ? "REVIEW"
              : "ACCEPT";

          seedTerminalProduct(
            temp.path,
            runId,
            url,
            wrongDecision
          );

          expect(
            () =>
              loadTerminalPipelineResults(
                temp.path,
                runId,
                "UNKNOWN"
              )
          ).toThrow(
            /decision.*drift|persisted.*decision/i
          );
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "persistent reconciliation converts to exporter contract only when complete",
      () => {
        const temp =
          tempDatabase();

        const runId =
          "run-reconciliation-adapter";

        const url =
          "https://example.com/p/a6400";

        try {
          seedTerminalProduct(
            temp.path,
            runId,
            url
          );

          const store =
            new SQLiteRunStore(
              temp.path
            );

          try {
            const persisted =
              store.getReconciliationReport(
                runId
              );

            expect(
              persisted.complete
            ).toBe(
              true
            );

            expect(
              toExportReconciliation(
                persisted
              )
            ).toMatchObject({
              runId,

              discovered:
                1,

              inProgress:
                0,

              accounted:
                1,

              balanced:
                true,

              complete:
                true
            });
          }
          finally {
            store.close();
          }
        }
        finally {
          temp.cleanup();
        }
      }
    );


    test(
      "incomplete persistent reconciliation cannot masquerade as export success",
      () => {
        expect(
          () =>
            toExportReconciliation({
              runId:
                "run-incomplete",

              discovered:
                2,

              pending:
                1,

              accepted:
                1,

              review:
                0,

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
                false
            })
        ).toThrow(
          /incomplete|pending|reconciliation/i
        );
      }
    );


    test(
      "persistent technical errors map to Phase 9 export rows without becoming REVIEW",
      () => {
        const rows =
          toExportErrorRows([
            {
              errorId:
                1,

              runId:
                "run-errors",

              canonicalUrl:
                "https://example.com/p/a",

              stage:
                "DETAIL",

              errorClass:
                "TimeoutError",

              message:
                "timeout",

              attempts:
                2,

              lastStatus:
                503,

              retriable:
                true,

              diagnosticPath:
                null,

              createdAt:
                NOW
            },
            {
              errorId:
                2,

              runId:
                "run-errors",

              canonicalUrl:
                null,

              stage:
                "EXPORT",

              errorClass:
                "FileSystemError",

              message:
                "synthetic",

              attempts:
                1,

              lastStatus:
                "EACCES",

              retriable:
                false,

              diagnosticPath:
                null,

              createdAt:
                NOW
            }
          ]);

        expect(
          rows
        ).toEqual([
          {
            runId:
              "run-errors",

            url:
              "https://example.com/p/a",

            stage:
              "DETAIL",

            errorClass:
              "TimeoutError",

            message:
              "timeout",

            attempts:
              2,

            lastStatus:
              503,

            retriable:
              true,

            diagnosticPath:
              null
          },
          {
            runId:
              "run-errors",

            url:
              "",

            stage:
              "EXPORT",

            errorClass:
              "FileSystemError",

            message:
              "synthetic",

            attempts:
              1,

            lastStatus:
              null,

            retriable:
              false,

            diagnosticPath:
              null
          }
        ]);
      }
    );
  }
);