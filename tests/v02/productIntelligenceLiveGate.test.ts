import {
  writeFile
} from "node:fs/promises";

import {
  join
} from "node:path";

import {
  afterAll,
  beforeAll,
  describe,
  expect,
  test
} from "vitest";

import {
  chromium,
  type Browser
} from "playwright";

import {
  collectBrowserDetail
} from "../../src/v02/extraction/browserDetailCollector.ts";

import {
  extractRawProductFactsFromAcquisition
} from "../../src/v02/extraction/detailRawProductExtractor.ts";

import {
  createOfflineReplaySnapshot,
  writeOfflineReplaySnapshot
} from "../../src/v02/extraction/offlineReplaySnapshot.ts";

import {
  analyzeRawProduct
} from "../../src/v02/evidenceEngine.ts";

type ConditionPolicy =
  | "VISIBLE_NEW_WITH_CONFLICT_GUARD"
  | "USED"
  | "NOT_APPLICABLE";

interface LiveCase {
  name: string;

  slug: string;

  url: string;

  expected: {
    entity:
      "CAMERA";

    rental:
      boolean;

    sale:
      boolean;

    conditionPolicy:
      ConditionPolicy;
  };
}

const liveEnabled =
  process.env
    .CAMINTEL_PHASE7_LIVE ===
  "1";

const diagnosticDir =
  process.env
    .CAMINTEL_PHASE7_DIAGNOSTIC_DIR ??
  "";

const liveCases:
  LiveCase[] = [
    {
      name:
        "Top1 Canon R50 visible NEW",

      slug:
        "top1-canon-r50-new",

      url:
        process.env
          .CAMINTEL_PHASE7_TOP1_NEW_URL ??
        "https://mayanhtop1.com/canon-eos-r50-new",

      expected: {
        entity:
          "CAMERA",

        rental:
          false,

        sale:
          true,

        conditionPolicy:
          "VISIBLE_NEW_WITH_CONFLICT_GUARD"
      }
    },

    {
      name:
        "Top1 Canon R50 USED",

      slug:
        "top1-canon-r50-used",

      url:
        process.env
          .CAMINTEL_PHASE7_TOP1_USED_URL ??
        "https://mayanhtop1.com/canon-eos-r50-lens-kit-18-45mm-hang-cu",

      expected: {
        entity:
          "CAMERA",

        rental:
          false,

        sale:
          true,

        conditionPolicy:
          "USED"
      }
    },

    {
      name:
        "Thue May Anh Sai Gon Sony A6400",

      slug:
        "rental-sony-a6400",

      url:
        process.env
          .CAMINTEL_PHASE7_RENTAL_URL ??
        "https://thuemayanhsaigon.com/equipment/21",

      expected: {
        entity:
          "CAMERA",

        rental:
          true,

        sale:
          false,

        conditionPolicy:
          "NOT_APPLICABLE"
      }
    }
  ];

if (!liveEnabled) {
  test.skip(
    "Phase 7 live product intelligence gate",
    () => {
      return;
    }
  );
}
else {
  describe(
    "Phase 7 live product intelligence gate",
    () => {
      let browser:
        Browser | null =
        null;

      beforeAll(
        async () => {
          if (!diagnosticDir) {
            throw new Error(
              "CAMINTEL_PHASE7_DIAGNOSTIC_DIR is required."
            );
          }

          browser =
            await chromium.launch({
              headless:
                true
            });
        },
        30_000
      );

      afterAll(
        async () => {
          if (browser) {
            await browser.close();
          }
        }
      );

      test.each(
        liveCases
      )(
        "$name",
        async liveCase => {
          if (!browser) {
            throw new Error(
              "Playwright browser was not initialized."
            );
          }

          const context =
            await browser.newContext({
              ignoreHTTPSErrors:
                true,

              locale:
                "vi-VN"
            });

          try {
            const page =
              await context.newPage();

            const acquisition =
              await collectBrowserDetail(
                page,
                liveCase.url,
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

            const analysis =
              analyzeRawProduct(
                facts,
                "UNKNOWN"
              );

            /*
             * Persist diagnostics before assertions.
             * A live failure must remain replayable.
             */
            const snapshot =
              createOfflineReplaySnapshot(
                acquisition,
                facts
              );

            await writeOfflineReplaySnapshot(
              join(
                diagnosticDir,
                `${liveCase.slug}.snapshot.json`
              ),
              snapshot
            );

            await writeFile(
              join(
                diagnosticDir,
                `${liveCase.slug}.analysis.json`
              ),
              JSON.stringify(
                {
                  case:
                    liveCase,

                  requestedUrl:
                    acquisition.requestedUrl,

                  finalUrl:
                    acquisition.finalUrl,

                  title:
                    facts.title,

                  breadcrumbs:
                    facts.breadcrumbs,

                  listingCategory:
                    facts.listingCategory,

                  entity:
                    analysis.entity,

                  offer:
                    analysis.offer,

                  condition:
                    analysis.condition,

                  forms:
                    analysis.forms,

                  decision:
                    analysis.decision,

                  reasons:
                    analysis.reasons
                },
                null,
                2
              ) + "\n",
              "utf8"
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
                      error.status !==
                        null &&
                      error.status >=
                        400
                    )
                  )
              );

            expect(
              fatalNavigationErrors
            ).toEqual([]);

            expect(
              acquisition.html.length
            ).toBeGreaterThan(
              500
            );

            expect(
              facts.title.trim().length
            ).toBeGreaterThan(
              0
            );

            /*
             * ENTITY
             */
            expect(
              analysis.entity.type
            ).toBe(
              liveCase.expected.entity
            );

            expect(
              analysis.entity.isCamera
            ).toBe(true);

            expect(
              analysis.entity.evidence.length
            ).toBeGreaterThan(
              0
            );

            /*
             * OFFER
             */
            expect(
              analysis.offer.rental
            ).toBe(
              liveCase.expected.rental
            );

            expect(
              analysis.offer.sale
            ).toBe(
              liveCase.expected.sale
            );

            if (
              liveCase.expected.rental
            ) {
              expect(
                analysis.offer.evidence
                  .some(
                    evidence =>
                      evidence.kind ===
                        "RENTAL" &&
                      evidence.weight >
                        0 &&
                      evidence.source !==
                        "SITE_PRIOR"
                  )
              ).toBe(true);
            }

            if (
              liveCase.expected.sale
            ) {
              expect(
                analysis.offer.evidence
                  .some(
                    evidence =>
                      evidence.kind ===
                        "SALE" &&
                      evidence.weight >
                        0 &&
                      evidence.source !==
                        "SITE_PRIOR"
                  )
              ).toBe(true);
            }

            /*
             * CONDITION
             *
             * Do not force a preferred answer when
             * independent strong evidence conflicts.
             */
            if (
              liveCase.expected.conditionPolicy ===
                "VISIBLE_NEW_WITH_CONFLICT_GUARD"
            ) {
              const strongVisibleNew =
                analysis.condition.evidence
                  .some(
                    evidence =>
                      evidence.condition ===
                        "NEW" &&
                      evidence.source ===
                        "TITLE" &&
                      evidence.weight >=
                        60
                  );

              expect(
                strongVisibleNew
              ).toBe(true);

              const strongContradiction =
                analysis.condition.evidence
                  .some(
                    evidence =>
                      evidence.condition !==
                        "NEW" &&
                      evidence.weight >=
                        60
                  );

              if (
                strongContradiction
              ) {
                expect(
                  analysis.condition.condition
                ).toBe(
                  "UNKNOWN"
                );

                expect(
                  analysis.condition.conflict
                ).toBe(true);

                expect(
                  analysis.condition.evidence.length
                ).toBeGreaterThanOrEqual(
                  2
                );

                expect(
                  analysis.decision
                ).toBe(
                  "REVIEW"
                );
              }
              else {
                expect(
                  analysis.condition.condition
                ).toBe(
                  "NEW"
                );

                expect(
                  analysis.condition.conflict
                ).toBe(false);

                expect(
                  analysis.decision
                ).toBe(
                  "ACCEPT"
                );
              }
            }
            else if (
              liveCase.expected.conditionPolicy ===
                "USED"
            ) {
              expect(
                analysis.condition.condition
              ).toBe(
                "USED"
              );

              expect(
                analysis.condition.conflict
              ).toBe(false);

              expect(
                analysis.condition.evidence.length
              ).toBeGreaterThan(
                0
              );

              expect(
                analysis.decision
              ).toBe(
                "ACCEPT"
              );
            }
            else {
              /*
               * Rental-only product:
               * sale condition is not applicable.
               */
              expect(
                analysis.condition.condition
              ).toBe(
                "UNKNOWN"
              );

              expect(
                analysis.condition.conflict
              ).toBe(false);

              expect(
                analysis.condition.evidence
              ).toEqual([]);

              expect(
                analysis.decision
              ).toBe(
                "ACCEPT"
              );
            }

            /*
             * Site prior remains audit-only and
             * cannot carry product-level truth.
             */
            expect(
              analysis.offer.evidence
                .filter(
                  evidence =>
                    evidence.source ===
                      "SITE_PRIOR"
                )
                .every(
                  evidence =>
                    evidence.weight ===
                      0
                )
            ).toBe(true);
          }
          finally {
            await context.close();
          }
        },
        60_000
      );
    }
  );
}