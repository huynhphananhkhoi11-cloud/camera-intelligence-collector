import {
  qualifyEndpointCandidates
} from "./endpointQualification.js";

import {
  EndpointReplayEngine
} from "./endpointReplayEngine.js";

import type {
  EndpointReplayEngineOptions
} from "./endpointReplayEngine.js";

import type {
  AdaptiveEndpointDiscoveryResult
} from "./endpointReplayTypes.js";

import {
  PlaywrightNetworkReconRuntime
} from "./playwrightNetworkReconRuntime.js";

import type {
  NetworkReconRuntime
} from "./networkReconTypes.js";


export interface AdaptiveEndpointDiscoveryOptions {
  readonly networkRuntime?:
    NetworkReconRuntime;

  readonly replayEngine?:
    EndpointReplayEngine;

  readonly replay?:
    EndpointReplayEngineOptions;
}


export class AdaptiveEndpointDiscovery {
  private readonly networkRuntime:
    NetworkReconRuntime;


  private readonly replayEngine:
    EndpointReplayEngine;


  constructor(
    options:
      AdaptiveEndpointDiscoveryOptions = {}
  ) {

    this.networkRuntime =
      options.networkRuntime ??
      new PlaywrightNetworkReconRuntime();


    this.replayEngine =
      options.replayEngine ??
      new EndpointReplayEngine(
        options.replay
      );
  }


  async discover(
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      AdaptiveEndpointDiscoveryResult
    > {

    const recon =
      await this.networkRuntime.observe(
        rootUrl,
        signal
      );


    const qualification =
      qualifyEndpointCandidates(
        recon
      );


    const replay =
      await this.replayEngine.replayQualified(
        qualification,
        rootUrl,
        signal
      );


    return {
      recon,
      qualification,
      replay
    };
  }
}
