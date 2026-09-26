import {
  readFileSync
} from "node:fs";

import {
  join
} from "node:path";

import {
  describe,
  expect,
  test
} from "vitest";

describe(
  "final root-url production launcher",
  () => {

    test(
      "accepts one raw website URL and delegates discovery to canonical FIX13 CLI",
      () => {

        const source =
          readFileSync(
            join(
              process.cwd(),
              "RUN_CAMERA_INTELLIGENCE.ps1"
            ),
            "utf8"
          );

        expect(
          source
        ).toContain(
          'Read-Host "Website URL"'
        );

        expect(
          source
        ).toContain(
          '"smart-batch:minimal"'
        );

        expect(
          source
        ).toContain(
          '"--discover"'
        );

        expect(
          source
        ).toContain(
          '"Downloads"'
        );

        expect(
          source
        ).toContain(
          '& $Npm'
        );

        expect(
          source
        ).not.toContain(
          "Start-Process"
        );

        expect(
          source
        ).not.toContain(
          "run-state.json"
        );

        expect(
          source
        ).not.toContain(
          "v15-requests"
        );

        expect(
          source
        ).not.toContain(
          "v15-decisions"
        );

        expect(
          source
        ).not.toContain(
          "v15-results"
        );

        expect(
          source
        ).not.toContain(
          "Write-Live"
        );

        expect(
          source
        ).not.toContain(
          "gemini-3.5-flash-lite"
        );

        expect(
          source
        ).not.toContain(
          "captureConcurrency"
        );

        expect(
          source
        ).not.toContain(
          "semanticConcurrency"
        );

        expect(
          source
        ).not.toContain(
          "queueCapacity"
        );
      }
    );
  }
);