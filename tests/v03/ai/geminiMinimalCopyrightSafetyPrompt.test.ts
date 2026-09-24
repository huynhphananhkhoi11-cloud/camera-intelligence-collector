import {
  describe,
  expect,
  test
} from "vitest";

import {
  buildSimpleSemantic13Prompt
} from "../../../src/v03/ai/simpleSemantic13Prompt.js";

describe(
  "minimal Gemini prompt provider safety",
  () => {
    test(
      "asks for concise paraphrase instead of long source recitation",
      () => {
        const prompt =
          buildSimpleSemantic13Prompt({
            pageUrl:
              "https://example.com/item",
            finalUrl:
              "https://example.com/item",
            website:
              "example.com",
            shots: [
              {
                shotId:
                  "hero-01",
                sectionLabel:
                  "hero"
              }
            ]
          });

        expect(prompt).toContain(
          "Do not reproduce long product descriptions, reviews, manuals, articles, or marketing copy verbatim."
        );

        expect(prompt).toContain(
          "Summarize descriptive text concisely in your own words."
        );
      }
    );
  }
);
