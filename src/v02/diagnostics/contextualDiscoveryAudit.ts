import {
  buildDiscoveryTelemetry,
  type DiscoveryTelemetry,
  type DiscoveryTelemetryInput
} from "./discoveryTelemetry.js";

import type {
  DiscoveryAuditFinding
} from "./discoveryAuditTypes.js";


const STRONG_DETAIL_SOURCES =
  new Set([
    "JSON_LD_PRODUCT",
    "JSON_LD_ITEM_LIST",
    "API_ITEM",
    "REPEATED_CARD"
  ]);


function result(
  ruleId: string,
  status:
    DiscoveryAuditFinding["status"],
  confidence:
    DiscoveryAuditFinding["confidence"],
  title: string,
  message: string,
  evidence:
    Record<string, unknown>,
  recommendation:
    string | null
): DiscoveryAuditFinding {

  return {
    ruleId,
    status,
    confidence,
    title,
    message,
    evidence,
    recommendation
  };
}


function safeRatio(
  numerator: number,
  denominator: number
): number | null {

  if (
    denominator <=
    0
  ) {
    return null;
  }


  return (
    numerator /
    denominator
  );
}


interface QueryFamily {
  pathname:
    string;

  urls:
    string[];
}


function queryFamilies(
  input:
    DiscoveryTelemetryInput
): QueryFamily[] {

  const groups =
    new Map<
      string,
      Set<string>
    >();


  for (
    const node
    of input.graph.nodes
  ) {

    try {

      const url =
        new URL(
          node.url
        );


      if (
        !url.search
      ) {
        continue;
      }


      const key =
        `${url.origin}${url.pathname}`;


      const urls =
        groups.get(
          key
        ) ??
        new Set<string>();


      urls.add(
        node.url
      );

      groups.set(
        key,
        urls
      );
    }
    catch {
      // Deterministic auditor handles malformed URLs.
    }
  }


  return Array.from(
    groups.entries()
  )
    .map(
      (
        [
          pathname,
          urls
        ]
      ) => ({
        pathname,

        urls:
          Array.from(
            urls
          )
      })
    )
    .sort(
      (
        a,
        b
      ) =>
        b.urls.length -
        a.urls.length
    );
}


export function runContextualDiscoveryAudit(
  input:
    DiscoveryTelemetryInput,
  existingTelemetry?:
    DiscoveryTelemetry
): DiscoveryAuditFinding[] {

  const telemetry =
    existingTelemetry ??
    buildDiscoveryTelemetry(
      input
    );


  const findings:
    DiscoveryAuditFinding[] = [];


  /*
   * RECALL_SITEMAP_ALIGNMENT
   *
   * This is intentionally contextual.
   * A sitemap may contain non-product URLs,
   * therefore a low ratio is WARN, never FAIL.
   */
  const sitemapPages =
    telemetry.bootstrap
      .sitemapPageCount;


  const sitemapSource =
    telemetry.graph
      .evidenceSources
      .find(
        source =>
          source.source ===
          "SITEMAP_PATTERN"
      );


  const sitemapSupportedNodes =
    sitemapSource
      ?.nodeCount ??
    0;


  const sitemapPatternRatio =
    safeRatio(
      sitemapSupportedNodes,
      sitemapPages
    );


  const graphToSitemapRatio =
    safeRatio(
      telemetry.graph
        .nodeCount,
      sitemapPages
    );


  const sitemapRecallSuspicious =
    sitemapPages >=
      100 &&
    telemetry.roots
      .rootCount >
      0 &&
    telemetry.graph
      .nodeCount >
      0 &&
    (
      sitemapPatternRatio ??
      1
    ) <
      0.05 &&
    (
      graphToSitemapRatio ??
      1
    ) <
      0.20;


  findings.push(
    sitemapRecallSuspicious
      ? result(
          "RECALL_SITEMAP_ALIGNMENT",
          "WARN",
          "MEDIUM",
          "Sitemap and graph recall appear misaligned",
          "The site exposes a large sitemap, but only a small share is represented by sitemap-backed graph candidates.",
          {
            sitemapPages,

            sitemapSupportedNodes,

            graphNodeCount:
              telemetry.graph
                .nodeCount,

            sitemapPatternRatio,

            graphToSitemapRatio
          },
          "Inspect sitemap-pattern inference and candidate retention before assuming the sitemap is irrelevant."
        )
      : result(
          "RECALL_SITEMAP_ALIGNMENT",
          "PASS",
          "MEDIUM",
          "No material sitemap/graph recall collapse detected",
          "Current sitemap scale and Product URL Graph scale are not showing a strong recall-collapse signal.",
          {
            sitemapPages,

            sitemapSupportedNodes,

            graphNodeCount:
              telemetry.graph
                .nodeCount,

            sitemapPatternRatio,

            graphToSitemapRatio
          },
          null
        )
  );


  /*
   * SOURCE_CONCENTRATION
   *
   * Concentration is not inherently wrong.
   * It simply means recall currently depends heavily
   * on one discovery mechanism.
   */
  const sourceRanking =
    telemetry.graph
      .evidenceSources
      .map(
        source => ({
          ...source,

          nodeShare:
            safeRatio(
              source.nodeCount,
              telemetry.graph
                .nodeCount
            ) ??
            0
        })
      )
      .sort(
        (
          a,
          b
        ) =>
          b.nodeShare -
          a.nodeShare
      );


  const dominant =
    sourceRanking[0];


  const second =
    sourceRanking[1];


  const sourceConcentrated =
    telemetry.graph
      .nodeCount >=
      50 &&
    Boolean(
      dominant
    ) &&
    (
      dominant?.nodeShare ??
      0
    ) >=
      0.95 &&
    (
      second?.nodeShare ??
      0
    ) <
      0.15;


  findings.push(
    sourceConcentrated
      ? result(
          "SOURCE_CONCENTRATION",
          "WARN",
          "LOW",
          "Graph recall is concentrated in one evidence source",
          "Most graph nodes depend on one discovery mechanism. This can be valid, but it creates fragility if that mechanism disappears.",
          {
            dominantSource:
              dominant?.source ??
              null,

            dominantNodeShare:
              dominant?.nodeShare ??
              null,

            secondSource:
              second?.source ??
              null,

            secondNodeShare:
              second?.nodeShare ??
              null,

            graphNodeCount:
              telemetry.graph
                .nodeCount
          },
          "Keep the data, but monitor whether DOM/API/JSON-LD sources provide independent support on future runs."
        )
      : result(
          "SOURCE_CONCENTRATION",
          "PASS",
          "LOW",
          "No extreme evidence-source concentration detected",
          "Graph discovery is not showing a severe single-source dependency signal.",
          {
            dominantSource:
              dominant?.source ??
              null,

            dominantNodeShare:
              dominant?.nodeShare ??
              null
          },
          null
        )
  );


  /*
   * ROOT_BUDGET_TRUNCATION
   */
  const undispatchedRoots =
    Math.max(
      0,
      telemetry.roots
        .rootCount -
      telemetry.graph
        .rootsProcessed
    );


  findings.push(
    undispatchedRoots >
    0
      ? result(
          "ROOT_BUDGET_TRUNCATION",
          "WARN",
          "HIGH",
          "Selected commercial roots were not all processed",
          "Root discovery selected more roots than Product URL Graph was allowed to process.",
          {
            selectedRoots:
              telemetry.roots
                .rootCount,

            processedRoots:
              telemetry.graph
                .rootsProcessed,

            undispatchedRoots,

            maxGraphRoots:
              telemetry.budgets
                ?.maxGraphRoots ??
              null
          },
          "Treat this as a recall-risk signal. Increase or diversify root budgeting only if downstream evidence shows missed inventory."
        )
      : result(
          "ROOT_BUDGET_TRUNCATION",
          "PASS",
          "HIGH",
          "All selected roots fit the graph budget",
          "No selected commercial root was dropped by Product URL Graph root budgeting.",
          {
            selectedRoots:
              telemetry.roots
                .rootCount,

            processedRoots:
              telemetry.graph
                .rootsProcessed
          },
          null
        )
  );


  /*
   * QUERY_VARIANT_EXPLOSION
   *
   * Do not delete variants here.
   * The semantics of query parameters may be meaningful.
   */
  const families =
    queryFamilies(
      input
    );


  const exploding =
    families.filter(
      family =>
        family.urls.length >=
        5
    );


  findings.push(
    exploding.length >
    0
      ? result(
          "QUERY_VARIANT_EXPLOSION",
          "WARN",
          "MEDIUM",
          "Many graph URLs share one path but differ by query",
          "The graph contains several query-bearing variants for the same pathname. They may be real variants or unresolved aliases.",
          {
            familyCount:
              exploding.length,

            samples:
              exploding.slice(
                0,
                5
              )
        },
          "Do not merge automatically. Verify query semantics or use product IDs/detail canonical tags in later phases."
        )
      : result(
          "QUERY_VARIANT_EXPLOSION",
          "PASS",
          "MEDIUM",
          "No large query-variant family detected",
          "No pathname currently expands into five or more query-bearing graph nodes.",
          {
            queryBearingNodeCount:
              telemetry.graph
                .queryBearingNodeCount,

            maxFamilySize:
              families[0]
                ?.urls.length ??
              0
          },
          null
        )
  );


  /*
   * HIGH_SCORE_WEAK_EVIDENCE
   *
   * High confidence should ideally have at least one
   * strong product-detail signal. This is WARN only.
   */
  const highScoreWeak =
    input.graph.nodes
      .filter(
        node => {

          if (
            node.score <
            90
          ) {
            return false;
          }


          return !node.evidence.some(
            evidence =>
              STRONG_DETAIL_SOURCES.has(
                evidence.source
              )
          );
        }
      )
      .map(
        node => ({
          url:
            node.url,

          score:
            node.score,

          sources:
            Array.from(
              new Set(
                node.evidence.map(
                  evidence =>
                    evidence.source
                )
              )
            )
        })
      );


  findings.push(
    highScoreWeak.length >
    0
      ? result(
          "HIGH_SCORE_WEAK_EVIDENCE",
          "WARN",
          "MEDIUM",
          "High-score candidates lack strong detail evidence",
          "One or more nodes reached a very high score using only weaker discovery evidence.",
          {
            count:
              highScoreWeak.length,

            samples:
              highScoreWeak.slice(
                0,
                10
              )
          },
          "Keep these nodes for recall, but require Detail Acquisition / Entity Classification before treating them as confirmed products."
        )
      : result(
          "HIGH_SCORE_WEAK_EVIDENCE",
          "PASS",
          "MEDIUM",
          "High-score nodes have strong support",
          "No score ≥90 node is supported exclusively by weaker discovery signals.",
          {
            graphNodeCount:
              telemetry.graph
                .nodeCount
          },
          null
        )
  );


  /*
   * DISCOVERY_ERRORS
   */
  const totalErrors =
    telemetry.roots
      .errorCount +
    telemetry.graph
      .errorCount;


  findings.push(
    totalErrors >
    0
      ? result(
          "DISCOVERY_ERRORS",
          "WARN",
          "HIGH",
          "Discovery completed with recoverable errors",
          "At least one root probe or graph page produced an error.",
          {
            rootErrors:
              telemetry.roots
                .errorCount,

            graphErrors:
              telemetry.graph
                .errorCount
          },
          "Retain partial evidence, but persist the failed URLs and convert recurring failures into deterministic fixtures."
        )
      : result(
          "DISCOVERY_ERRORS",
          "PASS",
          "HIGH",
          "Discovery completed without recorded errors",
          "Root discovery and Product URL Graph reported zero errors.",
          {
            rootErrors:
              0,

            graphErrors:
              0
          },
          null
        )
  );


  return findings;
}