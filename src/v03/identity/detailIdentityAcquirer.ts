import {
  createAcquisitionContext
} from "../acquisition/acquisitionContext.js";

import {
  StaticHttpBackend
} from "../acquisition/staticHttpBackend.js";

import type {
  StaticHttpBackendOptions
} from "../acquisition/staticHttpBackend.js";

import {
  extractDetailIdentitySignals
} from "./detailIdentityExtractor.js";

import {
  createProductIdentityRecord
} from "./identityClusterer.js";

import type {
  ProductIdentityRecord
} from "./productIdentityTypes.js";


export interface DetailIdentityAcquirerOptions {
  readonly staticHttp?:
    StaticHttpBackendOptions;
}


export class DetailIdentityAcquirer {
  private readonly backend:
    StaticHttpBackend;


  constructor(
    options:
      DetailIdentityAcquirerOptions = {}
  ) {

    this.backend =
      new StaticHttpBackend(
        options.staticHttp
      );
  }


  async acquire(
    url:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      ProductIdentityRecord
    > {

    const context =
      createAcquisitionContext(
        url,
        signal
      );


    const probe =
      await this.backend.probe(
        context
      );


    if (
      probe.status !==
        "AVAILABLE"
    ) {
      throw new Error(
        "Detail identity acquisition unavailable: " +
        probe.reason
      );
    }


    const result =
      await this.backend.acquire(
        context
      );


    const htmlArtifact =
      result.artifacts.find(
        artifact =>
          artifact.kind ===
            "HTML" &&
          artifact.body !==
            null &&
          artifact.body !==
            undefined
      );


    if (
      !htmlArtifact?.body
    ) {
      throw new Error(
        "Detail identity acquisition produced no HTML artifact."
      );
    }


    return createProductIdentityRecord(
      extractDetailIdentitySignals(
        htmlArtifact.body,
        context.rootUrl,
        htmlArtifact.url
      )
    );
  }


  async acquireMany(
    urls:
      readonly string[],
    signal?:
      AbortSignal
  ):
    Promise<
      ProductIdentityRecord[]
    > {

    const records:
      ProductIdentityRecord[] =
        [];


    for (
      const url
      of urls
    ) {
      records.push(
        await this.acquire(
          url,
          signal
        )
      );
    }


    return records;
  }
}
