import {
  SourceInspector
} from "../source/sourceInspector.js";

import type {
  SourceInspectorInput,
  SourceInspectorPage
} from "../source/sourceInspector.js";

import type {
  PageEvidenceBundle
} from "../evidence/pageEvidence.js";

import type {
  JsonValue
} from "../runtime/checkpointStore.js";

import type {
  RuntimePorts,
  SourceProbeResult
} from "../runtime/codeFirstRuntime.js";

import type {
  V16IntegrationContext
} from "./v16IntegrationContext.js";

export interface SourceInspectorLike {
  inspect(
    input: SourceInspectorInput
  ): Promise<PageEvidenceBundle>;
}

export interface CreateSourceRuntimePortOptions {
  readonly page:
    SourceInspectorPage;

  readonly context:
    V16IntegrationContext;

  readonly inspector?:
    SourceInspectorLike;
}

function abortError(): Error {
  const error =
    new Error(
      "Source inspection aborted"
    );

  error.name =
    "AbortError";

  return error;
}

function hasCodeFirstStructuralEvidence(
  evidence:
    PageEvidenceBundle
): boolean {
  return (
    evidence.jsonLd.length > 0 ||
    evidence.embeddedJson.length > 0 ||
    evidence.repeatingCardCandidates.length > 0
  );
}

/**
 * Only bounded structural counts/diagnostics are persisted.
 *
 * Raw HTML, rendered HTML and structured payload values remain
 * in the in-memory V16IntegrationContext and are never copied
 * into checkpointData here.
 */
function createSafeCheckpointSummary(
  evidence:
    PageEvidenceBundle
): JsonValue {
  return {
    sourceSummary: {
      httpStatus:
        evidence.httpStatus,

      jsonLdCount:
        evidence.jsonLd.length,

      embeddedJsonCount:
        evidence.embeddedJson.length,

      navigationNodeCount:
        evidence.navigationNodes.length,

      repeatingCardCount:
        evidence.repeatingCardCandidates.length,

      breadcrumbCount:
        evidence.breadcrumbs.length,

      settleOutcome:
        evidence.diagnostics.settleOutcome,

      malformedJsonLdCount:
        evidence.diagnostics
          .malformedJsonLdCount,

      malformedEmbeddedJsonCount:
        evidence.diagnostics
          .malformedEmbeddedJsonCount,

      rawDocumentAvailable:
        evidence.diagnostics
          .rawDocumentAvailable,

      renderedDocumentAvailable:
        evidence.diagnostics
          .renderedDocumentAvailable,

      rawDocumentTruncated:
        evidence.diagnostics
          .rawDocumentTruncated,

      renderedDocumentTruncated:
        evidence.diagnostics
          .renderedDocumentTruncated
    }
  };
}

export function createSourceRuntimePort(
  options:
    CreateSourceRuntimePortOptions
): RuntimePorts["source"] {
  const inspector =
    options.inspector ??
    new SourceInspector({
      documentRetention:
        "drop-after-extraction"
    });

  return {
    async inspect(
      rootUrl:
        string,

      signal?:
        AbortSignal
    ): Promise<SourceProbeResult> {
      if (signal?.aborted) {
        throw abortError();
      }

      const evidence =
        await inspector.inspect({
          page:
            options.page,

          requestedUrl:
            rootUrl
        });

      if (signal?.aborted) {
        throw abortError();
      }

      options.context.sourceEvidence =
        evidence;

      return {
        sufficientForScopeDiscovery:
          hasCodeFirstStructuralEvidence(
            evidence
          ),

        checkpointData:
          createSafeCheckpointSummary(
            evidence
          )
      };
    }
  };
}