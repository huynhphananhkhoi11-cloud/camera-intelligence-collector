import {
  describe,
  expect,
  test
} from "vitest";

import {
  readFile
} from "node:fs/promises";

import {
  resolve
} from "node:path";


describe(
  "V3 production CLI wiring",
  () => {

    test(
      "package camintel binary points to the V3 production CLI",
      async () => {

        const packageJson =
          JSON.parse(
            await readFile(
              resolve(
                process.cwd(),
                "package.json"
              ),
              "utf8"
            )
          );


        expect(
          packageJson.bin
            ?.camintel
        ).toBe(
          "./dist/v03/cli/camintel.js"
        );


        expect(
          packageJson.scripts
            ?.camintel
        ).toBe(
          "tsx src/v03/cli/camintel.ts"
        );


        expect(
          packageJson.scripts
            ?.["camintel:v2"]
        ).toBe(
          "tsx src/v02/cli/camintel.ts"
        );
      }
    );
  }
);
