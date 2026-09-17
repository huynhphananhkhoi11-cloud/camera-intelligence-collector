import type {
  SiteMode
} from "../../types/index.js";

import {
  detectCommercialSignals,
  type CommercialSignalEvidence
} from "./commercialSignals.js";

import {
  detectPlatform,
  type CommercePlatform,
  type PlatformEvidence
} from "./platformDetector.js";

import type {
  NetworkObserverSnapshot
} from "../network/networkObserver.js";


export type SiteProfileConfidence =
  | "LOW"
  | "MEDIUM"
  | "HIGH";


export interface SiteProfile {
  url: string;

  rentalScore:
    number;

  saleScore:
    number;

  newScore:
    number;

  usedScore:
    number;

  suggestedSiteMode:
    SiteMode;

  confidence:
    SiteProfileConfidence;

  platform:
    CommercePlatform;

  commercialEvidence:
    CommercialSignalEvidence[];

  platformEvidence:
    PlatformEvidence[];

  network: {
    requestCount:
      number;

    responseCount:
      number;

    failedRequestCount:
      number;

    apiCandidateCount:
      number;
  };
}


export interface ProfileSiteInput {
  url: string;

  html: string;

  network?:
    NetworkObserverSnapshot;
}


function inferMode(
  rentalScore: number,
  saleScore: number,
  newScore: number,
  usedScore: number
): SiteMode {

  const rentalStrong =
    rentalScore >=
    25;

  const saleStrong =
    saleScore >=
    25;


  if (
    rentalStrong &&
    saleStrong
  ) {
    return "MIXED";
  }


  if (
    rentalStrong
  ) {
    return "RENTAL";
  }


  if (
    saleStrong
  ) {

    const newStrong =
      newScore >=
      10;

    const usedStrong =
      usedScore >=
      10;


    if (
      newStrong &&
      usedStrong
    ) {
      return "SALE_MIXED";
    }


    if (
      usedStrong
    ) {
      return "SALE_SECOND_HAND";
    }


    if (
      newStrong
    ) {
      return "SALE_NEW";
    }


    /*
     * Site says "sale", but condition mix
     * is not established at site level.
     */
    return "SALE_MIXED";
  }


  return "UNKNOWN";
}


function inferConfidence(
  rentalScore: number,
  saleScore: number,
  evidenceCount: number
): SiteProfileConfidence {

  const strongest =
    Math.max(
      rentalScore,
      saleScore
    );


  if (
    strongest >=
      70 &&
    evidenceCount >=
      2
  ) {
    return "HIGH";
  }


  if (
    strongest >=
      25
  ) {
    return "MEDIUM";
  }


  return "LOW";
}


/**
 * Build a weak site-level prior.
 *
 * This output must never override product-level
 * ENTITY / OFFER / CONDITION evidence.
 */
export function profileSite(
  input:
    ProfileSiteInput
): SiteProfile {

  const commercial =
    detectCommercialSignals(
      input.html
    );


  const networkUrls =
    input.network
      ?.requests
      .map(
        request =>
          request.url
      ) ??
    [];


  const platform =
    detectPlatform(
      input.html,
      networkUrls
    );


  const suggestedSiteMode =
    inferMode(
      commercial.rentalScore,
      commercial.saleScore,
      commercial.newScore,
      commercial.usedScore
    );


  const failedRequestCount =
    input.network
      ?.outcomes
      .filter(
        outcome =>
          outcome.state ===
          "FAILED"
      )
      .length ??
    0;


  return {
    url:
      input.url,

    rentalScore:
      commercial.rentalScore,

    saleScore:
      commercial.saleScore,

    newScore:
      commercial.newScore,

    usedScore:
      commercial.usedScore,

    suggestedSiteMode,

    confidence:
      inferConfidence(
        commercial.rentalScore,
        commercial.saleScore,
        commercial.evidence.length
      ),

    platform:
      platform.platform,

    commercialEvidence:
      commercial.evidence,

    platformEvidence:
      platform.evidence,

    network: {
      requestCount:
        input.network
          ?.requests.length ??
        0,

      responseCount:
        input.network
          ?.responses.length ??
        0,

      failedRequestCount,

      apiCandidateCount:
        input.network
          ?.apiCandidates.length ??
        0
    }
  };
}