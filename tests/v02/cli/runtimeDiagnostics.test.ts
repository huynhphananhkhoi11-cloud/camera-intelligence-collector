import {
  describe,
  expect,
  test
} from "vitest";

import {
  createRuntimeDiagnostics
} from "../../../src/v02/cli/runtimeDiagnostics.ts";


describe(
  "Phase 11D.2 runtime diagnostics policy",
  () => {

    test(
      "default production mode suppresses legacy diagnostics",
      () => {

        const stdout:
          unknown[][] = [];

        const stderr:
          unknown[][] = [];


        const diagnostics =
          createRuntimeDiagnostics(
            false,
            {
              log:
                (...values) => {
                  stdout.push(
                    values
                  );
                },

              error:
                (...values) => {
                  stderr.push(
                    values
                  );
                }
            }
          );


        diagnostics.log(
          "catalog",
          1
        );

        diagnostics.error(
          "detail failed"
        );


        expect(
          stdout
        ).toEqual(
          []
        );

        expect(
          stderr
        ).toEqual(
          []
        );
      }
    );


    test(
      "debug mode forwards technical diagnostics without rewriting values",
      () => {

        const stdout:
          unknown[][] = [];

        const stderr:
          unknown[][] = [];


        const diagnostics =
          createRuntimeDiagnostics(
            true,
            {
              log:
                (...values) => {
                  stdout.push(
                    values
                  );
                },

              error:
                (...values) => {
                  stderr.push(
                    values
                  );
                }
            }
          );


        const failure =
          new Error(
            "boom"
          );


        diagnostics.log(
          "[DETAIL]",
          7,
          {
            worker:
              2
          }
        );

        diagnostics.error(
          "failure",
          failure
        );


        expect(
          stdout
        ).toEqual([
          [
            "[DETAIL]",
            7,
            {
              worker:
                2
            }
          ]
        ]);


        expect(
          stderr
        ).toEqual([
          [
            "failure",
            failure
          ]
        ]);
      }
    );
  }
);