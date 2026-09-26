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


const commandSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/camintel.ts"
    ),
    "utf8"
  );


const collectorSource =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/collectV2.ts"
    ),
    "utf8"
  );


function count(
  source:
    string,

  token:
    string
): number {

  return source.split(
    token
  ).length -
  1;
}


describe(
  "Phase 11G.2 camintel auto-open integration",
  () => {

    test(
      "production command exposes Commander negated --no-open",
      () => {

        expect(
          commandSource
        ).toContain(
          '"--no-open"'
        );


        expect(
          commandSource
        ).toMatch(
          /open:\s*boolean/
        );


        expect(
          commandSource
        ).toMatch(
          /enabled:\s*options\.open/
        );
      }
    );


    test(
      "captures only a completed export artifact from the shared event bus",
      () => {

        expect(
          commandSource
        ).toContain(
          "completedArtifactPath"
        );


        expect(
          commandSource
        ).toMatch(
          /event\.type\s*===\s*"EXPORT_COMPLETED"/
        );


        expect(
          commandSource
        ).toMatch(
          /completedArtifactPath\s*=\s*event\.targetPath/
        );
      }
    );


    test(
      "auto-open happens only after runCollectV2 returns",
      () => {

        const run =
          commandSource.indexOf(
            "await runCollectV2("
          );

        const open =
          commandSource.indexOf(
            "await openCompletedArtifactBestEffort("
          );


        expect(
          run
        ).toBeGreaterThanOrEqual(
          0
        );


        expect(
          open
        ).toBeGreaterThan(
          run
        );
      }
    );


    test(
      "production uses the locked platform opener",
      () => {

        expect(
          commandSource
        ).toContain(
          'from "../platform/artifactOpener.js"'
        );


        expect(
          commandSource
        ).toMatch(
          /openArtifact:\s*openArtifact/
        );
      }
    );


    test(
      "artifact-capture subscription is always released",
      () => {

        expect(
          commandSource
        ).toContain(
          "unsubscribeArtifactCapture"
        );


        expect(
          commandSource
        ).toMatch(
          /finally\s*\{[\s\S]*?unsubscribeArtifactCapture\(\);[\s\S]*?unsubscribeRenderer\(\);/
        );
      }
    );


    test(
      "inner collectV2 remains unaware of auto-open presentation policy",
      () => {

        expect(
          collectorSource
        ).not.toContain(
          "artifactOpenUx"
        );


        expect(
          collectorSource
        ).not.toContain(
          "openCompletedArtifactBestEffort"
        );


        expect(
          collectorSource
        ).not.toContain(
          'from "../platform/artifactOpener.js"'
        );
      }
    );


    test(
      "--no-open is not forwarded into the technical inner argv",
      () => {

        const collectArgvStart =
          commandSource.indexOf(
            "function collectArgv("
          );

        const programStart =
          commandSource.indexOf(
            "const program ="
          );


        const collectArgvSource =
          commandSource.slice(
            collectArgvStart,
            programStart
          );


        expect(
          collectArgvSource
        ).not.toContain(
          "--no-open"
        );


        expect(
          collectArgvSource
        ).not.toContain(
          'options.open'
        );
      }
    );


    test(
      "there is exactly one production best-effort open call",
      () => {

        expect(
          count(
            commandSource,
            "await openCompletedArtifactBestEffort("
          )
        ).toBe(
          1
        );
      }
    );
  }
);