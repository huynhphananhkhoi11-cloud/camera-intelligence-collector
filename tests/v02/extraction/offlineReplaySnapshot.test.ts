import {
  mkdtemp,
  readFile,
  rm
} from "node:fs/promises";

import {
  join
} from "node:path";

import {
  tmpdir
} from "node:os";

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
  OFFLINE_REPLAY_SCHEMA_VERSION,
  createOfflineReplaySnapshot,
  parseOfflineReplaySnapshot,
  readOfflineReplaySnapshot,
  serializeOfflineReplaySnapshot,
  writeOfflineReplaySnapshot
} from "../../../src/v02/extraction/offlineReplaySnapshot.ts";

function acquisition():
  DetailAcquisitionResult {
  return {
    requestedUrl:
      "https://example.com/products/canon-r50?product-id=42",

    finalUrl:
      "https://example.com/products/canon-r50",

    canonicalUrl:
      "https://example.com/products/canon-r50",

    html: `
      <html>
        <body>
          <h1>Canon R50</h1>

          <button>
            Mua ngay
          </button>

          <h2>
            Thông số kỹ thuật
          </h2>

          <div>
            APS-C 24.2MP
          </div>
        </body>
      </html>
    `,

    networkSnapshot: {
      requests: [],

      responses: [],

      outcomes: [],

      apiCandidates: [
        {
          responseUrl:
            "https://example.com/api/products",

          method:
            "GET",

          status:
            200,

          contentType:
            "application/json",

          path:
            "$.data.products",

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
              id: 42,

              name:
                "Canon R50",

              price:
                15000000,

              url:
                "/products/canon-r50"
            }
          ],

          seenCount:
            1
        }
      ]
    },

    interactions: [
      {
        kind:
          "TAB",

        target:
          "Thông số kỹ thuật",

        outcome:
          "SUCCESS",

        startedAt:
          "2026-09-17T16:00:00.000Z",

        finishedAt:
          "2026-09-17T16:00:00.050Z",

        detail:
          "Rendered DOM changed after interaction."
      }
    ],

    timing: {
      navigationMs:
        120,

      settleMs:
        30,

      interactionMs:
        50,

      totalMs:
        200
    },

    errors: []
  };
}

describe(
  "offlineReplaySnapshot",
  () => {
    test(
      "round-trips replayable RawProductFacts without a browser",
      () => {
        const input =
          acquisition();

        const facts =
          extractRawProductFactsFromAcquisition(
            input
          );

        const snapshot =
          createOfflineReplaySnapshot(
            input,
            facts,
            {
              capturedAt:
                "2026-09-17T16:05:00.000Z"
            }
          );

        const serialized =
          serializeOfflineReplaySnapshot(
            snapshot
          );

        const replayed =
          parseOfflineReplaySnapshot(
            serialized
          );

        expect(
          replayed.schemaVersion
        ).toBe(
          OFFLINE_REPLAY_SCHEMA_VERSION
        );

        expect(
          replayed.facts
        ).toEqual(
          facts
        );

        expect(
          replayed.facts.title
        ).toBe(
          "Canon R50"
        );

        expect(
          replayed.facts.sections
            .some(
              section =>
                section.key ===
                "SPECS"
            )
        ).toBe(true);

        expect(
          replayed.facts.networkFacts
        ).toHaveLength(1);

        expect(
          replayed.facts.networkFacts[0]
            ?.sample
        ).toEqual(
          expect.objectContaining({
            id: 42,
            price:
              15000000
          })
        );

        expect(
          replayed.acquisition
            .interactions
        ).toHaveLength(1);
      }
    );

    test(
      "snapshot does not persist rendered HTML or full network observer payload",
      () => {
        const input =
          acquisition();

        const facts =
          extractRawProductFactsFromAcquisition(
            input
          );

        const snapshot =
          createOfflineReplaySnapshot(
            input,
            facts,
            {
              capturedAt:
                "2026-09-17T16:05:00.000Z"
            }
          );

        const serialized =
          serializeOfflineReplaySnapshot(
            snapshot
          );

        expect(
          serialized
        ).not.toContain(
          "\"html\""
        );

        expect(
          serialized
        ).not.toContain(
          "\"networkSnapshot\""
        );

        expect(
          serialized
        ).toContain(
          "\"networkFacts\""
        );
      }
    );

    test(
      "creates an immutable-by-copy snapshot boundary",
      () => {
        const input =
          acquisition();

        const facts =
          extractRawProductFactsFromAcquisition(
            input
          );

        const snapshot =
          createOfflineReplaySnapshot(
            input,
            facts,
            {
              capturedAt:
                "2026-09-17T16:05:00.000Z"
            }
          );

        facts.title =
          "Changed after snapshot";

        input.interactions[0]!.target =
          "Changed target";

        expect(
          snapshot.facts.title
        ).toBe(
          "Canon R50"
        );

        expect(
          snapshot.acquisition
            .interactions[0]
            ?.target
        ).toBe(
          "Thông số kỹ thuật"
        );
      }
    );

    test(
      "rejects unsupported schema versions",
      () => {
        const input =
          acquisition();

        const facts =
          extractRawProductFactsFromAcquisition(
            input
          );

        const snapshot =
          createOfflineReplaySnapshot(
            input,
            facts,
            {
              capturedAt:
                "2026-09-17T16:05:00.000Z"
            }
          );

        const malformed = {
          ...snapshot,
          schemaVersion:
            "future.snapshot.v999"
        };

        expect(
          () =>
            parseOfflineReplaySnapshot(
              JSON.stringify(
                malformed
              )
            )
        ).toThrow(
          /Unsupported offline replay snapshot schemaVersion/
        );
      }
    );

    test(
      "rejects snapshots missing required replay facts",
      () => {
        const malformed = {
          schemaVersion:
            OFFLINE_REPLAY_SCHEMA_VERSION,

          capturedAt:
            "2026-09-17T16:05:00.000Z",

          acquisition: {
            requestedUrl:
              "https://example.com/a",

            finalUrl:
              "https://example.com/a",

            canonicalUrl:
              "https://example.com/a",

            interactions:
              [],

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

            errors:
              []
          },

          facts: {
            url:
              "https://example.com/a",

            title:
              "A"
          }
        };

        expect(
          () =>
            parseOfflineReplaySnapshot(
              JSON.stringify(
                malformed
              )
            )
        ).toThrow(
          /facts\.breadcrumbs/
        );
      }
    );

    test(
      "writes and reads snapshot JSON from disk",
      async () => {
        const directory =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-replay-"
            )
          );

        try {
          const filePath =
            join(
              directory,
              "nested",
              "canon-r50.json"
            );

          const input =
            acquisition();

          const facts =
            extractRawProductFactsFromAcquisition(
              input
            );

          const snapshot =
            createOfflineReplaySnapshot(
              input,
              facts,
              {
                capturedAt:
                  "2026-09-17T16:05:00.000Z"
              }
            );

          await writeOfflineReplaySnapshot(
            filePath,
            snapshot
          );

          const raw =
            await readFile(
              filePath,
              "utf8"
            );

          expect(
            raw.endsWith(
              "\n"
            )
          ).toBe(true);

          const restored =
            await readOfflineReplaySnapshot(
              filePath
            );

          expect(
            restored
        ).toEqual(
            snapshot
          );
        }
        finally {
          await rm(
            directory,
            {
              recursive:
                true,

              force:
                true
            }
          );
        }
      }
    );
  }
);