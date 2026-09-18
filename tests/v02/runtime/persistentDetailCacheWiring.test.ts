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


const processor =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/runtime/persistentDetailProcessor.ts"
    ),
    "utf8"
  );


describe(
  "Phase 10J.5 production cache ownership",
  () => {

    test(
      "persistent detail boundary owns SQLite cache lifecycle",
      () => {

        expect(
          processor
        ).toContain(
          "SQLiteCacheStore"
        );

        expect(
          processor
        ).toMatch(
          /new\s+SQLiteCacheStore\s*\(/
        );

        expect(
          processor
        ).toMatch(
          /cacheStore\.close\s*\(/
        );
      }
    );


    test(
      "cache lookup and successful write surround live acquisition",
      () => {

        expect(
          processor
        ).toMatch(
          /cacheStore\.getRaw\s*\(/
        );

        expect(
          processor
        ).toMatch(
          /cacheStore\.putRawSuccess\s*\(/
        );

        expect(
          processor
        ).toContain(
          "HTTP_RAW"
        );
      }
    );


    test(
      "fresh remains a caller policy and reaches persistent processing",
      () => {

        expect(
          cli
        ).toMatch(
          /fresh\s*:\s*runIntent\.fresh/
        );

        expect(
          processor
        ).toContain(
          "options.fresh"
        );
      }
    );


    test(
      "run-local replay remains ahead of live acquisition",
      () => {

        const replayIndex =
          processor.indexOf(
            "latestCompatibleFacts"
          );

        const acquireIndex =
          processor.indexOf(
            "await acquire()"
          );

        expect(
          replayIndex
        ).toBeGreaterThanOrEqual(
          0
        );

        expect(
          acquireIndex
        ).toBeGreaterThan(
          replayIndex
        );
      }
    );
  }
);