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


const collectSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/collectV2.ts"
    ),
    "utf8"
  );


const commandSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/camintel.ts"
    ),
    "utf8"
  );


describe(
  "pre-run discovery lifecycle",
  () => {

    test(
      "catalog navigation is bounded well below the old 45 second attempt",
      () => {

        expect(
          collectSource
        ).not.toMatch(
          /timeout:\s*45_?000/
        );


        expect(
          collectSource
        ).toMatch(
          /timeout:\s*15_?000/
        );
      }
    );


    test(
      "Ctrl+C ownership starts before catalog navigation and is released before run registration",
      () => {

        const installIndex =
          collectSource.indexOf(
            "installPreRunDiscoveryInterrupt("
          );

        const navigationIndex =
          collectSource.indexOf(
            "await gentleLoad("
          );

        const uninstallIndex =
          collectSource.indexOf(
            "preRunInterrupt.uninstall()"
          );

        const startRunIndex =
          collectSource.indexOf(
            "coordinator.startNewRun("
          );


        expect(
          installIndex
        ).toBeGreaterThanOrEqual(
          0
        );

        expect(
          navigationIndex
        ).toBeGreaterThan(
          installIndex
        );

        expect(
          uninstallIndex
        ).toBeGreaterThan(
          navigationIndex
        );

        expect(
          startRunIndex
        ).toBeGreaterThan(
          uninstallIndex
        );


        expect(
          (
            collectSource.match(
              /preRunInterrupt\.throwIfRequested\(\)/g
            ) ??
            []
          ).length
        ).toBeGreaterThanOrEqual(
          2
        );
      }
    );


    test(
      "production tells the user discovery is running and how to cancel before run events exist",
      () => {

        const messageIndex =
          commandSource.indexOf(
            "Discovering product URLs"
          );

        const collectIndex =
          commandSource.indexOf(
            "await runCollectV2("
          );


        expect(
          messageIndex
        ).toBeGreaterThanOrEqual(
          0
        );

        expect(
          messageIndex
        ).toBeLessThan(
          collectIndex
        );


        expect(
          commandSource
        ).toContain(
          "Ctrl+C"
        );
      }
    );
  }
);