import { describe, expect, test } from "vitest";

import { SIMPLE_SEMANTIC_13_PROMPT } from "../../../src/v04/ai/simpleSemantic13Prompt.js";

const REQUIRED = [
  "Use your own visual and language understanding.",
  "Fill the 13 workbook fields using what is visibly supported.",
  "Do not reproduce long product descriptions, reviews, manuals, articles, or marketing copy verbatim.",
  "Read all supplied screenshots.",
  "Identify the primary camera product on the page.",
  "If a value is not visible, return null or [] as appropriate.",
  "Summarize descriptive text concisely in your own words.",
  "Return one JSON object only."
] as const;

const FORBIDDEN = [
  "evidence",
  "rawtext",
  "shotid",
  "field-by-field",
  "repair",
  "normalize",
  "zshop",
  "canon eos r50",
  "15.990.000"
] as const;

describe("SIMPLE_SEMANTIC_13_PROMPT", () => {
  test("contains every required minimal semantic instruction", () => {
    for (const phrase of REQUIRED) {
      expect(SIMPLE_SEMANTIC_13_PROMPT).toContain(phrase);
    }
  });

  test("contains no legacy semantic machinery or hardcoded benchmark content", () => {
    const prompt = SIMPLE_SEMANTIC_13_PROMPT.toLowerCase();

    for (const phrase of FORBIDDEN) {
      expect(prompt).not.toContain(phrase);
    }
  });
});
