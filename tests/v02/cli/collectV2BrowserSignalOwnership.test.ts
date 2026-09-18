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


const cli =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/collectV2.ts"
    ),
    "utf8"
  );


describe(
  "Phase 10J.4 browser SIGINT ownership",
  () => {

    test(
      "Playwright must not auto-close Chromium on Ctrl+C because CLI owns SIGINT",
      () => {

        const launch =
          cli.match(
            /await chromium\.launch\(\{([\s\S]*?)\}\);/
          );

        expect(
          launch
        ).not.toBeNull();

        expect(
          launch?.[1]
        ).toMatch(
          /handleSIGINT\s*:\s*false/
        );
      }
    );
  }
);