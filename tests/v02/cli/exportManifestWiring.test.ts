import {
  readFileSync
} from "node:fs";

import {
  resolve
} from "node:path";

import {
  describe,
  expect,
  test
} from "vitest";


const migrationSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/storage/sqliteMigrations.ts"
    ),
    "utf8"
  );


const cliSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/collectV2.ts"
    ),
    "utf8"
  );


describe(
  "Phase 10J.1 completed export-manifest wiring",
  () => {

    test(
      "schema owns a completed export_manifest table",
      () => {

        expect(
          migrationSource
        ).toContain(
          "CREATE TABLE export_manifest"
        );

        expect(
          migrationSource
        ).toContain(
          "MIGRATION_V5_CHECKSUM"
        );

        expect(
          migrationSource
        ).toContain(
          "phase10_v5_export_manifest"
        );
      }
    );


    test(
      "CLI persists artifact identity only after workbook success and before run finalization",
      () => {

        expect(
          cliSource
        ).toContain(
          "SQLiteExportManifestStore"
        );

        expect(
          cliSource
        ).toContain(
          "inspectExportArtifact"
        );

        expect(
          cliSource
        ).toContain(
          "exportManifestStore.recordCompletedExport("
        );


        const workbookIndex =
          cliSource.indexOf(
            "await exportWorkbookV2("
          );

        const inspectIndex =
          cliSource.indexOf(
            "await inspectExportArtifact("
          );

        const manifestIndex =
          cliSource.indexOf(
            "exportManifestStore.recordCompletedExport("
          );

        const finalizeIndex =
          cliSource.indexOf(
            "coordinator.finalizeRun()"
          );


        expect(
          workbookIndex
        ).toBeGreaterThanOrEqual(
          0
        );

        expect(
          inspectIndex
        ).toBeGreaterThan(
          workbookIndex
        );

        expect(
          manifestIndex
        ).toBeGreaterThan(
          inspectIndex
        );

        expect(
          finalizeIndex
        ).toBeGreaterThan(
          manifestIndex
        );
      }
    );


    test(
      "manifest store participates in graceful resource cleanup",
      () => {

        expect(
          cliSource
        ).toContain(
          "exportManifestStore.close()"
        );

        expect(
          cliSource
        ).toContain(
          '"phase10j1"'
        );
      }
    );
  }
);