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


const source =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/collectV2.ts"
    ),
    "utf8"
  );


function count(
  token:
    string
): number {

  return source.split(
    token
  ).length -
  1;
}


describe(
  "Phase 11F.2 collectV2 output-path integration",
  () => {

    test(
      "collectV2 exposes an injectable Downloads resolver",
      () => {

        expect(
          source
        ).toContain(
          "downloadsDirectoryResolver?:"
        );


        expect(
          source
        ).toContain(
          "runtimeOptions.downloadsDirectoryResolver"
        );


        expect(
          source
        ).toContain(
          "resolveRunOutputPath"
        );
      }
    );


    test(
      "one output path is resolved after persistent run establishment",
      () => {

        const resume =
          source.indexOf(
            "coordinator.resumeRun("
          );

        const start =
          source.indexOf(
            "coordinator.startNewRun({"
          );

        const output =
          source.indexOf(
            "const outputPath ="
          );

        const runStarted =
          source.indexOf(
            '"RUN_STARTED"'
          );


        expect(
          output
        ).toBeGreaterThan(
          resume
        );


        expect(
          output
        ).toBeGreaterThan(
          start
        );


        expect(
          runStarted
        ).toBeGreaterThan(
          output
        );


        expect(
          count(
            "const outputPath ="
          )
        ).toBe(
          1
        );
      }
    );


    test(
      "automatic naming uses the persisted run startedAt",
      () => {

        expect(
          source
        ).toContain(
          "const outputRun ="
        );


        expect(
          source
        ).toContain(
          "coordinator.getActiveRun()"
        );


        expect(
          source
        ).toMatch(
          /startedAt:\s*outputRun\.startedAt/
        );


        expect(
          source
        ).toMatch(
          /runId,\s*startedAt:/
        );
      }
    );


    test(
      "RUN_STARTED exposes the already-resolved output path",
      () => {

        const runStarted =
          source.indexOf(
            '"RUN_STARTED"'
          );

        const exportStarted =
          source.indexOf(
            '"EXPORT_STARTED"'
          );


        const section =
          source.slice(
            runStarted,
            exportStarted
          );


        expect(
          section
        ).toMatch(
          /outputPath:\s*outputPath/
        );


        expect(
          section
        ).not.toMatch(
          /outputPath:\s*null/
        );
      }
    );


    test(
      "legacy cwd output naming is removed",
      () => {

        expect(
          source
        ).not.toContain(
          '${host}_camera_v02_${dateStamp()}.xlsx'
        );


        expect(
          source
        ).not.toContain(
          '"output",\n              `${host}_camera_v02_'
        );
      }
    );


    test(
      "export and manifest still consume the same output path",
      () => {

        expect(
          source
        ).toMatch(
          /"EXPORT_STARTED"[\s\S]*?targetPath:\s*outputPath/
        );


        expect(
          source
        ).toMatch(
          /await exportWorkbookV2\(\s*outputPath,/
        );


        const workbook =
          source.indexOf(
            "await exportWorkbookV2("
          );

        const inspect =
          source.indexOf(
            "await inspectExportArtifact("
          );

        const manifest =
          source.indexOf(
            "exportManifestStore.recordCompletedExport({"
          );

        const completed =
          source.indexOf(
            '"EXPORT_COMPLETED"'
          );


        expect(
          inspect
        ).toBeGreaterThan(
          workbook
        );


        expect(
          manifest
        ).toBeGreaterThan(
          inspect
        );


        expect(
          completed
        ).toBeGreaterThan(
          manifest
        );
      }
    );
  }
);