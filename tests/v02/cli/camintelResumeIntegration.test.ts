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


const commandSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/camintel.ts"
    ),
    "utf8"
  );


const collectorSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/collectV2.ts"
    ),
    "utf8"
  );


describe(
  "Phase 11H.2 production resume UX integration",
  () => {

    test(
      "production CLI exposes explicit --resume",
      () => {

        expect(
          commandSource
        ).toContain(
          '"--resume <runId>"'
        );


        expect(
          commandSource
        ).toMatch(
          /resume\?:\s*string/
        );
      }
    );


    test(
      "outer argv supports resume without a positional URL",
      () => {

        expect(
          commandSource
        ).toMatch(
          /function collectArgv\([\s\S]*?url:\s*string\s*\|\s*undefined/
        );


        expect(
          commandSource
        ).toMatch(
          /if\s*\(\s*url\s*\)\s*\{[\s\S]*?argv\.push\(\s*url\s*\)/
        );


        expect(
          commandSource
        ).toMatch(
          /options\.resume[\s\S]*?"--resume"[\s\S]*?options\.resume/
        );
      }
    );


    test(
      "production uses the shared read-only history foundation",
      () => {

        expect(
          commandSource
        ).toContain(
          'from "../platform/stateDatabasePath.js"'
        );


        expect(
          commandSource
        ).toContain(
          'from "../storage/sqliteRunHistoryStore.js"'
        );


        expect(
          commandSource
        ).toContain(
          "resolveStateDatabasePath()"
        );


        expect(
          commandSource
        ).toContain(
          "listRecentRuns("
        );
      }
    );


    test(
      "missing URL uses the resume choice before the normal URL prompt",
      () => {

        const choice =
          commandSource.indexOf(
            "await chooseResumeOrNew("
          );

        const newUrl =
          commandSource.indexOf(
            "await resolveCollectUrl(",
            choice
          );


        expect(
          choice
        ).toBeGreaterThanOrEqual(
          0
        );


        expect(
          newUrl
        ).toBeGreaterThan(
          choice
        );
      }
    );


    test(
      "resume and URL conflict is rejected before collector execution",
      () => {

        const conflict =
          commandSource.indexOf(
            "--resume cannot be combined with a website URL."
          );

        const run =
          commandSource.indexOf(
            "await runCollectV2("
          );


        expect(
          conflict
        ).toBeGreaterThanOrEqual(
          0
        );


        expect(
          run
        ).toBeGreaterThan(
          conflict
        );
      }
    );


    test(
      "resume and fresh conflict is rejected before collector execution",
      () => {

        expect(
          commandSource
        ).toContain(
          "--resume cannot be combined with --fresh."
        );
      }
    );


    test(
      "fresh new-run intent skips resume history prompt",
      () => {

        expect(
          commandSource
        ).toMatch(
          /else if\s*\(\s*options\.fresh\s*\)[\s\S]*?resolveCollectUrl\(\s*undefined\s*\)/
        );
      }
    );


    test(
      "selected resume run is forwarded through effective options",
      () => {

        expect(
          commandSource
        ).toContain(
          "effectiveOptions"
        );


        expect(
          commandSource
        ).toMatch(
          /resume:\s*resumeRunId/
        );


        expect(
          commandSource
        ).toMatch(
          /collectArgv\(\s*resolvedUrl,\s*effectiveOptions\s*\)/
        );
      }
    );


    test(
      "technical collector remains the sole resume mutation owner",
      () => {

        expect(
          commandSource
        ).not.toContain(
          "prepareResume("
        );


        expect(
          commandSource
        ).not.toContain(
          "resumeRun("
        );


        expect(
          collectorSource
        ).toContain(
          "coordinator.resumeRun("
        );
      }
    );


    test(
      "direct collect:v02 remains independent from resume UX module",
      () => {

        expect(
          collectorSource
        ).not.toContain(
          "resumeUx"
        );


        expect(
          collectorSource
        ).not.toContain(
          "SQLiteRunHistoryStore"
        );
      }
    );


    test(
      "auto-open still occurs only after the technical collector returns",
      () => {

        const run =
          commandSource.indexOf(
            "await runCollectV2("
          );

        const open =
          commandSource.indexOf(
            "await openCompletedArtifactBestEffort("
          );


        expect(
          open
        ).toBeGreaterThan(
          run
        );
      }
    );
  }
);