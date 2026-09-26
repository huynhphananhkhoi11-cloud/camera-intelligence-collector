import {
  readFile
} from "node:fs/promises";

import {
  describe,
  expect,
  test
} from "vitest";

describe(
  "smart-batch:v2 durable production wiring",
  () => {
    test(
      "production script points to durable runtime",
      async () => {
        const pkg =
          JSON.parse(
            await readFile(
              "package.json",
              "utf8"
            )
          ) as {
            scripts?:
              Record<
                string,
                string
              >;
          };

        expect(
          pkg.scripts?.[
            "smart-batch:v2"
          ]
        ).toContain(
          "smartBatchV2DurableCli"
        );
      }
    );

    test(
      "live runtime wires provider pool and durable run state",
      async () => {
        const source =
          await readFile(
            "src/v03/cli/smartBatchV2DurableCli.ts",
            "utf8"
          );

        for (
          const required
          of [
            "loadProviderProfiles",
            "ProviderPool",
            "AtomicRunStateStore",
            "createRunState",
            "transitionRunItem",
            "planResumeForItem",
            "AI_IN_FLIGHT",
            "REVIEW_HOLD"
          ]
        ) {
          expect(source).toContain(
            required
          );
        }
      }
    );

    test(
      "production durable path consumes AI semantic decisions and the direct 13-column exporter",
      async () => {
        const source =
          await readFile(
            "src/v03/cli/smartBatchV2DurableCli.ts",
            "utf8"
          );

        expect(source).toContain(
          "SemanticDecisionValidationResult"
        );

        expect(source).toContain(
          "exportSemantic13WorkbookAtomic"
        );

        expect(source).not.toContain(
          "validateVisualExtraction("
        );
      }
    );

    test(
      "durable runtime preserves Vision-First safety rules",
      async () => {
        const source =
          await readFile(
            "src/v03/cli/smartBatchV2DurableCli.ts",
            "utf8"
          );

        expect(source).not.toMatch(
          /13_?000/
        );

        expect(source).toContain(
          "BACKOFF_SAME_PROJECT"
        );

        expect(source).toContain(
          "PAUSE_AI_QUEUE"
        );

        expect(source).toContain(
          "SKIP_COMMITTED"
        );

        expect(source).toContain(
          "provider-error.json"
        );

        expect(source).toContain(
          "report.summary.review"
        );
      }
    );
  }
);
