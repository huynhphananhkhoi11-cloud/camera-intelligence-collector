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
  "Phase 10J.2 deterministic crash injection wiring",
  () => {

    test(
      "CLI exposes crash boundaries across durable lifecycle transitions",
      () => {

        expect(
          cli
        ).toContain(
          "crashIfRequested"
        );


        for (
          const point
          of [
            "AFTER_URL_REGISTER",
            "AFTER_BEGIN_PRODUCT",
            "AFTER_CLASSIFICATION",
            "AFTER_TERMINALIZATION",
            "BEFORE_EXPORT",
            "AFTER_WORKBOOK_BEFORE_MANIFEST",
            "AFTER_MANIFEST_BEFORE_FINALIZE"
          ]
        ) {
          expect(
            cli
          ).toContain(
            `"${point}"`
          );
        }
      }
    );


    test(
      "raw-facts crash boundary lives inside persistent detail processing",
      () => {

        expect(
          processor
        ).toContain(
          "crashIfRequested"
        );

        expect(
          processor
        ).toContain(
          '"AFTER_RAW_FACTS_PERSISTED"'
        );
      }
    );
  }
);