import test from "node:test";
import assert from "node:assert/strict";

import {
  createV16IntegrationContext
} from "../../../src/v16/integration/v16IntegrationContext.js";

import {
  createScopeProofRuntimePort
} from "../../../src/v16/integration/scopeProofRuntimePort.js";

import type {
  PageEvidenceBundle
} from "../../../src/v16/evidence/pageEvidence.js";

import type {
  NetworkEvidenceBundle
} from "../../../src/v16/evidence/networkEvidence.js";

import type {
  SourceProbeResult,
  NetworkProbeResult
} from "../../../src/v16/runtime/codeFirstRuntime.js";

const sourceProbe:
  SourceProbeResult = {
    sufficientForScopeDiscovery: true,
    checkpointData: {
      sourceSummary: {
        ready: true
      }
    }
  };

const networkProbe:
  NetworkProbeResult = {
    checkpointData: {
      networkSummary: {
        capturedResponses: 1
      }
    }
  };

function pageEvidence(
  overrides: Partial<PageEvidenceBundle> = {}
): PageEvidenceBundle {
  return {
    requestedUrl:
      "https://example.test/",

    finalUrl:
      "https://example.test/",

    httpStatus:
      200,

    rawDocumentHtml:
      null,

    renderedDocumentHtml:
      null,

    jsonLd:
      [],

    embeddedJson:
      [],

    navigationNodes:
      [],

    repeatingCardCandidates:
      [],

    breadcrumbs:
      [],

    identityMetadata: {
      documentTitle:
        null,

      h1Texts:
        [],

      canonicalUrl:
        null,

      metaTitles:
        []
    },

    diagnostics: {
      settleOutcome:
        "NETWORK_IDLE",

      malformedJsonLdCount:
        0,

      malformedEmbeddedJsonCount:
        0,

      rawDocumentAvailable:
        true,

      renderedDocumentAvailable:
        true,

      rawDocumentTruncated:
        false,

      renderedDocumentTruncated:
        false
    },

    ...overrides
  };
}

function networkEvidence(
  overrides: Partial<NetworkEvidenceBundle> = {}
): NetworkEvidenceBundle {
  return {
    pageUrl:
      "https://example.test/",

    finalUrl:
      "https://example.test/",

    reloadCount:
      1,

    reloadErrorCode:
      null,

    entries:
      [],

    stats: {
      observedResponses:
        0,

      capturedResponses:
        0,

      ignoredNonFetchXhr:
        0,

      ignoredTelemetry:
        0,

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
        0
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
    },

    ...overrides
  };
}

test(
  "page navigation is adapted neutrally and DEV3 alone proves Cameras as camera scope",
  async () => {
    const context =
      createV16IntegrationContext();

    context.sourceEvidence =
      pageEvidence({
        navigationNodes: [
          {
            href:
              "/collections/cameras",

            text:
              "Cameras",

            attributes:
              {},

            context: {
              tagName:
                "a",

              parentTagName:
                "nav",

              parentRole:
                "navigation",

              parentClassTokens:
                []
            }
          },

          {
            href:
              "/about",

            text:
              "About",

            attributes:
              {},

            context: {
              tagName:
                "a",

              parentTagName:
                "nav",

              parentRole:
                "navigation",

              parentClassTokens:
                []
            }
          }
        ]
      });

    const prove =
      createScopeProofRuntimePort({
        context
      });

    const result =
      await prove(
        {
          rootUrl:
            "https://example.test/",

          source:
            sourceProbe,

          network:
            null
        }
      );

    assert.equal(
      result.kind,
      "PROVEN"
    );

    assert.ok(
      context.cameraScope
    );

    assert.equal(
      context.cameraScope!
        .collections.length,
      1
    );

    assert.match(
      context.cameraScope!
        .collections[0]!
        .proof.terminalLabel,
      /camera/i
    );

    const persisted =
      JSON.stringify(
        result.checkpointData
      );

    assert.equal(
      persisted.includes("About"),
      false
    );
  }
);

test(
  "generic page evidence remains ambiguous instead of widening to the whole site",
  async () => {
    const context =
      createV16IntegrationContext();

    context.sourceEvidence =
      pageEvidence({
        navigationNodes: [
          {
            href:
              "/about",

            text:
              "About",

            attributes:
              {},

            context: {
              tagName:
                "a",

              parentTagName:
                "nav",

              parentRole:
                "navigation",

              parentClassTokens:
                []
            }
          },

          {
            href:
              "/news",

            text:
              "News",

            attributes:
              {},

            context: {
              tagName:
                "a",

              parentTagName:
                "nav",

              parentRole:
                "navigation",

              parentClassTokens:
                []
            }
          }
        ]
      });

    const prove =
      createScopeProofRuntimePort({
        context
      });

    const result =
      await prove(
        {
          rootUrl:
            "https://example.test/",

          source:
            sourceProbe,

          network:
            null
        }
      );

    assert.equal(
      result.kind,
      "NEEDS_LEGACY_SCOPE_FALLBACK"
    );

    assert.equal(
      context.cameraScope,
      null
    );
  }
);

test(
  "sanitized network JSON collection evidence can prove camera scope without retailer-specific rules",
  async () => {
    const context =
      createV16IntegrationContext();

    context.sourceEvidence =
      pageEvidence();

    context.networkEvidence =
      networkEvidence({
        entries: [
          {
            responseUrl:
              "https://example.test/api/catalog",

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
                collections: [
                  {
                    name:
                      "Cameras",

                    url:
                      "/collections/cameras"
                  },

                  {
                    name:
                      "Accessories",

                    url:
                      "/collections/accessories"
                  }
                ]
              },

              topLevelKeys: [
                "collections"
              ],

              arrayLength:
                null
            },

            bodyBytes:
              100,

            bodySha256:
              "network-camera-test",

            priority:
              "high",

            duplicateCount:
              0
          }
        ]
      });

    const prove =
      createScopeProofRuntimePort({
        context
      });

    const result =
      await prove(
        {
          rootUrl:
            "https://example.test/",

          source:
            sourceProbe,

          network:
            networkProbe
        }
      );

    assert.equal(
      result.kind,
      "PROVEN"
    );

    assert.ok(
      context.cameraScope
    );

    assert.equal(
      context.cameraScope!
        .collections.length,
      1
    );

    assert.equal(
      context.cameraScope!
        .collections[0]!
        .sourceKind,
      "NETWORK_COLLECTION"
    );
  }
);

test(
  "breadcrumb path is preserved as taxonomy evidence for the current listing",
  async () => {
    const context =
      createV16IntegrationContext();

    context.sourceEvidence =
      pageEvidence({
        finalUrl:
          "https://example.test/cameras",

        breadcrumbs: [
          {
            href:
              "/",

            text:
              "Home",

            position:
              1,

            attributes:
              {}
          },

          {
            href:
              "/cameras",

            text:
              "Cameras",

            position:
              2,

            attributes:
              {}
          }
        ]
      });

    const prove =
      createScopeProofRuntimePort({
        context
      });

    const result =
      await prove(
        {
          rootUrl:
            "https://example.test/cameras",

          source:
            sourceProbe,

          network:
            null
        }
      );

    assert.equal(
      result.kind,
      "PROVEN"
    );

    assert.deepEqual(
      context.cameraScope!
        .collections[0]!
        .proof.taxonomyPath,
      [
        "Home",
        "Cameras"
      ]
    );
  }
);