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
       * Recall-first:
       *
       * even a weak inferred pattern remains in
       * the graph with a low score. Later detail
       * acquisition/classification decides truth.
       */
      sitemapPatternCandidates +=
        1;


      graph.addCandidate(
        candidate.url,
        {
          source:
            "SITEMAP_PATTERN",

          /*
           * Sitemap provenance belongs to the
           * sitemap/pattern, not to the catalog
           * page that happened to trigger this
           * inference.
           *
           * null makes repeated ingestion of the
           * same sitemap evidence idempotent.
           */
          parentUrl:
            null,

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