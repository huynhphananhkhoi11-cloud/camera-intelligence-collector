import test from "node:test";
import assert from "node:assert/strict";

import {
  createV16IntegrationContext
} from "../../../src/v16/integration/v16IntegrationContext.js";

import {
  createSourceRuntimePort
} from "../../../src/v16/integration/sourceRuntimePort.js";

import type {
  PageEvidenceBundle
} from "../../../src/v16/evidence/pageEvidence.js";

import type {
  SourceInspectorPage
} from "../../../src/v16/source/sourceInspector.js";

function baseEvidence(
  overrides: Partial<PageEvidenceBundle> = {}
): PageEvidenceBundle {
  return {
    requestedUrl: "https://example.test/",
    finalUrl: "https://example.test/",
    httpStatus: 200,

    rawDocumentHtml: null,
    renderedDocumentHtml: null,

    jsonLd: [],
    embeddedJson: [],

    navigationNodes: [],
    repeatingCardCandidates: [],
    breadcrumbs: [],

    identityMetadata: {
      documentTitle: null,
      h1Texts: [],
      canonicalUrl: null,
      metaTitles: []
    },

    diagnostics: {
      settleOutcome: "NETWORK_IDLE",
      malformedJsonLdCount: 0,
      malformedEmbeddedJsonCount: 0,
      rawDocumentAvailable: true,
      renderedDocumentAvailable: true,
      rawDocumentTruncated: false,
      renderedDocumentTruncated: false
    },

    ...overrides
  };
}

const dummyPage =
  {} as SourceInspectorPage;

test(
  "source runtime port keeps full DEV1 evidence in memory but checkpoints only a safe summary",
  async () => {
    const evidence = baseEvidence({
      rawDocumentHtml:
        "<html>SECRET_SENTINEL_DO_NOT_PERSIST</html>",

      jsonLd: [
        {
          sourceKind: "RAW_DOCUMENT",
          scriptIndex: 0,
          scriptType: "application/ld+json",
          scriptId: null,
          value: {
            "@type": "Product",
            name: "Camera A"
          }
        }
      ]
    });

    const context =
      createV16IntegrationContext();

    const port =
      createSourceRuntimePort({
        page: dummyPage,
        context,

        inspector: {
          async inspect() {
            return evidence;
          }
        }
      });

    const result =
      await port.inspect(
        "https://example.test/"
      );

    assert.equal(
      context.sourceEvidence,
      evidence
    );

    assert.equal(
      result.sufficientForScopeDiscovery,
      true
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
  }
);

test(
  "generic navigation alone does not suppress the bounded Fetch/XHR fallback",
  async () => {
    const evidence = baseEvidence({
      navigationNodes: [
        {
          href: "/about",
          text: "About",
          attributes: {},
          context: {
            tagName: "a",
            parentTagName: "nav",
            parentRole: "navigation",
            parentClassTokens: []
          }
        }
      ]
    });

    const context =
      createV16IntegrationContext();

    const port =
      createSourceRuntimePort({
        page: dummyPage,
        context,

        inspector: {
          async inspect() {
            return evidence;
          }
        }
      });

    const result =
      await port.inspect(
        "https://example.test/"
      );

    assert.equal(
      result.sufficientForScopeDiscovery,
      false
    );
  }
);

test(
  "structured or repeated product evidence marks source as ready for code-first scope analysis",
  async () => {
    const evidence = baseEvidence({
      repeatingCardCandidates: [
        {
          href: "/camera/a",
          text: "Camera A",
          attributes: {},
          context: {
            tagName: "a",
            parentTagName: "article",
            parentRole: null,
            parentClassTokens: [
              "product-card"
            ],
            structuralSignature:
              "article.product-card>a",
            repeatedSiblingCount: 4
          }
        }
      ]
    });

    const context =
      createV16IntegrationContext();

    const port =
      createSourceRuntimePort({
        page: dummyPage,
        context,

        inspector: {
          async inspect() {
            return evidence;
          }
        }
      });

    const result =
      await port.inspect(
        "https://example.test/"
      );

    assert.equal(
      result.sufficientForScopeDiscovery,
      true
    );
  }
);