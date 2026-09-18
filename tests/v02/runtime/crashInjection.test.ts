import {
  describe,
  expect,
  test
} from "vitest";

import {
  CRASH_INJECTION_EXIT_CODE,
  CRASH_POINTS,
  crashIfRequested,
  type CrashInjectionHost
} from "../../../src/v02/runtime/crashInjection.ts";


function host(
  env:
    NodeJS.ProcessEnv
): {
  host:
    CrashInjectionHost;

  writes:
    string[];

  exits:
    number[];
} {

  const writes:
    string[] = [];

  const exits:
    number[] = [];


  return {
    writes,

    exits,

    host: {
      env,

      write:
        message => {
          writes.push(
            message
          );
        },

      exit:
        code => {
          exits.push(
            code
          );

          throw new Error(
            `TEST_EXIT_${code}`
          );
        }
    }
  };
}


describe(
  "Phase 10J.2 crash injection",
  () => {

    test(
      "known crash point inventory is explicit and stable",
      () => {

        expect(
          CRASH_POINTS
        ).toEqual([
          "AFTER_URL_REGISTER",
          "AFTER_BEGIN_PRODUCT",
          "AFTER_RAW_FACTS_PERSISTED",
          "AFTER_CLASSIFICATION",
          "AFTER_TERMINALIZATION",
          "BEFORE_EXPORT",
          "AFTER_WORKBOOK_BEFORE_MANIFEST",
          "AFTER_MANIFEST_BEFORE_FINALIZE"
        ]);
      }
    );


    test(
      "normal execution is inert when crash injection is not armed",
      () => {

        const sample =
          host({
            CAMINTEL_CRASH_POINT:
              "AFTER_URL_REGISTER"
          });


        crashIfRequested(
          "AFTER_URL_REGISTER",
          {
            runId:
              "run-1"
          },
          sample.host
        );


        expect(
          sample.writes
        ).toEqual([]);

        expect(
          sample.exits
        ).toEqual([]);
      }
    );


    test(
      "armed different point remains inert",
      () => {

        const sample =
          host({
            CAMINTEL_CRASH_ENABLE:
              "1",

            CAMINTEL_CRASH_POINT:
              "AFTER_BEGIN_PRODUCT"
          });


        crashIfRequested(
          "AFTER_URL_REGISTER",
          {
            runId:
              "run-1"
          },
          sample.host
        );


        expect(
          sample.writes
        ).toEqual([]);

        expect(
          sample.exits
        ).toEqual([]);
      }
    );


    test(
      "armed matching point writes deterministic evidence then hard exits",
      () => {

        const sample =
          host({
            CAMINTEL_CRASH_ENABLE:
              "1",

            CAMINTEL_CRASH_POINT:
              "AFTER_CLASSIFICATION"
          });


        expect(
          () =>
            crashIfRequested(
              "AFTER_CLASSIFICATION",
              {
                runId:
                  "run-42",

                url:
                  "https://example.com/p/42"
              },
              sample.host
            )
        ).toThrow(
          `TEST_EXIT_${CRASH_INJECTION_EXIT_CODE}`
        );


        expect(
          sample.exits
        ).toEqual([
          CRASH_INJECTION_EXIT_CODE
        ]);


        expect(
          sample.writes
        ).toHaveLength(
          1
        );


        expect(
          sample.writes[0]
        ).toContain(
          '"point":"AFTER_CLASSIFICATION"'
        );

        expect(
          sample.writes[0]
        ).toContain(
          '"runId":"run-42"'
        );

        expect(
          sample.writes[0]
        ).toContain(
          '"url":"https://example.com/p/42"'
        );
      }
    );


    test(
      "armed mode rejects missing or unknown point instead of silently guessing",
      () => {

        const missing =
          host({
            CAMINTEL_CRASH_ENABLE:
              "1"
          });


        expect(
          () =>
            crashIfRequested(
              "AFTER_URL_REGISTER",
              {},
              missing.host
            )
        ).toThrow(
          /requires CAMINTEL_CRASH_POINT/
        );


        const unknown =
          host({
            CAMINTEL_CRASH_ENABLE:
              "1",

            CAMINTEL_CRASH_POINT:
              "NOT_A_REAL_POINT"
          });


        expect(
          () =>
            crashIfRequested(
              "AFTER_URL_REGISTER",
              {},
              unknown.host
            )
        ).toThrow(
          /Unsupported CAMINTEL_CRASH_POINT/
        );
      }
    );
  }
);