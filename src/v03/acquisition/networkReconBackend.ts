import type {
  AcquisitionArtifact,
  AcquisitionBackend,
  AcquisitionContext,
  AcquisitionProbe,
  AcquisitionResult
} from "./acquisitionTypes.js";

import {
  PlaywrightNetworkReconRuntime
} from "./playwrightNetworkReconRuntime.js";

import type {
  NetworkExchange,
  NetworkReconBackendOptions,
  NetworkReconRuntime
} from "./networkReconTypes.js";


function artifactKind(
  contentType:
    string |
    null
):
  AcquisitionArtifact["kind"] {

  if (
    contentType?.includes(
      "json"
    )
  ) {
    return "JSON";
  }


  if (
    contentType?.includes(
      "html"
    )
  ) {
    return "HTML";
  }


  return "TEXT";
}


function uniqueInOrder(
  values:
    readonly string[]
): string[] {

  return [
    ...new Set(
      values
    )
  ];
}


function toArtifact(
  exchange:
    NetworkExchange
): AcquisitionArtifact |
  null {

  if (
    exchange.responseBodyPreview ===
      null
  ) {
    return null;
  }


  return {
    backendId:
      "NETWORK_RECON",

    kind:
      artifactKind(
        exchange.responseContentType
      ),

    url:
      exchange.url,

    status:
      exchange.status ??
      undefined,

    contentType:
      exchange.responseContentType,

    body:
      exchange.responseBodyPreview,

    metadata: {
      sequence:
        exchange.sequence,

      method:
        exchange.method,

      resourceType:
        exchange.resourceType,

      requestContentType:
        exchange.requestContentType,

      requestBody:
        exchange.requestBodyRedacted,

      responseBodyTruncated:
        exchange.responseBodyTruncated
    }
  };
}


export class NetworkReconBackend
implements AcquisitionBackend {

  readonly id =
    "NETWORK_RECON" as const;


  private readonly runtime:
    NetworkReconRuntime;


  constructor(
    options:
      NetworkReconBackendOptions = {}
  ) {

    this.runtime =
      options.runtime ??
      new PlaywrightNetworkReconRuntime();
  }


  async probe(
    context:
      AcquisitionContext
  ):
    Promise<
      AcquisitionProbe
    > {

    const health =
      await this.runtime.probe(
        context.signal
      );


    return {
      backendId:
        this.id,

      status:
        health.available
          ? "AVAILABLE"
          : "UNAVAILABLE",

      reason:
        health.reason
    };
  }


  async acquire(
    context:
      AcquisitionContext
  ):
    Promise<
      AcquisitionResult
    > {

    const snapshot =
      await this.runtime.observe(
        context.rootUrl,
        context.signal
      );


    const warnings:
      string[] =
        [];


    const failedCount =
      snapshot.exchanges.filter(
        exchange =>
          exchange.failed
      ).length;


    const truncatedCount =
      snapshot.exchanges.filter(
        exchange =>
          exchange.responseBodyTruncated
      ).length;


    if (
      failedCount >
        0
    ) {
      warnings.push(
        failedCount +
        " same-origin XHR/fetch request(s) failed during reconnaissance."
      );
    }


    if (
      truncatedCount >
        0
    ) {
      warnings.push(
        truncatedCount +
        " response preview(s) were truncated."
      );
    }


    const artifacts =
      snapshot.exchanges
        .map(
          exchange =>
            toArtifact(
              exchange
            )
        )
        .filter(
          (
            artifact
          ): artifact is
            AcquisitionArtifact =>
              artifact !==
              null
        );


    return {
      backendId:
        this.id,

      artifacts,

      discoveredUrls:
        uniqueInOrder(
          snapshot.exchanges.map(
            exchange =>
              exchange.url
          )
        ),

      warnings,

      complete:
        true
    };
  }
}
