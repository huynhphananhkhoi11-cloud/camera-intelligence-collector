import {
  mkdtemp,
  rm,
  writeFile
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  EXPORT_MANIFEST_SCHEMA_VERSION,
  inspectExportArtifact
} from "../../../src/v02/storage/exportManifestStore.ts";

import {
  SQLiteExportManifestStore
} from "../../../src/v02/storage/sqliteExportManifestStore.ts";

import {
  SQLiteRunStore
} from "../../../src/v02/storage/sqliteRunStore.ts";


function createRunningRun(
  databasePath:
    string,

  runId:
    string
): void {

  const runStore =
    new SQLiteRunStore(
      databasePath,
      {
        now:
          () =>
            "2026-09-18T00:00:00.000Z"
      }
    );


  try {
    runStore.createRun({
      runId,

      inputUrl:
        "https://example.com/catalog",

      canonicalOrigin:
        "https://example.com",

      startedAt:
        "2026-09-18T00:00:00.000Z",

      codeVersion:
        "phase10j1-test",

      configHash:
        "config-hash"
    });


    runStore.startRun(
      runId
    );
  }
  finally {
    runStore.close();
  }
}


describe(
  "Phase 10J.1 completed export manifest persistence",
  () => {

    test(
      "artifact identity is computed from the completed file bytes",
      async () => {

        const directory =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-export-artifact-"
            )
          );


        try {
          const path =
            join(
              directory,
              "result.xlsx"
            );


          const content =
            "PK synthetic completed workbook";


          await writeFile(
            path,
            content,
            "utf8"
          );


          const first =
            await inspectExportArtifact(
              path
            );


          const second =
            await inspectExportArtifact(
              path
            );


          expect(
            first.path
          ).toBe(
            path
          );


          expect(
            first.fileHash
          ).toMatch(
            /^[a-f0-9]{64}$/
          );


          expect(
            first.fileSize
          ).toBe(
            Buffer.byteLength(
              content,
              "utf8"
            )
          );


          expect(
            second
          ).toEqual(
            first
          );
        }
        finally {
          await rm(
            directory,
            {
              recursive:
                true,

              force:
                true
            }
          );
        }
      }
    );


    test(
      "completed manifest survives reopen and same run/path is updated without duplication",
      async () => {

        const directory =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-export-manifest-"
            )
          );


        try {
          const databasePath =
            join(
              directory,
              "state.sqlite"
            );

          const artifactPath =
            join(
              directory,
              "result.xlsx"
            );

          const runId =
            "run-export-manifest";


          createRunningRun(
            databasePath,
            runId
          );


          await writeFile(
            artifactPath,
            "PK workbook v1",
            "utf8"
          );


          const firstIdentity =
            await inspectExportArtifact(
              artifactPath
            );


          let now =
            "2026-09-18T00:01:00.000Z";


          const store =
            new SQLiteExportManifestStore(
              databasePath,
              {
                now:
                  () =>
                    now
              }
            );


          const first =
            store.recordCompletedExport({
              runId,

              path:
                firstIdentity.path,

              fileHash:
                firstIdentity.fileHash,

              fileSize:
                firstIdentity.fileSize,

              schemaVersion:
                EXPORT_MANIFEST_SCHEMA_VERSION
            });


          expect(
            first.runId
          ).toBe(
            runId
          );


          expect(
            first.fileHash
          ).toBe(
            firstIdentity.fileHash
          );


          expect(
            first.createdAt
          ).toBe(
            "2026-09-18T00:01:00.000Z"
          );


          await writeFile(
            artifactPath,
            "PK workbook v2 with changed bytes",
            "utf8"
          );


          const secondIdentity =
            await inspectExportArtifact(
              artifactPath
            );


          now =
            "2026-09-18T00:02:00.000Z";


          const second =
            store.recordCompletedExport({
              runId,

              path:
                secondIdentity.path,

              fileHash:
                secondIdentity.fileHash,

              fileSize:
                secondIdentity.fileSize,

              schemaVersion:
                EXPORT_MANIFEST_SCHEMA_VERSION
            });


          expect(
            second.exportId
          ).toBe(
            first.exportId
          );


          expect(
            second.fileHash
          ).not.toBe(
            first.fileHash
          );


          expect(
            second.createdAt
          ).toBe(
            "2026-09-18T00:02:00.000Z"
          );


          expect(
            store.listCompletedExports(
              runId
            )
          ).toHaveLength(
            1
          );


          store.close();
          store.close();


          const reopened =
            new SQLiteExportManifestStore(
              databasePath
            );


          try {
            const restored =
              reopened.findCompletedExport(
                runId,
                artifactPath
              );


            expect(
              restored
            ).not.toBeNull();


            expect(
              restored?.fileHash
            ).toBe(
              secondIdentity.fileHash
            );


            expect(
              reopened.listCompletedExports(
                runId
              )
            ).toHaveLength(
              1
            );
          }
          finally {
            reopened.close();
          }
        }
        finally {
          await rm(
            directory,
            {
              recursive:
                true,

              force:
                true
            }
          );
        }
      }
    );


    test(
      "invalid completed artifact metadata is rejected before persistence",
      async () => {

        const directory =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-export-invalid-"
            )
          );


        try {
          const databasePath =
            join(
              directory,
              "state.sqlite"
            );

          const runId =
            "run-invalid-export";


          createRunningRun(
            databasePath,
            runId
          );


          const store =
            new SQLiteExportManifestStore(
              databasePath
            );


          try {
            expect(
              () =>
                store.recordCompletedExport({
                  runId,

                  path:
                    "C:\\output\\result.xlsx",

                  fileHash:
                    "not-a-hash",

                  fileSize:
                    10,

                  schemaVersion:
                    EXPORT_MANIFEST_SCHEMA_VERSION
                })
            ).toThrow(
              /SHA-256/i
            );


            expect(
              () =>
                store.recordCompletedExport({
                  runId,

                  path:
                    "C:\\output\\result.xlsx",

                  fileHash:
                    "a".repeat(
                      64
                    ),

                  fileSize:
                    -1,

                  schemaVersion:
                    EXPORT_MANIFEST_SCHEMA_VERSION
                })
            ).toThrow(
              /fileSize/i
            );


            expect(
              store.listCompletedExports(
                runId
              )
            ).toHaveLength(
              0
            );
          }
          finally {
            store.close();
          }
        }
        finally {
          await rm(
            directory,
            {
              recursive:
                true,

              force:
                true
            }
          );
        }
      }
    );
  }
);