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


const command =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/camintel.ts"
    ),
    "utf8"
  );


const collector =
  readFileSync(
    resolve(
      process.cwd(),
      "src/v02/cli/collectV2.ts"
    ),
    "utf8"
  );


describe(
  "Phase 11D.2 production terminal integration",
  () => {

    test(
      "production command owns one event bus and one terminal renderer",
      () => {

        expect(
          command
        ).toContain(
          "RunEventBus"
        );


        expect(
          command
        ).toContain(
          "TerminalRenderer"
        );


        expect(
          command
        ).toContain(
          "const eventBus ="
        );


        expect(
          command
        ).toContain(
          "const renderer ="
        );


        expect(
          command
        ).toContain(
          "eventBus.subscribe("
        );


        expect(
          command
        ).toContain(
          "renderer.onEvent"
        );
      }
    );


    test(
      "renderer is subscribed before collector starts and unsubscribed in finally",
      () => {

        const subscribe =
          command.indexOf(
            "eventBus.subscribe("
          );

        const run =
          command.indexOf(
            "await runCollectV2("
          );

        const finallyIndex =
          command.indexOf(
            "finally",
            run
          );

        const unsubscribe =
          command.indexOf(
            "unsubscribeRenderer()"
          );


        expect(
          subscribe
        ).toBeGreaterThanOrEqual(
          0
        );


        expect(
          run
        ).toBeGreaterThan(
          subscribe
        );


        expect(
          finallyIndex
        ).toBeGreaterThan(
          run
        );


        expect(
          unsubscribe
        ).toBeGreaterThan(
          finallyIndex
        );
      }
    );


    test(
      "production command exposes --debug but does not forward it through inner argv",
      () => {

        expect(
          command
        ).toContain(
          '"--debug"'
        );


        expect(
          command
        ).toContain(
          "debug:"
        );


        const collectArgvStart =
          command.indexOf(
            "function collectArgv("
          );

        const programStart =
          command.indexOf(
            "const program ="
          );

        const collectArgvSource =
          command.slice(
            collectArgvStart,
            programStart
          );


        expect(
          collectArgvSource
        ).not.toContain(
          '"--debug"'
        );
      }
    );


    test(
      "same bus is passed to collectV2 runtime seam",
      () => {

        expect(
          command
        ).toMatch(
          /runCollectV2\([\s\S]*?\{[\s\S]*?eventBus,[\s\S]*?debug:\s*options\.debug/
        );
      }
    );


    test(
      "collector exposes debug runtime option and uses diagnostic policy",
      () => {

        expect(
          collector
        ).toContain(
          "debug?:"
        );


        expect(
          collector
        ).toContain(
          "createRuntimeDiagnostics("
        );


        expect(
          collector
        ).toContain(
          "runtimeOptions.debug ==="
        );


        expect(
          collector
        ).toContain(
          "diagnostics.log("
        );


        expect(
          collector
        ).toContain(
          "diagnostics.error("
        );
      }
    );


    test(
      "runCollectV2 body contains no direct console output",
      () => {

        const start =
          collector.indexOf(
            "export async function runCollectV2("
          );

        const direct =
          collector.indexOf(
            "if (\n  isDirectExecution()"
          );


        expect(
          start
        ).toBeGreaterThanOrEqual(
          0
        );


        expect(
          direct
        ).toBeGreaterThan(
          start
        );


        const body =
          collector.slice(
            start,
            direct
          );


        expect(
          body
        ).not.toContain(
          "console.log("
        );


        expect(
          body
        ).not.toContain(
          "console.error("
        );


        expect(
          body
        ).not.toContain(
          "console.log ="
        );


        expect(
          body
        ).not.toContain(
          "console.error ="
        );
      }
    );


    test(
      "direct collect:v02 execution preserves technical diagnostics",
      () => {

        const direct =
          collector.indexOf(
            "if (\n  isDirectExecution()"
          );


        const tail =
          collector.slice(
            direct
          );


        expect(
          tail
        ).toContain(
          "runCollectV2("
        );


        expect(
          tail
        ).toContain(
          "debug:"
        );


        expect(
          tail
        ).toContain(
          "true"
        );
      }
    );
  }
);