import {
  describe,
  expect,
  test
} from "vitest";

import type {
  NetworkObserverSnapshot
} from "../../../src/v02/network/networkObserver.ts";

import {
  hasNonRetriableAcquisitionError,
  hasRetriableAcquisitionError,
  isValidAcquisitionTiming,
  type DetailAcquisitionResult
} from "../../../src/v02/extraction/detailAcquisitionTypes.ts";

describe(
  "detailAcquisitionTypes",
  () => {
    test(
      "uses the existing NetworkObserverSnapshot contract",
      () => {
        const networkSnapshot:
          NetworkObserverSnapshot = {
            requests: [],
            responses: [],
            outcomes: [],
            apiCandidates: []
          };

        const result:
          DetailAcquisitionResult = {
            requestedUrl:
              "https://example.com/product/a",

            finalUrl:
              "https://example.com/product/a",

            canonicalUrl:
              "https://example.com/product/a",

            html:
              "<html><body><h1>A</h1></body></html>",

            networkSnapshot,

            interactions: [],

            timing: {
              navigationMs: 100,
              settleMs: 25,
              interactionMs: 0,
              totalMs: 125
            },

            errors: []
          };

        expect(
          result.networkSnapshot
        ).toBe(
          networkSnapshot
        );

        expect(
          hasRetriableAcquisitionError(
            result
          )
        ).toBe(false);

        expect(
          hasNonRetriableAcquisitionError(
            result
          )
        ).toBe(false);
      }
    );

    test(
      "keeps retriable technical errors explicit",
      () => {
        const result:
          Pick<
            DetailAcquisitionResult,
            "errors"
          > = {
            errors: [
              {
                stage: "NAVIGATION",
                code: "NAVIGATION_TIMEOUT",
                message:
                  "Navigation timed out",
                retriable: true,
                status: null,
                timestamp:
                  "2026-09-17T00:00:00.000Z"
              }
            ]
          };

        expect(
          hasRetriableAcquisitionError(
            result
          )
        ).toBe(true);

        expect(
          hasNonRetriableAcquisitionError(
            result
          )
        ).toBe(false);
      }
    );

    test(
      "distinguishes non-retriable technical errors",
      () => {
        const result:
          Pick<
            DetailAcquisitionResult,
            "errors"
          > = {
            errors: [
              {
                stage: "NAVIGATION",
                code: "HTTP_NOT_FOUND",
                message:
                  "Product page returned 404",
                retriable: false,
                status: 404,
                timestamp:
                  "2026-09-17T00:00:00.000Z"
              }
            ]
          };

        expect(
          hasNonRetriableAcquisitionError(
            result
          )
        ).toBe(true);
      }
    );

    test(
      "accepts only finite non-negative timing values",
      () => {
        expect(
          isValidAcquisitionTiming({
            navigationMs: 100,
            settleMs: 20,
            interactionMs: 5,
            totalMs: 125
          })
        ).toBe(true);

        expect(
          isValidAcquisitionTiming({
            navigationMs: -1,
            settleMs: 20,
            interactionMs: 5,
            totalMs: 24
          })
        ).toBe(false);

        expect(
          isValidAcquisitionTiming({
            navigationMs: 1,
            settleMs: Number.NaN,
            interactionMs: 0,
            totalMs: 1
          })
        ).toBe(false);
      }
    );
  }
);