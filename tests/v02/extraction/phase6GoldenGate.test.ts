import {
  readFile
} from "node:fs/promises";

import {
  describe,
  expect,
  test
} from "vitest";

import type {
  DetailAcquisitionResult
} from "../../../src/v02/extraction/detailAcquisitionTypes.ts";

import {
  extractRawProductFactsFromAcquisition
} from "../../../src/v02/extraction/detailRawProductExtractor.ts";

import {
  extractRawProductFactsFromHtml
} from "../../../src/v02/rawProductExtractor.ts";

import {
  createOfflineReplaySnapshot,
  parseOfflineReplaySnapshot,
  serializeOfflineReplaySnapshot
} from "../../../src/v02/extraction/offlineReplaySnapshot.ts";

async function fixture(
  name: string
): Promise<string> {
  return readFile(
    new URL(
      `../../fixtures/v02/detail/${name}`,
      import.meta.url
    ),
    "utf8"
  );
}

function acquisitionFromHtml(
  html: string
): DetailAcquisitionResult {
  return {
    requestedUrl:
      "https://zshop.vn/canon-eos-r50-vi.html",

    finalUrl:
      "https://zshop.vn/canon-eos-r50-vi.html",

    canonicalUrl:
      "https://zshop.vn/canon-eos-r50-vi.html",

    html,

    networkSnapshot: {
      requests: [],

      responses: [],

      outcomes: [],

      apiCandidates: [
        {
          responseUrl:
            "https://zshop.vn/api/products",

          method:
            "GET",

          status:
            200,

          contentType:
            "application/json",

          path:
            "$.products",

          itemCount:
            1,

          score:
            90,

          commonKeys: [
            "id",
            "name",
            "price",
            "url"
          ],

          signalKeys: [
            "id",
            "name",
            "price",
            "url"
          ],

          sample: [
            {
              id:
                "r50",

              name:
                "Canon EOS R50",

              price:
                15990000,

              url:
                "/canon-eos-r50-vi.html"
            }
          ],

          seenCount:
            1
        }
      ]
    },

    interactions: [],

    timing: {
      navigationMs:
        0,

      settleMs:
        0,

      interactionMs:
        0,

      totalMs:
        0
    },

    errors: []
  };
}

describe(
  "Phase 6 golden detail gate",
  () => {
    test(
      "extracts stable DOM and structured evidence from known new-product fixture",
      async () => {
        const html =
          await fixture(
            "zshop-canon-r50-new.html"
          );

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://zshop.vn/canon-eos-r50-vi.html"
          );

        expect(
          facts.title
        ).toBe(
          "Canon EOS R50"
        );

        expect(
          facts.jsonLd
        ).toHaveLength(1);

        expect(
          facts.buttons
        ).toContain(
          "Mua ngay"
        );

        expect(
          facts.sections.some(
            section =>
              section.key ===
              "SPECS"
          )
        ).toBe(true);

        expect(
          facts.pageText
        ).toContain(
          "APS-C CMOS 24.2MP"
        );

        expect(
          facts.pageText
        ).not.toContain(
          "FAKE_SCRIPT_PRICE_999999999"
        );

        expect(
          facts.pageText
        ).not.toContain(
          "FAKE_STYLE_STOCK"
        );

        expect(
          facts.pageText
        ).not.toContain(
          "FAKE_SVG_RATING"
        );
      }
    );

    test(
      "preserves known Likenew evidence without inventing condition truth",
      async () => {
        const html =
          await fixture(
            "zshop-canon-r50-likenew.html"
          );

        const facts =
          extractRawProductFactsFromHtml(
            html,
            "https://zshop.vn/canon-eos-r50-likenew.html"
          );

        expect(
          facts.title
        ).toContain(
          "Canon EOS R50"
        );

        expect(
          facts.pageText
        ).toContain(
          "Hàng Likenew"
        );

        expect(
          facts.pageText
        ).toContain(
          "Bảo hành 06 tháng"
        );

        /*
         * Phase 6 captures evidence only.
         * USED classification belongs to Phase 7.
         */
        expect(
          facts.networkFacts
        ).toEqual([]);
      }
    );

    test(
      "replays the complete acquisition-to-RawProductFacts chain offline",
      async () => {
        const html =
          await fixture(
            "zshop-canon-r50-new.html"
          );

        const acquisition =
          acquisitionFromHtml(
            html
          );

        const facts =
          extractRawProductFactsFromAcquisition(
            acquisition
          );

        expect(
          facts.networkFacts
        ).toHaveLength(1);

        expect(
          facts.networkFacts[0]
            ?.hints
            .name
        ).toBe(
          "Canon EOS R50"
        );

        const snapshot =
          createOfflineReplaySnapshot(
            acquisition,
            facts,
            {
              capturedAt:
                "2026-09-17T16:45:00.000Z"
            }
          );

        const replayed =
          parseOfflineReplaySnapshot(
            serializeOfflineReplaySnapshot(
              snapshot
            )
          );

        expect(
          replayed.facts
        ).toEqual(
          facts
        );

        expect(
          replayed.facts.title
        ).toBe(
          "Canon EOS R50"
        );
      }
    );
  }
);