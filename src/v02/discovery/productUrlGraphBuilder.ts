import {
  extractApiProductLinks,
  extractListingProductLinks,
  type NetworkSnapshotLike
} from "./listingProductDiscovery.js";

import {
  ProductUrlGraph
} from "./productUrlGraph.js";

import {
  inferProductUrlPatterns,
  scoreSitemapProductCandidates
} from "./productUrlPattern.js";


export interface CatalogSnapshotInput {
  pageUrl:
    string;

  html:
    string;

  network?:
    NetworkSnapshotLike;

  sitemapUrls?:
    readonly string[];
}


export interface CatalogSnapshotDiagnostics {
  listingLinks:
    number;

  apiLinks:
    number;

  paginationUrls:
    string[];

  sitemapPatternCandidates:
    number;

  graphSizeBefore:
    number;

  graphSizeAfter:
    number;
}


export function ingestCatalogSnapshot(
  graph:
    ProductUrlGraph,
  input:
    CatalogSnapshotInput,
  canonicalOrigin:
    string
): CatalogSnapshotDiagnostics {

  const before =
    graph.size;


  const listing =
    extractListingProductLinks(
      input.html,
      input.pageUrl
    );


  for (
    const candidate
    of listing.productLinks
  ) {

    graph.addCandidate(
      candidate.url,
      {
        source:
          candidate.source,

        parentUrl:
          input.pageUrl,

        weight:
          candidate.weight,

        detail:
          candidate.detail,

        productId:
          candidate.productId
      }
    );
  }


  const apiLinks =
    input.network
      ? extractApiProductLinks(
          input.network,
          input.pageUrl
        )
      : [];


  for (
    const candidate
    of apiLinks
  ) {

    graph.addCandidate(
      candidate.url,
      {
        source:
          candidate.source,

        parentUrl:
          input.pageUrl,

        weight:
          candidate.weight,

        detail:
          candidate.detail,

        productId:
          candidate.productId
      }
    );
  }


  let sitemapPatternCandidates =
    0;


  if (
    input.sitemapUrls &&
    input.sitemapUrls.length >
      0
  ) {

    const patterns =
      inferProductUrlPatterns(
        graph.values()
      );


    const sitemapCandidates =
      scoreSitemapProductCandidates(
        input.sitemapUrls,
        patterns,
        canonicalOrigin
      );


    for (
      const candidate
      of sitemapCandidates
    ) {

      /*
       * Broad root-level slug pattern has score 15.
       * Keep it diagnostic only.
       *
       * More specific inferred patterns enter graph.
       */
      if (
        candidate.score <
        20
      ) {
        continue;
      }


      sitemapPatternCandidates +=
        1;


      graph.addCandidate(
        candidate.url,
        {
          source:
            "SITEMAP_PATTERN",

          parentUrl:
            input.pageUrl,

          weight:
            candidate.score,

          detail:
            `${candidate.pattern.prefix} ${candidate.pattern.tailKind}`
        }
      );
    }
  }


  return {
    listingLinks:
      listing.productLinks.length,

    apiLinks:
      apiLinks.length,

    paginationUrls:
      listing.paginationUrls,

    sitemapPatternCandidates,

    graphSizeBefore:
      before,

    graphSizeAfter:
      graph.size
  };
}