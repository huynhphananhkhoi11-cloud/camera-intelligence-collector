import type {
  SiteBootstrapResult
} from "../discovery/siteBootstrapper.js";

import type {
  SiteProfile
} from "../profiling/siteProfiler.js";

import type {
  CommercialRootDiscoveryResult
} from "../discovery/commercialRootDiscovery.js";

import type {
  LiveProductUrlGraphResult
} from "../discovery/liveProductUrlGraph.js";

import type {
  ProductUrlEvidenceSource
} from "../discovery/productUrlGraph.js";


export interface DiscoveryStageTimings {
  bootstrapMs: number;
  profileMs: number;
  rootDiscoveryMs: number;
  productGraphMs: number;
}


export interface DiscoveryBudgets {
  rootProbeLimit: number;
  minimumRootScore: number;

  maxGraphRoots: number;
  maxPagesPerRoot: number;
  maxInteractionsPerPage: number;
  noNewUrlRounds: number;
}


export interface DiscoveryTelemetryInput {
  bootstrap:
    SiteBootstrapResult;

  profile:
    SiteProfile;

  roots:
    CommercialRootDiscoveryResult;

  graph:
    LiveProductUrlGraphResult;

  timingsMs?:
    DiscoveryStageTimings;

  budgets?:
    DiscoveryBudgets;
}


export interface EvidenceSourceTelemetry {
  source:
    ProductUrlEvidenceSource;

  evidenceCount:
    number;

  nodeCount:
    number;
}


export interface DiscoveryTelemetry {
  schemaVersion:
    "discovery-telemetry-v1";

  bootstrap: {
    inputUrl:
      string;

    normalizedUrl:
      string;

    finalUrl:
      string;

    canonicalOrigin:
      string;

    redirectCount:
      number;

    robotsAvailable:
      boolean;

    sitemapCount:
      number;

    sitemapPageCount:
      number;

    menuSeedCount:
      number;

    seedCount:
      number;

    excludedByRobots:
      number;

    excludedOutOfScope:
      number;
  };

  profile: {
    suggestedSiteMode:
      string;

    confidence:
      string;

    rentalScore:
      number;

    saleScore:
      number;

    newScore:
      number;

    usedScore:
      number;

    platform:
      string;

    commercialEvidenceCount:
      number;

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
  };

  roots: {
    candidateCount:
      number;

    probedCount:
      number;

    rootCount:
      number;

    errorCount:
      number;

    rootUrls:
      string[];

    rootScores:
      number[];
  };

  graph: {
    nodeCount:
      number;

    rootsProcessed:
      number;

    catalogPagesVisited:
      number;

    interactions:
      number;

    errorCount:
      number;

    totalEvidenceCount:
      number;

    uniqueEvidenceCount:
      number;

    exactDuplicateEvidenceCount:
      number;

    evidenceSources:
      EvidenceSourceTelemetry[];

    nodesWithAliases:
      number;

    totalAliasCount:
      number;

    maxAliasesPerNode:
      number;

    queryBearingNodeCount:
      number;

    minimumScore:
      number | null;

    maximumScore:
      number | null;

    averageScore:
      number | null;
  };

  timingsMs:
    DiscoveryStageTimings | null;

  budgets:
    DiscoveryBudgets | null;
}


interface MutableSourceStats {
  evidenceCount:
    number;

  nodes:
    Set<string>;
}


function evidenceIdentity(
  nodeUrl: string,
  evidence: {
    source:
      ProductUrlEvidenceSource;

    parentUrl:
      string | null;

    detail:
      string | null;

    weight?:
      number;
  }
): string {

  return [
    nodeUrl,
    evidence.source,
    evidence.parentUrl ?? "",
    evidence.detail ?? "",
    evidence.weight ?? ""
  ].join(
    "\u0000"
  );
}


function hasQuery(
  rawUrl: string
): boolean {

  try {
    return (
      new URL(
        rawUrl
      ).search.length >
      0
    );
  }
  catch {
    return false;
  }
}


/**
 * Build an immutable discovery-facts snapshot.
 *
 * IMPORTANT:
 * - no network requests;
 * - no browser work;
 * - no classification;
 * - no anomaly judgement;
 * - no URL deletion.
 *
 * Later audit layers consume this object.
 */
export function buildDiscoveryTelemetry(
  input:
    DiscoveryTelemetryInput
): DiscoveryTelemetry {

  const sourceStats =
    new Map<
      ProductUrlEvidenceSource,
      MutableSourceStats
    >();


  const uniqueEvidence =
    new Set<string>();


  let totalEvidenceCount =
    0;

  let nodesWithAliases =
    0;

  let totalAliasCount =
    0;

  let maxAliasesPerNode =
    0;

  let queryBearingNodeCount =
    0;


  const scores:
    number[] = [];


  for (
    const node
    of input.graph.nodes
  ) {

    scores.push(
      node.score
    );


    const aliasCount =
      node.aliases.length;

    totalAliasCount +=
      aliasCount;

    maxAliasesPerNode =
      Math.max(
        maxAliasesPerNode,
        aliasCount
      );

    if (
      aliasCount >
      0
    ) {
      nodesWithAliases +=
        1;
    }


    if (
      hasQuery(
        node.url
      )
    ) {
      queryBearingNodeCount +=
        1;
    }


    const sourcesOnNode =
      new Set<
        ProductUrlEvidenceSource
      >();


    for (
      const evidence
      of node.evidence
    ) {

      totalEvidenceCount +=
        1;

      sourcesOnNode.add(
        evidence.source
      );


      uniqueEvidence.add(
        evidenceIdentity(
          node.url,
          evidence
        )
      );


      const current =
        sourceStats.get(
          evidence.source
        ) ?? {
          evidenceCount:
            0,

          nodes:
            new Set<string>()
        };


      current.evidenceCount +=
        1;

      current.nodes.add(
        node.url
      );

      sourceStats.set(
        evidence.source,
        current
      );
    }
  }


  const evidenceSources =
    Array.from(
      sourceStats.entries()
    )
      .map(
        (
          [
            source,
            stats
          ]
        ): EvidenceSourceTelemetry => ({
          source,

          evidenceCount:
            stats.evidenceCount,

          nodeCount:
            stats.nodes.size
        })
      )
      .sort(
        (a, b) =>
          a.source.localeCompare(
            b.source
          )
      );


  const minimumScore =
    scores.length >
    0
      ? Math.min(
          ...scores
        )
      : null;


  const maximumScore =
    scores.length >
    0
      ? Math.max(
          ...scores
        )
      : null;


  const averageScore =
    scores.length >
    0
      ? scores.reduce(
          (
            sum,
            score
          ) =>
            sum +
            score,
          0
        ) /
        scores.length
      : null;


  const uniqueEvidenceCount =
    uniqueEvidence.size;


  return {
    schemaVersion:
      "discovery-telemetry-v1",

    bootstrap: {
      inputUrl:
        input.bootstrap
          .inputUrl,

      normalizedUrl:
        input.bootstrap
          .normalizedUrl,

      finalUrl:
        input.bootstrap
          .finalUrl,

      canonicalOrigin:
        input.bootstrap
          .canonicalOrigin,

      redirectCount:
        input.bootstrap
          .diagnostics
          .redirectCount,

      robotsAvailable:
        input.bootstrap
          .diagnostics
          .robotsAvailable,

      sitemapCount:
        input.bootstrap
          .diagnostics
          .sitemapCount,

      sitemapPageCount:
        input.bootstrap
          .diagnostics
          .sitemapPageCount,

      menuSeedCount:
        input.bootstrap
          .diagnostics
          .menuSeedCount,

      seedCount:
        input.bootstrap
          .diagnostics
          .seedCount,

      excludedByRobots:
        input.bootstrap
          .diagnostics
          .excludedByRobots,

      excludedOutOfScope:
        input.bootstrap
          .diagnostics
          .excludedOutOfScope
    },

    profile: {
      suggestedSiteMode:
        input.profile
          .suggestedSiteMode,

      confidence:
        input.profile
          .confidence,

      rentalScore:
        input.profile
          .rentalScore,

      saleScore:
        input.profile
          .saleScore,

      newScore:
        input.profile
          .newScore,

      usedScore:
        input.profile
          .usedScore,

      platform:
        input.profile
          .platform,

      commercialEvidenceCount:
        input.profile
          .commercialEvidence
          .length,

      network: {
        requestCount:
          input.profile
            .network
            .requestCount,

        responseCount:
          input.profile
            .network
            .responseCount,

        failedRequestCount:
          input.profile
            .network
            .failedRequestCount,

        apiCandidateCount:
          input.profile
            .network
            .apiCandidateCount
      }
    },

    roots: {
      candidateCount:
        input.roots
          .candidates
          .length,

      probedCount:
        input.roots
          .probed
          .length,

      rootCount:
        input.roots
          .roots
          .length,

      errorCount:
        input.roots
          .errors
          .length,

      rootUrls:
        input.roots
          .roots
          .map(
            root =>
              root.url
          ),

      rootScores:
        input.roots
          .roots
          .map(
            root =>
              root.score
          )
    },

    graph: {
      nodeCount:
        input.graph
          .nodes
          .length,

      rootsProcessed:
        input.graph
          .rootsProcessed,

      catalogPagesVisited:
        input.graph
          .catalogPagesVisited,

      interactions:
        input.graph
          .interactions,

      errorCount:
        input.graph
          .errors
          .length,

      totalEvidenceCount,

      uniqueEvidenceCount,

      exactDuplicateEvidenceCount:
        Math.max(
          0,
          totalEvidenceCount -
          uniqueEvidenceCount
        ),

      evidenceSources,

      nodesWithAliases,

      totalAliasCount,

      maxAliasesPerNode,

      queryBearingNodeCount,

      minimumScore,

      maximumScore,

      averageScore
    },

    timingsMs:
      input.timingsMs ??
      null,

    budgets:
      input.budgets ??
      null
  };
}