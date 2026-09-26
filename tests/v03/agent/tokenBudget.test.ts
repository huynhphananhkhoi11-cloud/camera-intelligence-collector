import {
  describe,
  expect,
  it
} from "vitest";

import {
  AgentTokenBudget
} from "../../../src/v03/agent/tokenBudget.js";


describe(
  "AgentTokenBudget",
  () => {

    it(
      "blocks a request that would exceed the hard input budget",
      () => {

        const budget =
          new AgentTokenBudget();


        budget.record({
          inputTokens:
            19_000
        });


        expect(
          budget.canStartRequest(
            1_001
          )
        ).toBe(
          false
        );


        expect(
          budget.canStartRequest(
            1_000
          )
        ).toBe(
          true
        );
      }
    );


    it(
      "tracks warning states",
      () => {

        const budget =
          new AgentTokenBudget();


        budget.record({
          inputTokens:
            10_500
        });


        expect(
          budget.level()
        ).toBe(
          "SOFT"
        );


        budget.record({
          inputTokens:
            5_000
        });


        expect(
          budget.level()
        ).toBe(
          "WARNING"
        );
      }
    );


    it(
      "uses low resolution for a much smaller image estimate",
      () => {

        const budget =
          new AgentTokenBudget();


        const low =
          budget.estimateInput(
            4_000,
            "low"
          );


        const high =
          budget.estimateInput(
            4_000,
            "high"
          );


        expect(
          low
        ).toBeLessThan(
          high
        );
      }
    );
  }
);