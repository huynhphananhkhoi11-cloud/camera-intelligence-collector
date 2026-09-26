import {
  readFile
} from "node:fs/promises";

import {
  describe,
  expect,
  test
} from "vitest";


describe(
  "V3 release CI browser prerequisite",
  () => {
    test(
      "installs Playwright Chromium before the full test command",
      async () => {
        const workflow =
          await readFile(
            ".github/workflows/ci.yml",
            "utf8"
          );

        const installIndex =
          workflow.indexOf(
            "npx playwright install chromium"
          );

        const testIndex =
          workflow.indexOf(
            "npm test"
          );

        expect(
          installIndex
        ).toBeGreaterThanOrEqual(
          0
        );

        expect(
          testIndex
        ).toBeGreaterThan(
          installIndex
        );
      }
    );
  }
);
