import {
  describe,
  expect,
  test
} from "vitest";

import {
  SIMPLE_SEMANTIC_13_PROMPT
} from "../../../src/v04/ai/simpleSemantic13Prompt.js";


describe(
  "V04 column semantic contract",
  () => {
    test(
      "defines all 13 output columns for Gemini without retailer or benchmark rules",
      () => {
        const prompt =
          SIMPLE_SEMANTIC_13_PROMPT;

        const required =
          [
            "website: the website/domain context for this product page",
            "productName: the visible identity/name of the primary camera product",
            "condition: whether the primary camera is NEW or USED",
            "specs: concise visible technical characteristics of the primary camera",
            "rentalPricePerDay: the explicit visible price to rent the primary product for one day or per day",
            "rentalTerms: other visible rental conditions or rental options",
            "accessoriesIncluded: individual accessories or gifts explicitly included with the primary product",
            "bundleIncluded: an explicit combo, package, kit, or grouped offer presented as a bundle",
            "rating: the visible rating score of the primary product",
            "reviewCount: the visible number of reviews for the primary product",
            "stock: the visible stock or availability information for the primary product",
            "salePrice: the current visible selling price of the primary product for the selected or default offer",
            "url: the final product page URL"
          ];

        for (
          const phrase of required
        ) {
          expect(
            prompt
          ).toContain(
            phrase
          );
        }

        expect(
          prompt
        ).toContain(
          "Map visible facts to columns by meaning, using your own visual and language understanding."
        );

        expect(
          prompt
        ).toContain(
          "If a value is not visibly supported, use null or [] as appropriate. Do not guess."
        );

        expect(
          prompt
        ).toContain(
          "Preserve specific visible wording when the wording itself is the requested value, especially stock or availability text."
        );

        const forbidden =
          [
            "zshop",
            "vjshop",
            "mayanhtop1",
            "15.790.000",
            "15.490.000",
            "400,000",
            "400.000",
            "co 5 cua hang",
            "co 7 cua hang"
          ];

        const lower =
          prompt
            .toLowerCase();

        for (
          const token of forbidden
        ) {
          expect(
            lower
          ).not.toContain(
            token
          );
        }
      }
    );
  }
);
