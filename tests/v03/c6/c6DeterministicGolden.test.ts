import {
  afterEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import {
  analyzeFinalEvidenceLow
} from "../../../src/v03/agent/semanticFinalizer.js";

import {
  AISemanticDecisionSchema
} from "../../../src/v03/ai/semanticContracts.js";

import type {
  GeminiAnalyzeResult
} from "../../../src/v03/ai/geminiSemanticProvider.js";

import {
  C6_GOLDEN_CASES
} from "./c6GoldenFixtures.js";


afterEach(
  () => {

    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
);


describe(
  "C6.1 deterministic golden gate",
  () => {

    for (
      const golden
      of C6_GOLDEN_CASES
    ) {

      it(
        golden.id +
        " — " +
        golden.description +
        " stays deterministic across 10 runs",
        async () => {

          /*
           * Any accidental network call is a test failure.
           * C6 build gates must never depend on Gemini quota or live stores.
           */
          const forbiddenFetch =
            vi.fn(
              async () => {

                throw new Error(
                  "NETWORK_FORBIDDEN_IN_C6_GOLDEN"
                );
              }
            );


          vi.stubGlobal(
            "fetch",
            forbiddenFetch
          );


          /*
           * Validate the stored semantic answer against the production schema
           * before using it as a deterministic provider response.
           */
          const decision =
            AISemanticDecisionSchema
              .parse(
                golden.decision
              );


          const signatures:
            string[] =
              [];


          for (
            let run =
              1;
            run <=
              10;
            run +=
              1
          ) {

            const analyze =
              vi.fn(
                async (
                  _packet,
                  _model,
                  _timeout,
                  thinking
                ): Promise<GeminiAnalyzeResult> => {

                  expect(
                    thinking
                  ).toBe(
                    "low"
                  );


                  return {
                    decision,

                    model:
                      "c6-golden-provider",

                    totalDurationMs:
                      1,

                    loadDurationMs:
                      0,

                    promptEvalCount:
                      100,

                    evalCount:
                      25
                  };
                }
              );


            const result =
              await analyzeFinalEvidenceLow({
                packet:
                  golden.packet,

                provider: {
                  analyze
                },

                model:
                  "c6-golden-provider",

                timeoutMs:
                  100
              });


            expect(
              analyze
            ).toHaveBeenCalledTimes(
              1
            );


            expect(
              result.reasoningProfile
            ).toBe(
              "LOW"
            );


            expect(
              result.validation.status
            ).toBe(
              "VALIDATED"
            );


            expect(
              result.validation.issues
            ).toEqual(
              []
            );


            expect(
              result.decision.entity.type
            ).toBe(
              golden.expected
                .entityType
            );


            expect(
              result.decision
                .currentPrice
                ?.value ??
              null
            ).toBe(
              golden.expected
                .currentPrice
            );


            expect(
              result.decision
                .variants
                .find(
                  variant =>
                    variant.selected
                )
                ?.label ??
              null
            ).toBe(
              golden.expected
                .selectedVariant
            );


            expect(
              result.decision
                .condition
                ?.value ??
              null
            ).toBe(
              golden.expected
                .condition
            );


            signatures.push(
              JSON.stringify({
                decision:
                  result.decision,

                validation:
                  result.validation,

                reasoningProfile:
                  result.reasoningProfile
              })
            );
          }


          expect(
            new Set(
              signatures
            ).size
          ).toBe(
            1
          );


          expect(
            forbiddenFetch
          ).not
            .toHaveBeenCalled();
        }
      );
    }


    it(
      "contains exactly the six C6 release-gate scenarios",
      () => {

        expect(
          C6_GOLDEN_CASES.map(
            golden =>
              golden.id
          )
        ).toEqual([
          "01_zshop_r50_body",
          "02_zshop_r50_kit",
          "03_zshop_r50_likenew",
          "04_vjshop_sony_a7iv",
          "05_zshop_sony_fe50_lens",
          "06_zshop_workshop_blog"
        ]);
      }
    );
  }
);
