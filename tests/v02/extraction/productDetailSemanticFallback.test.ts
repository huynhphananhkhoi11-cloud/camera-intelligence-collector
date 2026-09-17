import {
  readFile
} from "node:fs/promises";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  extractRawProductFactsFromHtml
} from "../../../src/v02/rawProductExtractor.ts";

import {
  classifySectionHeading
} from "../../../src/v02/sectionizer.ts";

import {
  analyzeRawProduct
} from "../../../src/v02/evidenceEngine.ts";

describe(
  "product detail semantic fallback regression",
  () => {
    test(
      "keeps primary product price and CTA scoped away from related products",
      async () => {
        expect(
          classifySectionHeading(
            "TH\u00d4NG S\u1ed0 N\u1ed4I B\u1eacT"
          )
        ).toBe(
          "SPECS"
        );

        const html =
          await readFile(
            new URL(
              "../../fixtures/v02/detail/phase7-rental-semantic-scope.html",
              import.meta.url
            ),
            "utf8"
          );

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://example.com/equipment/21"
          );

        const specs =
          facts.sections.find(
            section =>
              section.key ===
              "SPECS"
          );

        expect(
          specs
        ).toBeDefined();

        expect(
          specs?.content
        ).toContain(
          "APS-C CMOS 24.2MP"
        );

        const primaryRentalPrice =
          facts.visiblePriceTexts.find(
            value =>
              value.includes(
                "360,000"
              )
          );

        expect(
          primaryRentalPrice
        ).toBeDefined();

        expect(
          primaryRentalPrice
        ).toMatch(
          /\/\s*ng\u00e0y/i
        );

        expect(
          facts.visiblePriceTexts.some(
            value =>
              value.includes(
                "180,000"
              )
          )
        ).toBe(false);

        expect(
          facts.buttons.some(
            value =>
              /THU\u00ca NGAY/i
                .test(
                  value
                )
          )
        ).toBe(true);

        expect(
          facts.buttons
        ).not.toContain(
          "RELATED RENT ACTION"
        );

        expect(
          facts.buttons
        ).not.toContain(
          "GLOBAL BOOKING"
        );

        const analysis =
          analyzeRawProduct(
            facts,
            "UNKNOWN"
          );

        expect(
          analysis.entity.type
        ).toBe(
          "CAMERA"
        );

        expect(
          analysis.entity.isCamera
        ).toBe(true);

        expect(
          analysis.offer.rental
        ).toBe(true);

        expect(
          analysis.offer.sale
        ).toBe(false);

        expect(
          analysis.offer.evidence
            .some(
              evidence =>
                evidence.source ===
                  "CTA" ||
                evidence.source ===
                  "PRICE"
            )
        ).toBe(true);

        expect(
          analysis.condition.condition
        ).toBe(
          "UNKNOWN"
        );

        expect(
          analysis.condition.evidence
        ).toEqual([]);

        expect(
          analysis.decision
        ).toBe(
          "ACCEPT"
        );
      }
    );
  }
);