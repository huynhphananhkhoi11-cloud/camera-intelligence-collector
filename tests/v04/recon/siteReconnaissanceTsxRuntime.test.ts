import {
  spawnSync
} from "node:child_process";

import {
  join
} from "node:path";

import {
  describe,
  expect,
  test
} from "vitest";


describe(
  "site reconnaissance under production tsx runtime",
  () => {

    test(
      "does not leak the esbuild __name helper into Playwright page.evaluate",
      () => {

        const tsxCli =
          join(
            process.cwd(),
            "node_modules",
            "tsx",
            "dist",
            "cli.mjs"
          );

        const fixture =
          join(
            process.cwd(),
            "tests",
            "v04",
            "recon",
            "tsxRuntimeReconSmoke.ts"
          );

        const result =
          spawnSync(
            process.execPath,
            [
              tsxCli,
              fixture
            ],
            {
              cwd:
                process.cwd(),

              encoding:
                "utf8"
            }
          );

        const output =
          [
            result.stdout ?? "",
            result.stderr ?? "",
            result.error?.stack ?? ""
          ]
            .filter(Boolean)
            .join("\n");

        expect(
          result.status,
          output
        ).toBe(
          0
        );

        expect(
          output
        ).toContain(
          "TSX_RECON_OK"
        );

        expect(
          output
        ).not.toContain(
          "__name is not defined"
        );
      },
      30_000
    );
  }
);