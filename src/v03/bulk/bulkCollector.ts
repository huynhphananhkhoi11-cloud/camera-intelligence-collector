import {
  preserveUniqueObservations
} from "../contracts/observationContract.js";

import {
  MultiSourceDiscoveryHub
} from "../discovery/multiSourceDiscoveryHub.js";

import type {
  MultiSourceDiscoveryHubOptions
} from "../discovery/multiSourceDiscoveryHub.js";

import {
  resolveProductIdentities
} from "../identity/identityClusterer.js";

import type {
  ProductIdentityRecord
} from "../identity/productIdentityTypes.js";

import {
  ObservationAcquirer
} from "../observations/observationAcquirer.js";

import type {
  ObservationAcquirerOptions
} from "../observations/observationAcquirer.js";

import type {
  ObservationCollectionResult,
  ProductObservation
} from "../observations/observationTypes.js";

import {
  routeEntityFromObservations
} from "../entities/entityRouting.js";

import {
  qualifyProductDetailPage
} from "../entities/productPageQualification.js";

import type {
  BulkCollectionResult,
  BulkProductRecord,
  DetailCollectionFailure,
  SkippedCandidatePage
} from "./bulkTypes.js";


export interface BulkCollectorOptions {
  readonly discovery?:
    MultiSourceDiscoveryHubOptions;

  readonly observation?:
    ObservationAcquirerOptions;

  readonly concurrency?:
    number;

  readonly maxProducts?:
    number;
}


const DEFAULT_CONCURRENCY =
  3;


const DEFAULT_MAX_PRODUCTS =
  5_000;


function positiveInteger(
  value:
    number,
  name:
    string
): number {

  if (
    !Number.isInteger(
      value
    ) ||
    value <=
      0
  ) {
    throw new Error(
      name +
      " must be a positive integer."
    );
  }


  return value;
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


function errorMessage(
  error:
    unknown
): string {

  return error instanceof
    Error
    ? error.message
    : String(
        error
      );
}


export class BulkCollector {
  private readonly discovery:
    MultiSourceDiscoveryHub;


  private readonly observation:
    ObservationAcquirer;


  private readonly concurrency:
    number;


  private readonly maxProducts:
    number;


  constructor(
    options:
      BulkCollectorOptions = {}
  ) {

    this.discovery =
      new MultiSourceDiscoveryHub(
        options.discovery
      );


    this.observation =
      new ObservationAcquirer(
        options.observation
      );


    this.concurrency =
      positiveInteger(
        options.concurrency ??
        DEFAULT_CONCURRENCY,
        "concurrency"
      );


    this.maxProducts =
      positiveInteger(
        options.maxProducts ??
        DEFAULT_MAX_PRODUCTS,
        "maxProducts"
      );
  }


  async collect(
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      BulkCollectionResult
    > {

    const discovery =
      await this.discovery.discover(
        rootUrl,
        signal
      );


    const candidateUrls =
      uniqueInOrder(
        discovery.allDiscoveredUrls
      );


    const attemptedUrls =
      candidateUrls.slice(
        0,
        this.maxProducts
      );


    const detailResults:
      Array<
        ObservationCollectionResult |
        null
      > =
        Array.from(
          {
            length:
              attemptedUrls.length
          },
          () =>
            null
        );


    const errors:
      DetailCollectionFailure[] =
        [];


    let nextIndex =
      0;


    const worker =
      async () => {

        while (
          true
        ) {

          if (
            signal?.aborted
          ) {
            throw new Error(
              "Bulk collection aborted."
            );
          }


          const index =
            nextIndex++;


          if (
            index >=
              attemptedUrls.length
          ) {
            return;
          }


          const url =
            attemptedUrls[
              index
            ]!;


          try {

            detailResults[
              index
            ] =
              await this.observation.acquire(
                url,
                signal
              );
          }
          catch (
            error
          ) {

            errors.push({
              url,
              message:
                errorMessage(
                  error
                )
            });
          }
        }
      };


    const workerCount =
      Math.min(
        this.concurrency,
        attemptedUrls.length
      );


    await Promise.all(
      Array.from(
        {
          length:
            workerCount
        },
        () =>
          worker()
      )
    );


    const successful =
      detailResults.filter(
        (
          result
        ): result is
          ObservationCollectionResult =>
            result !==
            null
      );


    const skippedPages:
      SkippedCandidatePage[] =
        [];


    const qualifiedDetails:
      ObservationCollectionResult[] =
        [];


    for (
      const result
      of qualifiedDetails
    ) {

      const qualification =
        qualifyProductDetailPage(
          result
        );


      if (
        qualification.isProductDetail
      ) {
        qualifiedDetails.push(
          result
        );
      }
      else {
        skippedPages.push({
          url:
            result.identity.requestedUrl,

          reason:
            qualification.reasons.join(
              ", "
            )
        });
      }
    }


    const identityRecords:
      ProductIdentityRecord[] =
        qualifiedDetails.map(
          result =>
            result.identity
        );


    const identityResolution =
      resolveProductIdentities(
        identityRecords
      );


    const resultByRequestedUrl =
      new Map<
        string,
        ObservationCollectionResult
      >();


    for (
      const result
      of successful
    ) {
      resultByRequestedUrl.set(
        result.identity.requestedUrl,
        result
      );
    }


    const products:
      BulkProductRecord[] =
        [];


    for (
      const cluster
      of identityResolution.clusters
    ) {

      const merged:
        ProductObservation[] =
          [];


      for (
        const memberUrl
        of cluster.memberUrls
      ) {

        const detail =
          resultByRequestedUrl.get(
            memberUrl
          );


        if (
          !detail
        ) {
          continue;
        }


        for (
          const observation
          of detail.observations
        ) {

          merged.push({
            ...observation,
            productIdentity:
              cluster.identityId
          });
        }
      }


      const observations =
        preserveUniqueObservations(
          merged
        ) as
          ProductObservation[];


      products.push({
        identity:
          cluster,

        observations,

        entity:
          routeEntityFromObservations(
            observations
          )
      });
    }


    const cameras =
      products.filter(
        product =>
          product.entity.route ===
            "CAMERA"
      );


    const nonCameras =
      products.filter(
        product =>
          product.entity.route ===
            "NON_CAMERA"
      );


    const uncertain =
      products.filter(
        product =>
          product.entity.route ===
            "UNCERTAIN"
      );


    return {
      rootUrl,
      discovery,
      candidateUrls,
      attemptedUrls,
      identityResolution,
      products,
      cameras,
      nonCameras,
      uncertain,
      skippedPages,
      errors
    };
  }
}
