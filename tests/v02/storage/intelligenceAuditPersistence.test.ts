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

import type {
  PersistProductAuditInput
} from "../../../src/v02/storage/intelligenceAuditStore.ts";


const NOW =
  "2026-09-18T06:00:00.000Z";

const HASH =
  "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc";


function tempDatabase() {
  const directory =
    mkdtempSync(
      join(
        tmpdir(),
        "camintel-phase10f-"
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
      () =>
        rmSync(
          directory,
          {
            recursive:
              true,

            force:
              true
          }
        )
  };
}


function seedRawFacts(
  path:
    string
): void {
  const store =
    new SQLiteRunStore(
      path,
      {
        now:
          () =>
            NOW
      }
    );

  try {
    store.createRun({
      runId:
        "run-10f",

      inputUrl:
        "https://example.com",

      canonicalOrigin:
        "https://example.com",

      startedAt:
        NOW,

      codeVersion:
        "e5df1b9",

      configHash:
        "cfg-10f"
    });

    store.startRun(
      "run-10f"
    );

    store.registerProductUrls(
      "run-10f",
      [
        {
          canonicalUrl:
            "https://example.com/p/1",

          discoveryScore:
            95,

          sourcesJson:
            "[]"
        }
      ]
    );

    store.beginAttempt(
      "run-10f",
      "https://example.com/p/1"
    );

    store.startDetailFetch(
      "run-10f",
      "https://example.com/p/1"
    );

    store.finishDetailFetch(
      "run-10f",
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
          HASH,

        snapshotPath:
          "snapshot.json",

        rawFacts: {
          contentHash:
            HASH,

          extractorVersion:
            "facts-v1",

          factsJson:
            JSON.stringify({
              title:
                "Sony Test Camera"
            }),

          snapshotPath:
            "snapshot.json"
        }
      }
    );
  }
  finally {
    store.close();
  }
}


function baseAudit():
  PersistProductAuditInput {
  return {
    runId:
      "run-10f",

    canonicalUrl:
      "https://example.com/p/1",

    contentHash:
      HASH,

    classifierVersion:
      "classifier-v1",

    resolverVersion:
      "resolver-v1",

    auditVersion:
      "audit-v1",

    entity: {
      type:
        "CAMERA",

      confidence:
        0.99
    },

    offer: {
      rental:
        true,

      sale:
        false,

      confidence:
        0.95
    },

    condition: {
      condition:
        "USED",

      confidence:
        0.9
    },

    validation: {
      decision:
        "ACCEPT",

      reasons:
        [],

      evidenceCoverage:
        1
    },

    resolvedFields: [
      {
        field:
          "RENTAL_PRICE",

        selectedValue:
          360000,

        confidence:
          0.95,

        conflict:
          false
      },
      {
        field:
          "STOCK",

        selectedValue:
          "AVAILABLE",

        confidence:
          0.8,

        conflict:
          false
      }
    ],

    evidence: [
      {
        productName:
          "Sony Test Camera",

        decision:
          "ACCEPT",

        field:
          "ENTITY",

        selectedValue:
          "CAMERA",

        source:
          "ENTITY_RULE",

        raw:
          "Sony camera",

        weight:
          null,

        confidence:
          "HIGH",

        ruleId:
          "ENTITY_CLASSIFIER"
      },
      {
        productName:
          "Sony Test Camera",

        decision:
          "ACCEPT",

        field:
          "RENTAL_PRICE",

        selectedValue:
          "360000",

        source:
          "VISIBLE",

        raw:
          "360.000đ/ngày",

        weight:
          null,

        confidence:
          0.95,

        ruleId:
          "RESOLVE_RENTAL_PRICE_VISIBLE"
      }
    ],

    conflicts: [
      {
        productName:
          "Sony Test Camera",

        field:
          "CONDITION",

        severity:
          "INFO",

        values:
          "USED",

        explanation:
          "Synthetic audit row.",

        selectedValue:
          "USED",

        meta: {
          source:
            "test"
        }
      }
    ]
  };
}


describe(
  "Phase 10F intelligence and audit persistence",
  () => {

    test(
      "round-trips classification resolved fields evidence and conflicts",
      () => {
        const temp =
          tempDatabase();

        try {
          seedRawFacts(
            temp.path
          );

          const store =
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
              baseAudit();

            store.persistProductAudit(
              input
            );

            const snapshot =
              store.getProductAudit(
                input.runId,
                input.canonicalUrl,
                input.auditVersion
              );

            expect(
              snapshot
            ).not.toBeNull();

            expect(
              snapshot
            ).toMatchObject({
              runId:
                input.runId,

              canonicalUrl:
                input.canonicalUrl,

              contentHash:
                HASH,

              classifierVersion:
                "classifier-v1",

              resolverVersion:
                "resolver-v1",

              auditVersion:
                "audit-v1",

              entity:
                input.entity,

              offer:
                input.offer,

              condition:
                input.condition,

              validation:
                input.validation,

              createdAt:
                NOW
            });

            expect(
              snapshot?.resolvedFields
            ).toHaveLength(
              2
            );

            expect(
              snapshot?.evidence
            ).toHaveLength(
              2
            );

            expect(
              snapshot?.conflicts
            ).toHaveLength(
              1
            );
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
      "same audit version is replaced atomically instead of duplicated",
      () => {
        const temp =
          tempDatabase();

        try {
          seedRawFacts(
            temp.path
          );

          const store =
            new SQLiteIntelligenceAuditStore(
              temp.path,
              {
                now:
                  () =>
                    NOW
              }
            );

          try {
            const first =
              baseAudit();

            store.persistProductAudit(
              first
            );

            const replacement = {
              ...baseAudit(),

              validation: {
                decision:
                  "REVIEW",

                reasons: [
                  "synthetic replacement"
                ]
              },

              evidence: [
                first.evidence[0]!
              ],

              conflicts: []
            };

            store.persistProductAudit(
              replacement
            );

            const snapshot =
              store.getProductAudit(
                "run-10f",
                "https://example.com/p/1",
                "audit-v1"
              );

            expect(
              snapshot?.validation
            ).toEqual(
              replacement.validation
            );

            expect(
              snapshot?.evidence
            ).toHaveLength(
              1
            );

            expect(
              snapshot?.conflicts
            ).toEqual(
              []
            );
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
      "duplicate resolved fields roll back replacement and preserve previous audit",
      () => {
        const temp =
          tempDatabase();

        try {
          seedRawFacts(
            temp.path
          );

          const store =
            new SQLiteIntelligenceAuditStore(
              temp.path,
              {
                now:
                  () =>
                    NOW
              }
            );

          try {
            const original =
              baseAudit();

            store.persistProductAudit(
              original
            );

            const invalid = {
              ...baseAudit(),

              validation: {
                decision:
                  "REVIEW"
              },

              resolvedFields: [
                {
                  field:
                    "STOCK",

                  selectedValue:
                    "A",

                  confidence:
                    0.5,

                  conflict:
                    false
                },
                {
                  field:
                    "STOCK",

                  selectedValue:
                    "B",

                  confidence:
                    0.5,

                  conflict:
                    true
                }
              ]
            };

            expect(
              () =>
                store.persistProductAudit(
                  invalid
                )
            ).toThrow();

            const persisted =
              store.getProductAudit(
                "run-10f",
                "https://example.com/p/1",
                "audit-v1"
              );

            expect(
              persisted?.validation
            ).toEqual(
              original.validation
            );

            expect(
              persisted?.resolvedFields
            ).toHaveLength(
              2
            );
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
      "audit cannot reference content hash that was never captured",
      () => {
        const temp =
          tempDatabase();

        try {
          seedRawFacts(
            temp.path
          );

          const store =
            new SQLiteIntelligenceAuditStore(
              temp.path
            );

          try {
            expect(
              () =>
                store.persistProductAudit({
                  ...baseAudit(),

                  contentHash:
                    "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
                })
            ).toThrow(
              /raw facts|content hash/i
            );
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
      "error ledger appends technical failures without converting them to REVIEW",
      () => {
        const temp =
          tempDatabase();

        try {
          seedRawFacts(
            temp.path
          );

          const store =
            new SQLiteIntelligenceAuditStore(
              temp.path,
              {
                now:
                  () =>
                    NOW
              }
            );

          try {
            const row =
              store.appendError({
                runId:
                  "run-10f",

                canonicalUrl:
                  "https://example.com/p/1",

                stage:
                  "DETAIL",

                errorClass:
                  "TimeoutError",

                message:
                  "navigation timeout",

                attempts:
                  2,

                lastStatus:
                  503,

                retriable:
                  true,

                diagnosticPath:
                  "diagnostics/p1.png"
              });

            expect(
              row
            ).toMatchObject({
              errorId:
                1,

              runId:
                "run-10f",

              stage:
                "DETAIL",

              errorClass:
                "TimeoutError",

              attempts:
                2,

              lastStatus:
                503,

              retriable:
                true,

              createdAt:
                NOW
            });

            expect(
              store.listErrors(
                "run-10f"
              )
            ).toEqual([
              row
            ]);
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
      "run-level error may have null product URL",
      () => {
        const temp =
          tempDatabase();

        try {
          seedRawFacts(
            temp.path
          );

          const store =
            new SQLiteIntelligenceAuditStore(
              temp.path,
              {
                now:
                  () =>
                    NOW
              }
            );

          try {
            store.appendError({
              runId:
                "run-10f",

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
                null,

              retriable:
                false,

              diagnosticPath:
                null
            });

            expect(
              store.listErrors(
                "run-10f"
              )[0]
            ).toMatchObject({
              canonicalUrl:
                null,

              stage:
                "EXPORT",

              retriable:
                false
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
      "audit persists after close and reopen",
      () => {
        const temp =
          tempDatabase();

        try {
          seedRawFacts(
            temp.path
          );

          const first =
            new SQLiteIntelligenceAuditStore(
              temp.path,
              {
                now:
                  () =>
                    NOW
              }
            );

          try {
            first.persistProductAudit(
              baseAudit()
            );
          }
          finally {
            first.close();
          }


          const reopened =
            new SQLiteIntelligenceAuditStore(
              temp.path
            );

          try {
            expect(
              reopened.getProductAudit(
                "run-10f",
                "https://example.com/p/1",
                "audit-v1"
              )
            ).not.toBeNull();
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