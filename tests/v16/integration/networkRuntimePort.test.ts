import test from "node:test";
import assert from "node:assert/strict";

import {
  createV16IntegrationContext
} from "../../../src/v16/integration/v16IntegrationContext.js";

import {
  createNetworkRuntimePort
} from "../../../src/v16/integration/networkRuntimePort.js";

import type {
  NetworkEvidenceBundle
} from "../../../src/v16/evidence/networkEvidence.js";

import type {
  SourceProbeResult
} from "../../../src/v16/runtime/codeFirstRuntime.js";

import type {
  Page
} from "playwright";

const dummyPage =
  {} as Page;

const sourceProbe:
  SourceProbeResult = {
    sufficientForScopeDiscovery:
      false,

    checkpointData: {
      sourceSummary: {
        repeatingCardCount: 0
      }
    }
  };

function networkEvidence():
  NetworkEvidenceBundle {
  return {
    pageUrl:
      "https://example.test/",

    finalUrl:
      "https://example.test/",

    reloadCount:
      1,

    reloadErrorCode:
      null,

    entries: [
      {
        responseUrl:
          "https://example.test/api/products",

        requestMethod:
          "GET",

        status:
          200,

        contentType:
          "application/json",

        resourceType:
          "xhr",

        contextUrl:
          "https://example.test/",

        body: {
          kind:
            "json",

          value: {
            secretPayload:
              "SECRET_SENTINEL_DO_NOT_PERSIST",

            products: [
              {
                name:
                  "Camera A"
              }
            ]
          },

          topLevelKeys: [
            "secretPayload",
            "products"
          ],

          arrayLength:
            null
        },

        bodyBytes:
          128,

        bodySha256:
          "0123456789abcdef",

        priority:
          "high",

        duplicateCount:
          0
      }
    ],

    stats: {
      observedResponses:
        4,

      capturedResponses:
        1,

      ignoredNonFetchXhr:
        1,

      ignoredTelemetry:
        1,

      ignoredBinary:
        0,

      ignoredOversized:
        0,

      ignoredObservationCap:
        0,

      ignoredCaptureCap:
        0,

      bodyReadErrors:
        0,

      bodyReadTimeouts:
        0,

      parseErrors:
        0,

      deduplicated:
        1
    },

    limits: {
      maxObservedResponses:
        96,

      maxCapturedResponses:
        32,

      maxBodyBytes:
        524288,

      maxTextBytes:
        131072,

      maxTotalBodyBytes:
        4194304,

      inspectionTimeoutMs:
        12000,

      reloadTimeoutMs:
        8000,

      observationWindowMs:
        1500,

      perResponseTimeoutMs:
        2000
    }
  };
}

test(
  "network runtime port stores full DEV2 evidence only in memory and checkpoints a bounded summary",
  async () => {
    const evidence =
      networkEvidence();

    const context =
      createV16IntegrationContext();

    let calls = 0;

    const port =
      createNetworkRuntimePort({
        page:
          dummyPage,

        context,

        inspector: {
          async inspect(page) {
            calls += 1;

            assert.equal(
              page,
              dummyPage
            );

            return evidence;
          }
        }
      });

    const result =
      await port.inspect(
        "https://example.test/",
        sourceProbe
      );

    assert.equal(
      calls,
      1
    );

    assert.equal(
      context.networkEvidence,
      evidence
    );

    const persisted =
      JSON.stringify(
        result.checkpointData
      );

    assert.equal(
      persisted.includes(
        "SECRET_SENTINEL_DO_NOT_PERSIST"
      ),
      false
    );

    assert.equal(
      persisted.includes(
        "Camera A"
      ),
      false
    );

    assert.deepEqual(
      result.checkpointData,
      {
        networkSummary: {
          reloadCount: 1,
          reloadErrorCode: null,
          observedResponses: 4,
          capturedResponses: 1,
          ignoredTelemetry: 1,
          ignoredBinary: 0,
          ignoredOversized: 0,
          bodyReadErrors: 0,
          bodyReadTimeouts: 0,
          parseErrors: 0,
          deduplicated: 1
        }
      }
    );
  }
);

test(
  "network runtime port honors an already-aborted signal without invoking DEV2",
  async () => {
    const context =
      createV16IntegrationContext();

    let calls = 0;

    const port =
      createNetworkRuntimePort({
        page:
          dummyPage,

        context,

        inspector: {
          async inspect() {
            calls += 1;
            return networkEvidence();
          }
        }
      });

    const controller =
      new AbortController();

    controller.abort();

    await assert.rejects(
      () =>
        port.inspect(
          "https://example.test/",
          sourceProbe,
          controller.signal
        ),

      error =>
        error instanceof Error &&
        error.name === "AbortError"
    );

    assert.equal(
      calls,
      0
    );

    assert.equal(
      context.networkEvidence,
      null
    );
  }
);