import {
  describe,
  expect,
  test
} from "vitest";

import {
  HUMAN_READER_SYSTEM_PROMPT
} from "../../../src/v03/ai/ollamaSemanticProvider.js";


describe(
  "human-like AI prompt contract",
  () => {

    test(
      "locks the selected-configuration and no-min-max behavior",
      () => {

        expect(
          HUMAN_READER_SYSTEM_PROMPT
        ).toContain(
          "careful human shopper"
        );


        expect(
          HUMAN_READER_SYSTEM_PROMPT
        ).toContain(
          "selected/default configuration"
        );


        expect(
          HUMAN_READER_SYSTEM_PROMPT
        ).toContain(
          "Do not create a price range"
        );


        expect(
          HUMAN_READER_SYSTEM_PROMPT
        ).toContain(
          "No semanticRole"
        );
      }
    );
  }
);
