import {
  existsSync,
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


const repo =
  process.cwd();


const packageJson =
  JSON.parse(
    readFileSync(
      resolve(
        repo,
        "package.json"
      ),
      "utf8"
    )
  ) as {
    scripts?: Record<
      string,
      string
    >;

    bin?: Record<
      string,
      string
    >;
  };


describe(
  "Phase 11A production camintel entry",
  () => {

    test(
      "package exposes built camintel binary without replacing collect:v02",
      () => {

        expect(
          packageJson.bin?.camintel
        ).toBe(
          "./dist/v02/cli/camintel.js"
        );

        expect(
          packageJson.scripts?.camintel
        ).toBe(
          "tsx src/v02/cli/camintel.ts"
        );

        expect(
          packageJson.scripts?.["collect:v02"]
        ).toBe(
          "tsx src/v02/cli/collectV2.ts"
        );
      }
    );


    test(
      "production command source exists and owns collect subcommand",
      () => {

        const path =
          resolve(
            repo,
            "src/v02/cli/camintel.ts"
          );

        const exists =
          existsSync(
            path
          );

        expect(
          exists
        ).toBe(
          true
        );

        if (
          !exists
        ) {
          return;
        }


        const source =
          readFileSync(
            path,
            "utf8"
          );

        expect(
          source
        ).toContain(
          '.command("collect")'
        );

        expect(
          source
        ).toContain(
          '.argument("<url>")'
        );

        expect(
          source
        ).toContain(
          "runCollectV2"
        );
      }
    );


    test(
      "persistent collector is import-safe and exposes callable runner",
      () => {

        const source =
          readFileSync(
            resolve(
              repo,
              "src/v02/cli/collectV2.ts"
            ),
            "utf8"
          );

        expect(
          source
        ).toContain(
          "export async function runCollectV2"
        );

        expect(
          source
        ).toContain(
          "program.parse(argv)"
        );

        expect(
          source
        ).toContain(
          "isDirectExecution()"
        );
      }
    );
  }
);