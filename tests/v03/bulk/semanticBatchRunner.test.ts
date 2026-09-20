import {
  describe,
  expect,
  test,
  vi
} from "vitest";

import {
  runSemanticBatch
} from "../../../src/v03/bulk/semanticBatchRunner.js";

import type {
  SemanticBatchItemResult,
  SemanticUrlProcessor
} from "../../../src/v03/bulk/semanticBatchTypes.js";


function result(
  url:
    string,
  disposition:
    SemanticBatchItemResult["disposition"],
  overrides:
    Partial<SemanticBatchItemResult> = {}
): SemanticBatchItemResult {

  return {
    url,
    disposition,
    path:
      disposition === "AI_PENDING" ||
      disposition === "ERROR"
        ? "NONE"
        : "FAST",
    model:
      null,
    decision:
      null,
    validation:
      null,
    reason:
      null,
    haltBatch:
      false,
    inputTokens:
      null,
    outputTokens:
      null,
    latencyMs:
      null,
    ...overrides
  };
}


describe(
  "C9E semantic batch runner",
  () => {

    test(
      "deduplicates URLs in first-seen order and processes sequentially exactly once",
      async () => {

        const calls:
          string[] =
            [];

        let active =
          0;

        let maxActive =
          0;

        const processor:
          SemanticUrlProcessor =
            async url => {

              calls.push(
                url
              );

              active +=
                1;

              maxActive =
                Math.max(
                  maxActive,
                  active
                );

              await Promise.resolve();

              active -=
                1;

              return result(
                url,
                "CAMERA"
              );
            };


        const report =
          await runSemanticBatch(
            [
              " https://example.test/a ",
              "",
              "# ignored comment",
              "https://example.test/b",
              "https://example.test/a",
              "https://example.test/c"
            ],
            processor
          );


        expect(
          calls
        ).toEqual([
          "https://example.test/a",
          "https://example.test/b",
          "https://example.test/c"
        ]);

        expect(
          maxActive
        ).toBe(
          1
        );

        expect(
          report.items.map(
            item =>
              item.url
          )
        ).toEqual(
          calls
        );

        expect(
          report.summary.uniqueUrls
        ).toBe(
          3
        );

        expect(
          report.summary.attempted
        ).toBe(
          3
        );
      }
    );


    test(
      "respects minGapMs between attempted URLs with a fake clock",
      async () => {

        vi.useFakeTimers();

        try {

          const calledAt:
            number[] =
              [];

          const processor:
            SemanticUrlProcessor =
              async url => {

                calledAt.push(
                  Date.now()
                );

                return result(
                  url,
                  "NON_CAMERA"
                );
              };


          const pending =
            runSemanticBatch(
              [
                "https://example.test/a",
                "https://example.test/b",
                "https://example.test/c"
              ],
              processor,
              {
                minGapMs:
                  1_000
              }
            );


          await vi.runAllTimersAsync();

          const report =
            await pending;


          expect(
            calledAt
          ).toHaveLength(
            3
          );

          expect(
            calledAt[1]! -
            calledAt[0]!
          ).toBeGreaterThanOrEqual(
            1_000
          );

          expect(
            calledAt[2]! -
            calledAt[1]!
          ).toBeGreaterThanOrEqual(
            1_000
          );

          expect(
            report.summary.attempted
          ).toBe(
            3
          );
        }
        finally {
          vi.useRealTimers();
        }
      }
    );


    test(
      "quota halt stops new processor calls and marks all remaining URLs pending",
      async () => {

        const calls:
          string[] =
            [];

        const processor:
          SemanticUrlProcessor =
            async url => {

              calls.push(
                url
              );

              if (
                url.endsWith(
                  "/b"
                )
              ) {
                return result(
                  url,
                  "AI_PENDING",
                  {
                    reason:
                      "GEMINI_VISION_QUOTA_STOP",
                    haltBatch:
                      true
                  }
                );
              }

              return result(
                url,
                "CAMERA"
              );
            };


        const report =
          await runSemanticBatch(
            [
              "https://example.test/a",
              "https://example.test/b",
              "https://example.test/c",
              "https://example.test/d"
            ],
            processor
          );


        expect(
          calls
        ).toEqual([
          "https://example.test/a",
          "https://example.test/b"
        ]);

        expect(
          report.items.slice(
            2
          )
        ).toEqual([
          result(
            "https://example.test/c",
            "AI_PENDING",
            {
              reason:
                "SKIPPED_AFTER_QUOTA_STOP",
              haltBatch:
                true
            }
          ),
          result(
            "https://example.test/d",
            "AI_PENDING",
            {
              reason:
                "SKIPPED_AFTER_QUOTA_STOP",
              haltBatch:
                true
            }
          )
        ]);

        expect(
          report.summary.halted
        ).toBe(
          true
        );

        expect(
          report.summary.attempted
        ).toBe(
          2
        );
      }
    );


    test(
      "transport pending without halt continues to the next URL",
      async () => {

        const calls:
          string[] =
            [];

        const processor:
          SemanticUrlProcessor =
            async url => {

              calls.push(
                url
              );

              return url.endsWith(
                "/a"
              )
                ? result(
                    url,
                    "AI_PENDING",
                    {
                      reason:
                        "GEMINI_VISION_NETWORK_ERROR",
                      haltBatch:
                        false
                    }
                  )
                : result(
                    url,
                    "CAMERA"
                  );
            };


        const report =
          await runSemanticBatch(
            [
              "https://example.test/a",
              "https://example.test/b"
            ],
            processor
          );


        expect(
          calls
        ).toHaveLength(
          2
        );

        expect(
          report.items.map(
            item =>
              item.disposition
          )
        ).toEqual([
          "AI_PENDING",
          "CAMERA"
        ]);

        expect(
          report.summary.halted
        ).toBe(
          false
        );
      }
    );


    test(
      "converts a thrown processor error into an ERROR row and continues",
      async () => {

        const processor:
          SemanticUrlProcessor =
            async url => {

              if (
                url.endsWith(
                  "/a"
                )
              ) {
                throw new Error(
                  "processor exploded"
                );
              }

              return result(
                url,
                "CAMERA"
              );
            };


        const report =
          await runSemanticBatch(
            [
              "https://example.test/a",
              "https://example.test/b"
            ],
            processor
          );


        expect(
          report.items[0]
        ).toEqual(
          result(
            "https://example.test/a",
            "ERROR",
            {
              reason:
                "processor exploded"
            }
          )
        );

        expect(
          report.items[1]
            ?.disposition
        ).toBe(
          "CAMERA"
        );

        expect(
          report.summary.errors
        ).toBe(
          1
        );
      }
    );

  }
);
