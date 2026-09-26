import {
  chromium
} from "playwright";

import {
  test,
  expect
} from "vitest";

import {
  collectBrowserDetail
} from "../../../src/v02/extraction/browserDetailCollector.ts";

import {
  extractRawProductFactsFromAcquisition
} from "../../../src/v02/extraction/detailRawProductExtractor.ts";

import {
  createOfflineReplaySnapshot,
  writeOfflineReplaySnapshot
} from "../../../src/v02/extraction/offlineReplaySnapshot.ts";

const liveUrl =
  process.env
    .CAMINTEL_LIVE_DETAIL_URL;

const diagnosticPath =
  process.env
    .CAMINTEL_LIVE_DIAGNOSTIC_PATH;

if (!liveUrl) {
  test.skip(
    "Phase 6 live detail smoke",
    () => {
      return;
    }
  );
}
else {
  test(
    "Phase 6 live detail smoke",
    async () => {
      if (!diagnosticPath) {
        throw new Error(
          "CAMINTEL_LIVE_DIAGNOSTIC_PATH is required for live smoke."
        );
      }

      const browser =
        await chromium.launch({
          headless: true
        });

      try {
        const context =
          await browser.newContext({
            ignoreHTTPSErrors:
              true,

            locale:
              "vi-VN"
          });

        const page =
          await context.newPage();

        const acquisition =
          await collectBrowserDetail(
            page,
            liveUrl,
            {
              navigationTimeoutMs:
                45_000,

              settleTimeoutMs:
                3_000,

              interactionFallbackOptions: {
                maxInteractions:
                  2,

                mutationTimeoutMs:
                  500,

                actionTimeoutMs:
                  2_000
              }
            }
          );

        const facts =
          extractRawProductFactsFromAcquisition(
            acquisition
          );

        /*
         * Write diagnostics BEFORE assertions.
         *
         * If a live assertion exposes a real bug/site change,
         * this snapshot survives for fixture conversion.
         */
        const snapshot =
          createOfflineReplaySnapshot(
            acquisition,
            facts
          );

        await writeOfflineReplaySnapshot(
          diagnosticPath,
          snapshot
        );

        const fatalNavigationErrors =
          acquisition.errors.filter(
            error =>
              error.stage ===
                "NAVIGATION" &&
              (
                error.code ===
                  "NAVIGATION_TIMEOUT" ||
                error.code ===
                  "NAVIGATION_FAILED" ||
                (
                  error.status !== null &&
                  error.status >= 400
                )
              )
          );

        expect(
          fatalNavigationErrors
        ).toEqual([]);

        expect(
          acquisition.finalUrl
        ).toMatch(
          /^https?:\/\//
        );

        expect(
          acquisition.html.length
        ).toBeGreaterThan(
          500
        );

        expect(
          facts.title
        ).toMatch(
          /canon.*r50/i
        );

        expect(
          facts.pageText.length
        ).toBeGreaterThan(
          100
        );

        expect(
          facts.pageText
        ).toMatch(
          /canon/i
        );

        expect(
          facts.pageText
        ).toMatch(
          /r50/i
        );

        await context.close();
      }
      finally {
        await browser.close();
      }
    },
    60_000
  );
}