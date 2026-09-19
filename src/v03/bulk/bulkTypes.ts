import type {
  MultiSourceDiscoveryResult
} from "../discovery/multiSourceDiscoveryTypes.js";

import type {
  EntityRoutingResult
} from "../entities/entityRouting.js";

import type {
  ProductIdentityCluster,
  ProductIdentityResolution
} from "../identity/productIdentityTypes.js";

import type {
  ProductObservation
} from "../observations/observationTypes.js";


export interface DetailCollectionFailure {
  readonly url:
    string;

  readonly message:
    string;
}


export interface BulkProductRecord {
  readonly identity:
    ProductIdentityCluster;

  readonly observations:
    readonly ProductObservation[];

  readonly entity:
    EntityRoutingResult;
}


export interface BulkCollectionResult {
  readonly rootUrl:
    string;

  readonly discovery:
    MultiSourceDiscoveryResult;

  readonly candidateUrls:
    readonly string[];

  readonly attemptedUrls:
    readonly string[];

  readonly identityResolution:
    ProductIdentityResolution;

  readonly products:
    readonly BulkProductRecord[];

  readonly cameras:
    readonly BulkProductRecord[];

  readonly nonCameras:
    readonly BulkProductRecord[];

  readonly uncertain:
    readonly BulkProductRecord[];

  readonly errors:
    readonly DetailCollectionFailure[];
}
