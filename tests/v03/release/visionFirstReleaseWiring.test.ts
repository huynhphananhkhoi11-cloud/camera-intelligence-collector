import {
  access,
  readFile
} from "node:fs/promises";

import {
  constants
} from "node:fs";

import {
  describe,
  expect,
  test
} from "vitest";


const REQUIRED_VISION_FIRST_FILES = [
  "src/v03/contracts/camera13.ts",
  "src/v03/pipeline/visualProductPipeline.ts",
  "src/v03/cli/smartBatchV2.ts",
  "src/v03/vision/adaptiveCapture.ts",
  "src/v03/vision/capturePlan.ts",
  "src/v03/ai/gemini36VisualExtractor.ts",
  "src/v03/ai/visualExtractionSchema.ts",
  "src/v03/validation/visualExtractionValidator.ts",
  "src/v03/export/camera13Workbook.ts"
] as const;


async function exists(
  path:
    string
): Promise<boolean> {
  try {
    await access(
      path,
      constants.F_OK
    );

    return true;
  }
  catch {
    return false;
  }
}


describe(
  "V3 vision-first release wiring",
  () => {
    test.each(
      REQUIRED_VISION_FIRST_FILES
    )(
      "%s is present on the integrated release branch",
      async path => {
        expect(
          await exists(
            path
          ),
          path + " is required by the frozen vision-first release plan"
        ).toBe(
          true
        );
      }
    );


    test(
      "adds smart-batch:v2 while preserving the old smart-batch rollback path",
      async () => {
        const packageJson =
          JSON.parse(
            await readFile(
              "package.json",
              "utf8"
            )
          ) as {
            scripts?:
              Record<
                string,
                string
              >;
          };

        expect(
          packageJson
            .scripts?.[
              "smart-batch"
            ]
        ).toBeTruthy();

        expect(
          packageJson
            .scripts?.[
              "smart-batch:v2"
            ]
        ).toBeTruthy();

        expect(
          packageJson
            .scripts?.[
              "smart-batch:v2"
            ]
        ).toContain(
          "smartBatchV2"
        );
      }
    );
  }
);
