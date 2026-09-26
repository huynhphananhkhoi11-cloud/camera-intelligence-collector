import {
  NetworkInspector
} from "../network/networkInspector.js";

import type {
  NetworkEvidenceBundle
} from "../evidence/networkEvidence.js";

import type {
  JsonValue
} from "../runtime/checkpointStore.js";

import type {
  NetworkProbeResult,
  RuntimePorts,
  SourceProbeResult
} from "../runtime/codeFirstRuntime.js";

import type {
  V16IntegrationContext
} from "./v16IntegrationContext.js";

import type {
  Page
} from "playwright";

export interface NetworkInspectorLike {
  inspect(
    page: Page
  ): Promise<NetworkEvidenceBundle>;
}

export interface CreateNetworkRuntimePortOptions {
  readonly page:
    Page;

  readonly context:
    V16IntegrationContext;

  readonly inspector?:
    NetworkInspectorLike;
}

function abortError(): Error {
  const error =
    new Error(
      "Network inspection aborted"
    );

  error.name =
    "AbortError";

  return error;
}

/**
 * Never checkpoint response bodies, URLs or JSON payloads here.
 *
 * Full Fetch/XHR evidence remains only in V16IntegrationContext.
 */
function createSafeNetworkSummary(
  evidence:
    NetworkEvidenceBundle
): JsonValue {
  return {
    networkSummary: {
      reloadCount:
        evidence.reloadCount,

      reloadErrorCode:
        evidence.reloadErrorCode,

      observedResponses:
        evidence.stats.observedResponses,

      capturedResponses:
        evidence.stats.capturedResponses,

      ignoredTelemetry:
        evidence.stats.ignoredTelemetry,

      ignoredBinary:
        evidence.stats.ignoredBinary,

      ignoredOversized:
        evidence.stats.ignoredOversized,

      bodyReadErrors:
        evidence.stats.bodyReadErrors,

      bodyReadTimeouts:
        evidence.stats.bodyReadTimeouts,

      parseErrors:
        evidence.stats.parseErrors,

      deduplicated:
        evidence.stats.deduplicated
    }
  };
}

export function createNetworkRuntimePort(
  options:
    CreateNetworkRuntimePortOptions
): RuntimePorts["network"] {
  const inspector =
    options.inspector ??
    new NetworkInspector();

  return {
    async inspect(
      _rootUrl:
        string,

      _source:
        SourceProbeResult,

      signal?:
        AbortSignal
    ): Promise<NetworkProbeResult> {
      if (signal?.aborted) {
        throw abortError();
      }

      const evidence =
        await inspector.inspect(
          options.page
        );

      if (signal?.aborted) {
        throw abortError();
      }

      options.context.networkEvidence =
        evidence;

      return {
        checkpointData:
          createSafeNetworkSummary(
            evidence
          )
      };
    }
  };
}