import {
  describe,
  expect,
  test
} from "vitest";

import {
  resolveCollectRunIntent
} from "../../../src/v02/cli/collectRunIntent.ts";


describe(
  "Phase 10I.2 collect run intent",
  () => {

    test(
      "new run requires URL and canonicalizes away hash",
      () => {
        expect(
          resolveCollectRunIntent({
            url:
              "https://example.com/catalog#camera"
          })
        ).toEqual({
          mode:
            "NEW",

          url:
            "https://example.com/catalog",

          runId:
            null,

          fresh:
            false
        });
      }
    );


    test(
      "fresh applies only to a new run",
      () => {
        expect(
          resolveCollectRunIntent({
            url:
              "https://example.com/catalog",

            fresh:
              true
          })
        ).toEqual({
          mode:
            "NEW",

          url:
            "https://example.com/catalog",

          runId:
            null,

          fresh:
            true
        });
      }
    );


    test(
      "explicit resume run does not require URL",
      () => {
        expect(
          resolveCollectRunIntent({
            resumeRunId:
              "run-abc"
          })
        ).toEqual({
          mode:
            "RESUME",

          url:
            null,

          runId:
            "run-abc",

          fresh:
            false
        });
      }
    );


    test(
      "fresh and resume are mutually exclusive",
      () => {
        expect(
          () =>
            resolveCollectRunIntent({
              resumeRunId:
                "run-abc",

              fresh:
                true
            })
        ).toThrow(
          /fresh.*resume|resume.*fresh/i
        );
      }
    );


    test(
      "URL and explicit resume run cannot be mixed ambiguously",
      () => {
        expect(
          () =>
            resolveCollectRunIntent({
              url:
                "https://example.com",

              resumeRunId:
                "run-abc"
            })
        ).toThrow(
          /url.*resume|resume.*url/i
        );
      }
    );


    test(
      "missing URL and missing resume are rejected",
      () => {
        expect(
          () =>
            resolveCollectRunIntent({})
        ).toThrow(
          /url|resume/i
        );
      }
    );


    test(
      "blank resume identifier is not accepted as a run",
      () => {
        expect(
          () =>
            resolveCollectRunIntent({
              resumeRunId:
                "   "
            })
        ).toThrow(
          /url|resume/i
        );
      }
    );


    test(
      "invalid new-run URL is rejected before runtime starts",
      () => {
        expect(
          () =>
            resolveCollectRunIntent({
              url:
                "not a valid absolute url"
            })
        ).toThrow(
          /url/i
        );
      }
    );
  }
);