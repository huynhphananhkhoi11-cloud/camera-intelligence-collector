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


const collectorSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/collectV2.ts"
    ),
    "utf8"
  );


const pathResolverSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/platform/stateDatabasePath.ts"
    ),
    "utf8"
  );


describe(
  "Phase 11H.1 shared state database path ownership",
  () => {

    test(
      "collector delegates state path resolution",
      () => {

        expect(
          collectorSource
        ).toContain(
          'from "../platform/stateDatabasePath.js"'
        );


        expect(
          collectorSource
        ).toContain(
          "resolveStateDatabasePath()"
        );


        expect(
          collectorSource
        ).not.toContain(
          "function stateDatabasePath()"
        );
      }
    );


    test(
      "environment and default path policy moved out of collector",
      () => {

        expect(
          collectorSource
        ).not.toContain(
          "CAMINTEL_STATE_DB"
        );


        expect(
          pathResolverSource
        ).toContain(
          "CAMINTEL_STATE_DB"
        );


        expect(
          pathResolverSource
        ).toContain(
          '"camera-intelligence.sqlite"'
        );
      }
    );
  }
);