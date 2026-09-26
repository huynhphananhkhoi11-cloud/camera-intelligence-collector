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


function position(
  token:
    string
): number {

  const index =
    source.indexOf(
      token
    );


  expect(
    index
  ).toBeGreaterThanOrEqual(
    0
  );


  return index;
}


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
  "Phase 11C.3B orchestration lifecycle wiring",
  () => {

    test(
      "uses one safe orchestration publisher",
      () => {

        expect(
          source
        ).toContain(
          "const publishEvent ="
        );


        expect(
          source
        ).toContain(
          "publishRunEventSafely("
        );


        expect(
          source
        ).toContain(
          "RunEventPayload"
        );
      }
    );


    test(
      "detail ownership has start and terminal finish events",
      () => {

        expect(
          source
        ).toContain(
          '"DETAIL_STARTED"'
        );


        expect(
          count(
            '"DETAIL_FINISHED"'
          )
        ).toBe(
          2
        );


        const begin =
          position(
            "coordinator.beginProduct("
          );

        const started =
          position(
            '"DETAIL_STARTED"'
          );


        expect(
          started
        ).toBeGreaterThan(
          begin
        );
      }
    );


    test(
      "successful detail finish occurs only after terminal persistence",
      () => {

        const firstTerminal =
          position(
            "coordinator.terminalizeProduct("
          );

        const crashAfterTerminal =
          position(
            '"AFTER_TERMINALIZATION"'
          );

        const finish =
          position(
            '"DETAIL_FINISHED"'
          );


        expect(
          crashAfterTerminal
        ).toBeGreaterThan(
          firstTerminal
        );


        expect(
          finish
        ).toBeGreaterThan(
          crashAfterTerminal
        );
      }
    );


    test(
      "acquisition errors are recorded before error event and finish",
      () => {

        const append =
          position(
            "errorStore.appendError({"
          );

        const errorTerminal =
          source.indexOf(
            'coordinator.terminalizeProduct(\n                  url,\n                  "ERROR"'
          );

        const recorded =
          position(
            '"ERROR_RECORDED"'
          );

        const firstFinish =
          position(
            '"DETAIL_FINISHED"'
          );

        const secondFinish =
          source.indexOf(
            '"DETAIL_FINISHED"',
            firstFinish +
              1
          );


        expect(
          errorTerminal
        ).toBeGreaterThan(
          append
        );


        expect(
          recorded
        ).toBeGreaterThan(
          errorTerminal
        );


        expect(
          secondFinish
        ).toBeGreaterThan(
          recorded
        );
      }
    );


    test(
      "owns exactly three real stage pairs",
      () => {

        expect(
          count(
            '"STAGE_STARTED"'
          )
        ).toBe(
          3
        );


        expect(
          count(
            '"STAGE_COMPLETED"'
          )
        ).toBe(
          3
        );


        expect(
          source
        ).toContain(
          '"DETAIL_COLLECTION"'
        );


        expect(
          source
        ).toContain(
          '"AUDIT_RECONCILE"'
        );


        expect(
          source
        ).toContain(
          '"EXCEL_EXPORT"'
        );
      }
    );


    test(
      "export completion is after manifest persistence and before finalize",
      () => {

        const exportStarted =
          position(
            '"EXPORT_STARTED"'
          );

        const beforeExportCrash =
          position(
            '"BEFORE_EXPORT"'
          );

        const workbook =
          position(
            "await exportWorkbookV2("
          );

        const manifest =
          position(
            "exportManifestStore.recordCompletedExport({"
          );

        const exportCompleted =
          position(
            '"EXPORT_COMPLETED"'
          );

        const afterManifestCrash =
          position(
            '"AFTER_MANIFEST_BEFORE_FINALIZE"'
          );

        const finalize =
          position(
            "coordinator.finalizeRun()"
          );


        expect(
          beforeExportCrash
        ).toBeGreaterThan(
          exportStarted
        );


        expect(
          workbook
        ).toBeGreaterThan(
          beforeExportCrash
        );


        expect(
          manifest
        ).toBeGreaterThan(
          workbook
        );


        expect(
          exportCompleted
        ).toBeGreaterThan(
          manifest
        );


        expect(
          afterManifestCrash
        ).toBeGreaterThan(
          exportCompleted
        );


        expect(
          finalize
        ).toBeGreaterThan(
          afterManifestCrash
        );
      }
    );


    test(
      "fatal runtime path emits RUN_FAILED without fabricating business events",
      () => {

        expect(
          count(
            '"RUN_FAILED"'
          )
        ).toBe(
          1
        );


        expect(
          source
        ).not.toContain(
          '"ROOT_FOUND"'
        );


        expect(
          source
        ).not.toContain(
          '"PRODUCT_DISCOVERED"'
        );


        expect(
          source
        ).not.toContain(
          '"RETRY_SCHEDULED"'
        );
      }
    );
  }
);