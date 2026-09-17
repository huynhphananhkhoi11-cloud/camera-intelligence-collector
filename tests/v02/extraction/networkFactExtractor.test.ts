import {
  describe,
  expect,
  test
} from "vitest";

import type {
  DetailAcquisitionResult
} from "../../../src/v02/extraction/detailAcquisitionTypes.ts";

import {
  extractNetworkFacts
} from "../../../src/v02/extraction/networkFactExtractor.ts";

function acquisition(
  overrides:
    Partial<
      DetailAcquisitionResult
    > = {}
): DetailAcquisitionResult {
  return {
    requestedUrl:
      "https://example.com/products/canon-r50?product-id=42",

    finalUrl:
      "https://example.com/products/canon-r50",

    canonicalUrl:
      "https://example.com/products/canon-r50",

    html: "",

    networkSnapshot: {
      requests: [],

      responses: [
        {
          url:
            "https://example.com/api/products/42",
          method:
            "GET",
          resourceType:
            "xhr",
          status:
            200,
          contentType:
            "application/json",
          declaredContentLength:
            null,
          actualBodyBytes:
            100,
          bodyState:
            "INSPECTED",
          candidateCount:
            1,
          timestamp:
            "2026-09-17T12:00:00.000Z",
          error:
            null
        }
      ],

      outcomes: [],

      apiCandidates: [
        {
          responseUrl:
            "https://example.com/api/products/42",
          method:
            "GET",
          status:
            200,
          contentType:
            "application/json",
          path:
            "$.data.products",
          itemCount:
            2,
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
            },
            {
              id: 99,
              name:
                "Sony A6400",
              price:
                16000000,
              url:
                "/products/sony-a6400"
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
        100,
      settleMs:
        20,
      interactionMs:
        0,
      totalMs:
        120
    },

    errors: [],

    ...overrides
  };
}

describe(
  "networkFactExtractor",
  () => {
    test(
      "correlates API sample to detail URL and product id without resolving business values",
      () => {
        const facts =
          extractNetworkFacts(
            acquisition()
          );

        expect(
          facts
        ).toHaveLength(2);

        const matched =
          facts[0];

        expect(
          matched?.source
        ).toBe(
          "NETWORK_API"
        );

        expect(
          matched?.candidatePath
        ).toBe(
          "$.data.products"
        );

        expect(
          matched?.hints
            .productId
        ).toBe("42");

        expect(
          matched?.hints
            .canonicalUrl
        ).toBe(
          "https://example.com/products/canon-r50"
        );

        expect(
          matched?.correlation
            .reasons
        ).toEqual(
          expect.arrayContaining([
            "SAMPLE_URL_MATCH",
            "PRODUCT_ID_MATCH",
            "SLUG_MATCH"
          ])
        );

        expect(
          matched?.correlation
            .score
        ).toBe(100);

        expect(
          matched?.responseTimestamps
        ).toEqual([
          "2026-09-17T12:00:00.000Z"
        ]);

        expect(
          matched?.sample
        ).toEqual(
          expect.objectContaining({
            price:
              15000000
          })
        );
      }
    );

    test(
      "keeps unrelated API samples as raw evidence with zero correlation instead of dropping them",
      () => {
        const facts =
          extractNetworkFacts(
            acquisition()
          );

        const unrelated =
          facts[1];

        expect(
          unrelated?.hints
            .name
        ).toBe(
          "Sony A6400"
        );

        expect(
          unrelated?.correlation
            .score
        ).toBe(0);

        expect(
          unrelated?.correlation
            .reasons
        ).toEqual([]);

        expect(
          unrelated?.sample
        ).toEqual(
          expect.objectContaining({
            id: 99,
            price:
              16000000
          })
        );
      }
    );

    test(
      "uses slug evidence when API exposes a slug without a URL",
      () => {
        const input =
          acquisition();

        input.networkSnapshot
          .apiCandidates = [
            {
              responseUrl:
                "https://example.com/api/catalog",
              method:
                "GET",
              status:
                200,
              contentType:
                "application/json",
              path:
                "$.items",
              itemCount:
                2,
              score:
                75,
              commonKeys: [
                "id",
                "name",
                "slug"
              ],
              signalKeys: [
                "id",
                "name",
                "slug"
              ],
              sample: [
                {
                  id: 7,
                  name:
                    "Canon R50",
                  slug:
                    "canon-r50"
                }
              ],
              seenCount:
                1
            }
          ];

        const facts =
          extractNetworkFacts(
            input
          );

        expect(
          facts[0]
            ?.correlation
            .reasons
        ).toContain(
          "SLUG_MATCH"
        );

        expect(
          facts[0]
            ?.correlation
            .score
        ).toBe(45);
      }
    );

    test(
      "retains candidate provenance even when classifier sample is empty",
      () => {
        const input =
          acquisition({
            requestedUrl:
              "https://example.com/api/products/42",
            finalUrl:
              "https://example.com/api/products/42",
            canonicalUrl:
              "https://example.com/api/products/42"
          });

        input.networkSnapshot
          .apiCandidates[0] = {
            responseUrl:
              "https://example.com/api/products/42",
            method:
              "GET",
            status:
              200,
            contentType:
              "application/json",
            path:
              "$.data",
            itemCount:
              12,
            score:
              80,
            commonKeys: [
              "id",
              "name",
              "price"
            ],
            signalKeys: [
              "id",
              "name",
              "price"
            ],
            sample: [],
            seenCount:
              3
          };

        const facts =
          extractNetworkFacts(
            input
          );

        expect(
          facts
        ).toHaveLength(1);

        expect(
          facts[0]
            ?.sample
        ).toBeNull();

        expect(
          facts[0]
            ?.sampleIndex
        ).toBeNull();

        expect(
          facts[0]
            ?.seenCount
        ).toBe(3);

        expect(
          facts[0]
            ?.correlation
            .reasons
        ).toContain(
          "RESPONSE_URL_MATCH"
        );

        expect(
          facts[0]
            ?.responseTimestamps
        ).toEqual([
          "2026-09-17T12:00:00.000Z"
        ]);
      }
    );

    test(
      "does not mutate stored API candidate arrays",
      () => {
        const input =
          acquisition();

        const candidate =
          input.networkSnapshot
            .apiCandidates[0];

        const facts =
          extractNetworkFacts(
            input
          );

        facts[0]
          ?.signalKeys
          .push(
            "mutated"
          );

        expect(
          candidate
            ?.signalKeys
        ).not.toContain(
          "mutated"
        );

        if (
          facts[0]
            ?.sample
        ) {
          facts[0].sample[
            "name"
          ] =
            "Changed";
        }

        expect(
          candidate
            ?.sample[0]
            ?.name
        ).toBe(
          "Canon R50"
        );
      }
    );
  }
);