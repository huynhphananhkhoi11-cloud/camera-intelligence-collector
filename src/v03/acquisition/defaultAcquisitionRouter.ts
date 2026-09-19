import {
  AcquisitionRouter
} from "./acquisitionRouter.js";

import {
  NetworkReconBackend
} from "./networkReconBackend.js";

import type {
  NetworkReconBackendOptions
} from "./networkReconTypes.js";

import {
  StaticHttpBackend
} from "./staticHttpBackend.js";

import type {
  StaticHttpBackendOptions
} from "./staticHttpBackend.js";


export interface DefaultAcquisitionRouterOptions {
  readonly staticHttp?:
    StaticHttpBackendOptions;

  readonly networkRecon?:
    NetworkReconBackendOptions;
}


export function createDefaultAcquisitionRouter(
  options:
    DefaultAcquisitionRouterOptions = {}
): AcquisitionRouter {

  return new AcquisitionRouter([
    new StaticHttpBackend(
      options.staticHttp
    ),

    new NetworkReconBackend(
      options.networkRecon
    )
  ]);
}
