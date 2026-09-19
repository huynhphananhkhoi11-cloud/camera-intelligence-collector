import {
  AcquisitionRouter
} from "./acquisitionRouter.js";

import {
  StaticHttpBackend
} from "./staticHttpBackend.js";

import type {
  StaticHttpBackendOptions
} from "./staticHttpBackend.js";


export interface DefaultAcquisitionRouterOptions {
  readonly staticHttp?:
    StaticHttpBackendOptions;
}


export function createDefaultAcquisitionRouter(
  options:
    DefaultAcquisitionRouterOptions = {}
): AcquisitionRouter {

  return new AcquisitionRouter([
    new StaticHttpBackend(
      options.staticHttp
    )
  ]);
}
