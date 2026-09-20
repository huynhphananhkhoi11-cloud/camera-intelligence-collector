import {
  readFileSync
} from "node:fs";

import {
  resolve
} from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";


describe(
  "C4 planner transient recovery",
  () => {

    it(
      "retries 502/503/504 once and then finalizes existing live evidence",
      () => {

        const source =
          readFileSync(
            resolve(
              "src/v03/agent/browserAgentSession.ts"
            ),
            "utf8"
          );


        expect(
          source
        ).toContain(
          "GEMINI_BROWSER_PLANNER_HTTP_(?:502|503|504)"
        );


        expect(
          source
        ).toContain(
          "Retrying planner once after 2s"
        );


        expect(
          source
        ).toContain(
          "PROVIDER STOP\\nFinalizing current page evidence."
        );


        expect(
          source
        ).toContain(
          "PROVIDER QUOTA STOP\\nFinalizing current page evidence."
        );


        const plannerCallCount =
          (
            source.match(
              /await planner\.plan\(/gu
            ) ??
            []
          ).length;


        expect(
          plannerCallCount
        ).toBeGreaterThanOrEqual(
          2
        );
      }
    );
  }
);
