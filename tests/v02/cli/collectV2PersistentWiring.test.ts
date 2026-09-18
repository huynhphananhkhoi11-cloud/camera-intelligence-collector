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


describe(
  "Phase 10I.3B2 collectV2 persistent wiring",
  () => {

    test(
      "persistent runtime replaces Phase 9 in-memory source of truth",
      () => {
        expect(
          source
        ).toContain(
          "RunCoordinator"
        );

        expect(
          source
        ).toContain(
          "PersistentDetailProcessor"
        );

        expect(
          source
        ).toContain(
          "loadTerminalPipelineResults"
        );

        expect(
          source
        ).toContain(
          "toExportReconciliation"
        );

        expect(
          source
        ).toContain(
          "toExportErrorRows"
        );

        expect(
          source
        ).not.toContain(
          "processProductPage"
        );

        expect(
          source
        ).not.toContain(
          "RunReconciliation"
        );
      }
    );


    test(
      "detail acquisition uses observer-first browser collector without pre-navigation gentleLoad",
      () => {
        expect(
          source
        ).toContain(
          "collectBrowserDetail"
        );

        expect(
          source
        ).toContain(
          "detailProcessor.process"
        );

        expect(
          source
        ).toContain(
          "collectBrowserDetail("
        );

        const gentleLoadCalls =
          source.match(
            /gentleLoad\(/g
          ) ?? [];

        /*
         * Exactly:
         * 1 declaration
         * 1 catalog-discovery call
         *
         * There must be no detail-worker gentleLoad().
         */
        expect(
          gentleLoadCalls.length
        ).toBe(
          2
        );
      }
    );


    test(
      "run intent exposes optional URL resume and fresh contracts",
      () => {
        expect(
          source
        ).toContain(
          '"[url]"'
        );

        expect(
          source
        ).toContain(
          '"--resume <runId>"'
        );

        expect(
          source
        ).toContain(
          '"--fresh"'
        );

        expect(
          source
        ).toContain(
          "resolveCollectRunIntent"
        );

        expect(
          source
        ).toContain(
          "coordinator.resumeRun("
        );

        expect(
          source
        ).toContain(
          "coordinator.startNewRun("
        );
      }
    );


    test(
      "SIGINT blocks new scheduling while in-flight products remain terminalizable",
      () => {
        expect(
          source
        ).toContain(
          "installGracefulInterrupt"
        );

                expect(
          source
        ).toMatch(
          /coordinator\s*\.\s*isInterruptionRequested\(\)/
        );

        expect(
          source
        ).toContain(
          "coordinator.beginProduct("
        );

        expect(
          source
        ).toContain(
          "coordinator.terminalizeProduct("
        );

        expect(
          source
        ).toContain(
          '"INTERRUPTED"'
        );
      }
    );


    test(
      "export is reconstructed from persistence and workbook succeeds before run finalization",
      () => {
        expect(
          source
        ).toContain(
          "loadTerminalPipelineResults("
        );

        expect(
          source
        ).toContain(
          "errorStore.listErrors("
        );

        expect(
          source
        ).toContain(
          "coordinator.reconciliation()"
        );

        const exportIndex =
          source.indexOf(
            "await exportWorkbookV2("
          );

        const finalizeIndex =
          source.indexOf(
            "coordinator.finalizeRun()"
          );

        expect(
          exportIndex
        ).toBeGreaterThanOrEqual(
          0
        );

        expect(
          finalizeIndex
        ).toBeGreaterThan(
          exportIndex
        );
      }
    );
  }
);