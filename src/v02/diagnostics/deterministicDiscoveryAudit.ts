import {
  canonicalizeUrl
} from "../discovery/urlPolicy.js";

import {
  buildDiscoveryTelemetry,
  type DiscoveryTelemetry,
  type DiscoveryTelemetryInput
} from "./discoveryTelemetry.js";

import type {
  DiscoveryAuditFinding
} from "./discoveryAuditTypes.js";


function finding(
  ruleId: string,
  status:
    DiscoveryAuditFinding["status"],
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
    confidence:
      "HIGH",
    title,
    message,
    evidence,
    recommendation
  };
}


function canonicalMismatch(
  raw: string,
  baseUrl?: string
): {
  raw:
    string;

  canonical:
    string | null;

  removedQueryKeys:
    string[];
} | null {

  const canonical =
    canonicalizeUrl(
      raw,
      baseUrl
    );


  if (
    canonical ===
    raw
  ) {
    return null;
  }


  const removedQueryKeys:
    string[] = [];


  try {

    const before =
      new URL(
        raw,
        baseUrl
      );

    const after =
      canonical
        ? new URL(
            canonical
          )
        : null;


    const afterKeys =
      new Set(
        after
          ? Array.from(
              after.searchParams
                .keys()
            )
              .map(
                key =>
                  key.toLowerCase()
              )
          : []
      );


    for (
      const key
      of before.searchParams
        .keys()
    ) {

      if (
        !afterKeys.has(
          key.toLowerCase()
        )
      ) {
        removedQueryKeys.push(
          key
        );
      }
    }
  }
  catch {
    // Invalid URL is already represented
    // by canonical === null.
  }


  return {
    raw,
    canonical,
    removedQueryKeys
  };
}


export function runDeterministicDiscoveryAudit(
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
   * URL_CANONICAL_SURVIVAL
   *
   * Every URL emitted by discovery stages should
   * already be in canonical form.
   */
  const canonicalProblems:
    {
      location:
        string;

      raw:
        string;

      canonical:
        string | null;

      removedQueryKeys:
        string[];
    }[] = [];


  const inspectUrl = (
    location: string,
    raw: string
  ): void => {

    const mismatch =
      canonicalMismatch(
        raw,
        telemetry.bootstrap
          .canonicalOrigin
      );


    if (mismatch) {

      canonicalProblems.push({
        location,
        ...mismatch
      });
    }
  };


  inspectUrl(
    "bootstrap.finalUrl",
    telemetry.bootstrap
      .finalUrl
  );


  for (
    const [
      index,
      root
    ]
    of input.roots.roots.entries()
  ) {

    inspectUrl(
      `roots[${index}]`,
      root.url
    );
  }


  for (
    const [
      nodeIndex,
      node
    ]
    of input.graph.nodes.entries()
  ) {

    inspectUrl(
      `graph.nodes[${nodeIndex}]`,
      node.url
    );


    for (
      const [
        aliasIndex,
        alias
      ]
      of node.aliases.entries()
    ) {

      inspectUrl(
        `graph.nodes[${nodeIndex}].aliases[${aliasIndex}]`,
        alias
      );
    }
  }


  findings.push(
    canonicalProblems.length ===
    0
      ? finding(
          "URL_CANONICAL_SURVIVAL",
          "PASS",
          "Canonical URLs remain canonical",
          "No discovery-stage URL changes when canonicalized again.",
          {
            inspected:
              1 +
              input.roots.roots.length +
              input.graph.nodes.reduce(
                (
                  total,
                  node
                ) =>
                  total +
                  1 +
                  node.aliases.length,
                0
              )
          },
          null
        )
      : finding(
          "URL_CANONICAL_SURVIVAL",
          "FAIL",
          "Non-canonical URL survived discovery",
          "At least one emitted URL changes when canonicalized again. This can indicate tracking leakage, alias leakage, hash leakage, or normalization drift.",
          {
            count:
              canonicalProblems.length,

            samples:
              canonicalProblems.slice(
                0,
                10
              )
          },
          "Fix URL normalization at the earliest stage that emitted the non-canonical URL."
        )
  );


  /*
   * CANONICAL_ORIGIN_VALIDITY
   */
  let originValid =
    true;

  let parsedOrigin:
    string | null =
    null;


  try {

    const parsed =
      new URL(
        telemetry.bootstrap
          .canonicalOrigin
      );

    parsedOrigin =
      `${parsed.origin}/`;

    originValid =
      telemetry.bootstrap
        .canonicalOrigin ===
      parsedOrigin;
  }
  catch {
    originValid =
      false;
  }


  findings.push(
    originValid
      ? finding(
          "CANONICAL_ORIGIN_VALIDITY",
          "PASS",
          "Canonical origin is valid",
          "Canonical origin is a normalized HTTP(S) origin.",
          {
            canonicalOrigin:
              telemetry.bootstrap
                .canonicalOrigin
          },
          null
        )
      : finding(
          "CANONICAL_ORIGIN_VALIDITY",
          "FAIL",
          "Canonical origin is invalid",
          "The bootstrap canonical origin is malformed or contains path/query material.",
          {
            canonicalOrigin:
              telemetry.bootstrap
                .canonicalOrigin,

            expected:
              parsedOrigin
          },
          "Repair canonical-origin construction before continuing discovery."
        )
  );


  /*
   * GRAPH_ORIGIN_SCOPE
   */
  let expectedOrigin:
    string | null =
    null;


  try {
    expectedOrigin =
      new URL(
        telemetry.bootstrap
          .canonicalOrigin
      ).origin;
  }
  catch {
    expectedOrigin =
      null;
  }


  const escapedUrls:
    string[] = [];


  if (expectedOrigin) {

    for (
      const node
      of input.graph.nodes
    ) {

      try {

        if (
          new URL(
            node.url
          ).origin !==
          expectedOrigin
        ) {

          escapedUrls.push(
            node.url
          );
        }
      }
      catch {

        escapedUrls.push(
          node.url
        );
      }
    }
  }


  findings.push(
    escapedUrls.length ===
    0
      ? finding(
          "GRAPH_ORIGIN_SCOPE",
          "PASS",
          "Graph remains in origin scope",
          "No product graph node escaped the canonical origin.",
          {
            nodeCount:
              telemetry.graph
                .nodeCount
          },
          null
        )
      : finding(
          "GRAPH_ORIGIN_SCOPE",
          "FAIL",
          "Graph contains out-of-origin nodes",
          "Product URL Graph contains URLs outside the canonical origin.",
          {
            count:
              escapedUrls.length,

            samples:
              escapedUrls.slice(
                0,
                10
              )
          },
          "Audit origin-scope enforcement before candidate insertion."
        )
  );


  /*
   * EXACT_EVIDENCE_IDEMPOTENCE
   */
  findings.push(
    telemetry.graph
      .exactDuplicateEvidenceCount ===
    0
      ? finding(
          "EXACT_EVIDENCE_IDEMPOTENCE",
          "PASS",
          "Evidence is idempotent",
          "No exact duplicate evidence entries were detected.",
          {
            totalEvidenceCount:
              telemetry.graph
                .totalEvidenceCount,

            uniqueEvidenceCount:
              telemetry.graph
                .uniqueEvidenceCount
          },
          null
        )
      : finding(
          "EXACT_EVIDENCE_IDEMPOTENCE",
          "FAIL",
          "Duplicate evidence detected",
          "Exact evidence entries are being counted more than once.",
          {
            totalEvidenceCount:
              telemetry.graph
                .totalEvidenceCount,

            uniqueEvidenceCount:
              telemetry.graph
                .uniqueEvidenceCount,

            duplicates:
              telemetry.graph
                .exactDuplicateEvidenceCount
          },
          "Make evidence insertion idempotent and convert the failing case into a regression fixture."
        )
  );


  /*
   * SITEMAP_EVIDENCE_MULTIPLICATION
   *
   * Sitemap-pattern support is global URL evidence.
   * It must not multiply once per catalog page.
   */
  const sitemapSource =
    telemetry.graph
      .evidenceSources
      .find(
        source =>
          source.source ===
          "SITEMAP_PATTERN"
      );


  const sitemapMultiplied =
    sitemapSource
      ? sitemapSource
          .evidenceCount >
        sitemapSource
          .nodeCount
      : false;


  findings.push(
    !sitemapMultiplied
      ? finding(
          "SITEMAP_EVIDENCE_MULTIPLICATION",
          "PASS",
          "Sitemap evidence is not multiplied",
          "Each sitemap-backed node has at most one SITEMAP_PATTERN evidence entry.",
          {
            evidenceCount:
              sitemapSource
                ?.evidenceCount ??
              0,

            nodeCount:
              sitemapSource
                ?.nodeCount ??
              0
          },
          null
        )
      : finding(
          "SITEMAP_EVIDENCE_MULTIPLICATION",
          "FAIL",
          "Sitemap evidence multiplication detected",
          "SITEMAP_PATTERN evidence exceeds the number of nodes supported by that source.",
          {
            evidenceCount:
              sitemapSource
                ?.evidenceCount ??
              0,

            nodeCount:
              sitemapSource
                ?.nodeCount ??
              0,

            catalogPagesVisited:
              telemetry.graph
                .catalogPagesVisited
          },
          "Ensure sitemap evidence is attached once per canonical URL rather than once per page ingestion."
        )
  );


  /*
   * NODE_SCORE_BOUNDS
   */
  const invalidScores =
    input.graph.nodes
      .filter(
        node =>
          !Number.isFinite(
            node.score
          ) ||
          node.score <
            0 ||
          node.score >
            100
      )
      .map(
        node => ({
          url:
            node.url,

          score:
            node.score
        })
      );


  findings.push(
    invalidScores.length ===
    0
      ? finding(
          "NODE_SCORE_BOUNDS",
          "PASS",
          "Node scores are within bounds",
          "Every Product URL Graph score is finite and between 0 and 100.",
          {
            nodeCount:
              telemetry.graph
                .nodeCount
          },
          null
        )
      : finding(
          "NODE_SCORE_BOUNDS",
          "FAIL",
          "Invalid graph score detected",
          "At least one node score is outside the legal 0–100 range or is non-finite.",
          {
            count:
              invalidScores.length,

            samples:
              invalidScores.slice(
                0,
                10
              )
          },
          "Repair score accumulation before using graph ranking downstream."
        )
  );


  /*
   * NODE_PROVENANCE_INTEGRITY
   */
  const evidenceLessNodes =
    input.graph.nodes
      .filter(
        node =>
          node.evidence.length ===
          0
      )
      .map(
        node =>
          node.url
      );


  findings.push(
    evidenceLessNodes.length ===
    0
      ? finding(
          "NODE_PROVENANCE_INTEGRITY",
          "PASS",
          "Every node has provenance",
          "Every graph node contains at least one evidence record.",
          {
            nodeCount:
              telemetry.graph
                .nodeCount
          },
          null
        )
      : finding(
          "NODE_PROVENANCE_INTEGRITY",
          "FAIL",
          "Evidence-less graph node detected",
          "A discovered node exists without provenance.",
          {
            count:
              evidenceLessNodes.length,

            samples:
              evidenceLessNodes.slice(
                0,
                10
              )
          },
          "Never insert a Product URL Graph node without discovery evidence."
        )
  );


  /*
   * ROOT_ACCOUNTING_INVARIANT
   */
  const candidateCount =
    telemetry.roots
      .candidateCount;

  const probedCount =
    telemetry.roots
      .probedCount;

  const rootCount =
    telemetry.roots
      .rootCount;

  const rootsProcessed =
    telemetry.graph
      .rootsProcessed;


  const rootAccountingValid =
    probedCount <=
      candidateCount &&
    rootCount <=
      probedCount &&
    rootsProcessed <=
      rootCount &&
    (
      telemetry.budgets ===
        null ||
      rootsProcessed <=
        telemetry.budgets
          .maxGraphRoots
    );


  findings.push(
    rootAccountingValid
      ? finding(
          "ROOT_ACCOUNTING_INVARIANT",
          "PASS",
          "Root accounting is internally consistent",
          "Candidate, probe, selected-root and processed-root counts are monotonic.",
          {
            candidateCount,
            probedCount,
            rootCount,
            rootsProcessed
          },
          null
        )
      : finding(
          "ROOT_ACCOUNTING_INVARIANT",
          "FAIL",
          "Impossible root accounting detected",
          "Root counts violate the expected candidate ≥ probed ≥ selected ≥ processed relationship or exceed configured graph budget.",
          {
            candidateCount,
            probedCount,
            rootCount,
            rootsProcessed,

            maxGraphRoots:
              telemetry.budgets
                ?.maxGraphRoots ??
              null
          },
          "Audit root-selection accounting and configured graph limits."
        )
  );


  return findings;
}