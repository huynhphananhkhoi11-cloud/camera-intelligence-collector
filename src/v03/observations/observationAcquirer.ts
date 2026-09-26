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
  collectProductObservationsFromHtml
} from "./observationCollector.js";

import type {
  ObservationCollectionResult
} from "./observationTypes.js";


export interface ObservationAcquirerOptions {
  readonly staticHttp?:
    StaticHttpBackendOptions;
}


export class ObservationAcquirer {
  private readonly backend:
    StaticHttpBackend;


  constructor(
    options:
      ObservationAcquirerOptions = {}
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
      ObservationCollectionResult
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
        "Observation acquisition unavailable: " +
        probe.reason
      );
    }


    const result =
      await this.backend.acquire(
        context
      );


    const html =
      result.artifacts.find(
        artifact =>
          artifact.kind ===
            "HTML" &&
          typeof artifact.body ===
            "string"
      );


    if (
      !html?.body
    ) {
      throw new Error(
        "Observation acquisition produced no HTML artifact."
      );
    }


    return collectProductObservationsFromHtml(
      html.body,
      context.rootUrl,
      html.url
    );
  }
}
