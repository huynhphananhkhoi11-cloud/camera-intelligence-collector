import type {
  DiscoveryTelemetry
} from "./discoveryTelemetry.js";

import type {
  DiscoveryAuditFinding
} from "./discoveryAuditTypes.js";


export interface DiscoveryBaseline {
  schemaVersion:
    "discovery-baseline-v1";

  canonicalOrigin:
    string;

  capturedAt:
    string;

  sitemapPageCount:
    number;

  graphNodeCount:
    number;

  rootCount:
    number;

  graphErrorCount:
    number;

  sourceNodeCounts:
    Record<
      string,
      number
    >;

  productGraphMs:
    number | null;
}


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


export function createDiscoveryBaseline(
  telemetry:
    DiscoveryTelemetry,
  capturedAt =
    new Date()
      .toISOString()
): DiscoveryBaseline {

  const sourceNodeCounts:
    Record<
      string,
      number
    > = {};


  for (
    const source
    of telemetry.graph
      .evidenceSources
  ) {

    sourceNodeCounts[
      source.source
    ] =
      source.nodeCount;
  }


  return {
    schemaVersion:
      "discovery-baseline-v1",

    canonicalOrigin:
      telemetry.bootstrap
        .canonicalOrigin,

    capturedAt,

    sitemapPageCount:
      telemetry.bootstrap
        .sitemapPageCount,

    graphNodeCount:
      telemetry.graph
        .nodeCount,

    rootCount:
      telemetry.roots
        .rootCount,

    graphErrorCount:
      telemetry.graph
        .errorCount,

    sourceNodeCounts,

    productGraphMs:
      telemetry.timingsMs
        ?.productGraphMs ??
      null
  };
}


export function compareDiscoveryBaseline(
  current:
    DiscoveryTelemetry,
  baseline:
    DiscoveryBaseline
): DiscoveryAuditFinding[] {

  if (
    current.bootstrap
      .canonicalOrigin !==
    baseline.canonicalOrigin
  ) {

    return [
      result(
        "BASELINE_SCOPE_MATCH",
        "WARN",
        "HIGH",
        "Historical baseline belongs to another origin",
        "Regression comparison was skipped because the baseline canonical origin does not match the current site.",
        {
          current:
            current.bootstrap
              .canonicalOrigin,

          baseline:
            baseline.canonicalOrigin
        },
        "Use only same-origin successful runs as historical baselines."
      )
    ];
  }


  const findings:
    DiscoveryAuditFinding[] = [];


  findings.push(
    result(
      "BASELINE_SCOPE_MATCH",
      "PASS",
      "HIGH",
      "Historical baseline scope matches",
      "Current telemetry and baseline refer to the same canonical origin.",
      {
        canonicalOrigin:
          baseline.canonicalOrigin
      },
      null
    )
  );


  /*
   * COVERAGE_REGRESSION
   *
   * Strong signal:
   * website sitemap scale stayed broadly stable
   * while graph output collapsed.
   */
  const sitemapStable =
    baseline.sitemapPageCount <
      20 ||
    current.bootstrap
      .sitemapPageCount >=
      baseline.sitemapPageCount *
      0.8;


  const graphCollapsed =
    baseline.graphNodeCount >=
      20 &&
    current.graph
      .nodeCount <
      baseline.graphNodeCount *
      0.5;


  findings.push(
    sitemapStable &&
    graphCollapsed
      ? result(
          "COVERAGE_REGRESSION",
          "WARN",
          "HIGH",
          "Product URL Graph coverage regressed sharply",
          "Graph node count dropped by more than half while sitemap scale remained broadly stable.",
          {
            baselineGraphNodes:
              baseline.graphNodeCount,

            currentGraphNodes:
              current.graph
                .nodeCount,

            baselineSitemapPages:
              baseline.sitemapPageCount,

            currentSitemapPages:
              current.bootstrap
                .sitemapPageCount
          },
          "Compare current pattern inference, root traversal and source contributions with the last successful baseline."
        )
      : result(
          "COVERAGE_REGRESSION",
          "PASS",
          "HIGH",
          "No major historical graph collapse detected",
          "Current graph scale is not showing a severe regression relative to the successful baseline.",
          {
            baselineGraphNodes:
              baseline.graphNodeCount,

            currentGraphNodes:
              current.graph
                .nodeCount
          },
          null
        )
  );


  /*
   * SITEMAP_SCALE_SHIFT
   */
  const sitemapRatio =
    baseline.sitemapPageCount >
    0
      ? current.bootstrap
          .sitemapPageCount /
        baseline.sitemapPageCount
      : null;


  const sitemapShift =
    sitemapRatio !==
      null &&
    baseline.sitemapPageCount >=
      20 &&
    (
      sitemapRatio <
        0.5 ||
      sitemapRatio >
        2
    );


  findings.push(
    sitemapShift
      ? result(
          "SITEMAP_SCALE_SHIFT",
          "WARN",
          "MEDIUM",
          "Website sitemap scale changed materially",
          "Current sitemap size differs by more than 2× from the historical baseline.",
          {
            baseline:
              baseline.sitemapPageCount,

            current:
              current.bootstrap
                .sitemapPageCount,

            ratio:
              sitemapRatio
          },
          "Treat other regression comparisons cautiously because the website itself may have changed."
        )
      : result(
          "SITEMAP_SCALE_SHIFT",
          "PASS",
          "MEDIUM",
          "Website sitemap scale is broadly comparable",
          "No greater-than-2× sitemap scale shift was detected.",
          {
            ratio:
              sitemapRatio
          },
          null
        )
  );


  /*
   * ERROR_REGRESSION
   */
  const errorRegression =
    current.graph
      .errorCount >
    Math.max(
      2,
      baseline.graphErrorCount *
        2 +
      1
    );


  findings.push(
    errorRegression
      ? result(
          "ERROR_REGRESSION",
          "WARN",
          "HIGH",
          "Graph errors increased materially",
          "The current run contains substantially more Product URL Graph errors than the baseline.",
          {
            baseline:
              baseline.graphErrorCount,

            current:
              current.graph
                .errorCount
          },
          "Inspect the failed page URLs and browser/network failure reasons."
        )
      : result(
          "ERROR_REGRESSION",
          "PASS",
          "HIGH",
          "No material graph-error regression detected",
          "Current Product URL Graph errors are within the historical tolerance.",
          {
            baseline:
              baseline.graphErrorCount,

            current:
              current.graph
                .errorCount
          },
          null
        )
  );


  /*
   * PERFORMANCE_REGRESSION
   */
  const baselineMs =
    baseline.productGraphMs;

  const currentMs =
    current.timingsMs
      ?.productGraphMs ??
    null;


  const performanceRegression =
    baselineMs !==
      null &&
    currentMs !==
      null &&
    baselineMs >
      0 &&
    currentMs >
      Math.max(
        baselineMs *
          3,
        baselineMs +
          10000
      );


  findings.push(
    performanceRegression
      ? result(
          "PERFORMANCE_REGRESSION",
          "WARN",
          "MEDIUM",
          "Product URL Graph became much slower",
          "Current graph duration exceeds both 3× the baseline and a 10-second absolute increase.",
          {
            baselineMs,

            currentMs,

            multiplier:
              baselineMs
                ? currentMs /
                  baselineMs
                : null
          },
          "Inspect repeated sitemap scoring, unnecessary page interactions and page-budget utilization."
        )
      : result(
          "PERFORMANCE_REGRESSION",
          "PASS",
          "MEDIUM",
          "No severe graph-performance regression detected",
          "Current graph timing is not showing a severe historical slowdown.",
          {
            baselineMs,

            currentMs
          },
          null
        )
  );


  /*
   * ROOT_COLLAPSE
   */
  const rootCollapse =
    baseline.rootCount >
      0 &&
    current.roots
      .rootCount ===
      0;


  findings.push(
    rootCollapse
      ? result(
          "ROOT_COLLAPSE",
          "WARN",
          "HIGH",
          "Commercial root discovery collapsed",
          "A site that previously produced commercial roots now produces none.",
          {
            baselineRootCount:
              baseline.rootCount,

            currentRootCount:
              current.roots
                .rootCount
          },
          "Inspect root candidate scoring/probing before accepting the current discovery run as complete."
        )
      : result(
          "ROOT_COLLAPSE",
          "PASS",
          "HIGH",
          "Commercial roots did not collapse",
          "Root discovery remains non-zero when the baseline was non-zero.",
          {
            baselineRootCount:
              baseline.rootCount,

            currentRootCount:
              current.roots
                .rootCount
          },
          null
        )
  );


  return findings;
}