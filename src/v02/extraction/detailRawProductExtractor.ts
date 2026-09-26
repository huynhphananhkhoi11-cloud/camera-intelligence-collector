import type {
  DetailAcquisitionResult
} from "./detailAcquisitionTypes.js";

import {
  extractNetworkFacts
} from "./networkFactExtractor.js";

import {
  extractRawProductFactsFromHtml,
  type RawProductFacts
} from "../rawProductExtractor.js";

/**
 * Build replayable RawProductFacts from a completed
 * detail-acquisition bundle.
 *
 * Acquisition remains evidence collection only:
 * this function does not resolve price, stock, entity,
 * offer type or condition.
 */
export function extractRawProductFactsFromAcquisition(
  acquisition:
    DetailAcquisitionResult
): RawProductFacts {
  const url =
    acquisition.canonicalUrl ||
    acquisition.finalUrl ||
    acquisition.requestedUrl;

  const domFacts =
    extractRawProductFactsFromHtml(
      acquisition.html,
      url
    );

  return {
    ...domFacts,

    networkFacts:
      extractNetworkFacts(
        acquisition
      )
  };
}