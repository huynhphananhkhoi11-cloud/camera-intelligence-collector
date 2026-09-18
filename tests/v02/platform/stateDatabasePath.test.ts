import {
  resolve
} from "node:path";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  resolveStateDatabasePath
} from "../../../src/v02/platform/stateDatabasePath.ts";


describe(
  "Phase 11H.1 state database path",
  () => {

    test(
      "preserves the default cwd/data database location",
      () => {

        const cwd =
          resolve(
            "C:",
            "camintel-work"
          );


        expect(
          resolveStateDatabasePath({
            cwd,

            environment:
              {}
          })
        ).toBe(
          resolve(
            cwd,
            "data",
            "camera-intelligence.sqlite"
          )
        );
      }
    );


    test(
      "CAMINTEL_STATE_DB override wins",
      () => {

        const cwd =
          resolve(
            "C:",
            "camintel-work"
          );

        const override =
          resolve(
            cwd,
            "custom",
            "state.sqlite"
          );


        expect(
          resolveStateDatabasePath({
            cwd,

            environment: {
              CAMINTEL_STATE_DB:
                override
            }
          })
        ).toBe(
          override
        );
      }
    );


    test(
      "relative override resolves against injected cwd",
      () => {

        const cwd =
          resolve(
            "C:",
            "camintel-work"
          );


        expect(
          resolveStateDatabasePath({
            cwd,

            environment: {
              CAMINTEL_STATE_DB:
                "persistent/custom.sqlite"
            }
          })
        ).toBe(
          resolve(
            cwd,
            "persistent",
            "custom.sqlite"
          )
        );
      }
    );


    test(
      "whitespace-only override falls back to default",
      () => {

        const cwd =
          resolve(
            "C:",
            "camintel-work"
          );


        expect(
          resolveStateDatabasePath({
            cwd,

            environment: {
              CAMINTEL_STATE_DB:
                "   "
            }
          })
        ).toBe(
          resolve(
            cwd,
            "data",
            "camera-intelligence.sqlite"
          )
        );
      }
    );
  }
);