import {
  describe,
  expect,
  test
} from "vitest";

import {
  compareDiscoveryBaseline,
  createDiscoveryBaseline
} from "../../../src/v02/diagnostics/discoveryRegression.ts";

import type {
  DiscoveryTelemetry
} from "../../../src/v02/diagnostics/discoveryTelemetry.ts";


function telemetry(
  nodeCount:
    number,
  sitemapPageCount:
    number,
  productGraphMs:
    number
): DiscoveryTelemetry {

  return {
    schemaVersion:
      "discovery-telemetry-v1",

    bootstrap: {
      inputUrl:
        "https://shop.test/",

      normalizedUrl:
        "https://shop.test/",

      finalUrl:
        "https://shop.test/",

      canonicalOrigin:
        "https://shop.test/",

      redirectCount: 0,
      robotsAvailable: true,
      sitemapCount: 1,
      sitemapPageCount,
      menuSeedCount: 10,
      seedCount:
        sitemapPageCount +
        1,
      excludedByRobots: 0,
      excludedOutOfScope: 0
    },

    profile: {
      suggestedSiteMode:
        "SALE_MIXED",

      confidence:
        "MEDIUM",

      rentalScore: 0,
      saleScore: 20,
      newScore: 12,
      usedScore: 12,
      platform: "CUSTOM",
      commercialEvidenceCount: 1,

      network: {
        requestCount: 10,
        responseCount: 10,
        failedRequestCount: 0,
        apiCandidateCount: 0
      }
    },

    roots: {
      candidateCount: 10,
      probedCount: 4,
      rootCount: 1,
      errorCount: 0,
      rootUrls:
        [
          "https://shop.test/catalog"
        ],
      rootScores:
        [70]
    },

    graph: {
      nodeCount,
      rootsProcessed: 1,
      catalogPagesVisited: 5,
      interactions: 10,
      errorCount: 0,
      totalEvidenceCount:
        nodeCount,
      uniqueEvidenceCount:
        nodeCount,
      exactDuplicateEvidenceCount: 0,

      evidenceSources: [
        {
          source:
            "SITEMAP_PATTERN",

          evidenceCount:
            nodeCount,

          nodeCount
        }
      ],

      nodesWithAliases: 0,
      totalAliasCount: 0,
      maxAliasesPerNode: 0,
      queryBearingNodeCount: 0,
      minimumScore:
        nodeCount >
        0
          ? 10
          : null,
      maximumScore:
        nodeCount >
        0
          ? 55
          : null,
      averageScore:
        nodeCount >
        0
          ? 30
          : null
    },

    timingsMs: {
      bootstrapMs: 1000,
      profileMs: 2000,
      rootDiscoveryMs: 3000,
      productGraphMs
    },

    budgets:
      null
  };
}


describe(
  "Discovery Regression Memory",
  () => {

    test(
      "creates a compact baseline",
      () => {

        const baseline =
          createDiscoveryBaseline(
            telemetry(
              1000,
              1010,
              10000
            ),
            "2026-09-17T00:00:00.000Z"
          );


        expect(
          baseline.graphNodeCount
        ).toBe(1000);


        expect(
          baseline.sitemapPageCount
        ).toBe(1010);


        expect(
          baseline.productGraphMs
        ).toBe(10000);
      }
    );


    test(
      "detects graph collapse when website scale is stable",
      () => {

        const baseline =
          createDiscoveryBaseline(
            telemetry(
              1000,
              1000,
              10000
            )
          );


        const current =
          telemetry(
            100,
            990,
            10000
          );


        const finding =
          compareDiscoveryBaseline(
            current,
            baseline
          )
            .find(
              item =>
                item.ruleId ===
                "COVERAGE_REGRESSION"
            );


        expect(
          finding?.status
        ).toBe(
          "WARN"
        );
      }
    );


    test(
      "detects severe performance regression",
      () => {

        const baseline =
          createDiscoveryBaseline(
            telemetry(
              1000,
              1000,
              10000
            )
          );


        const current =
          telemetry(
            1000,
            1000,
            40000
          );


        const finding =
          compareDiscoveryBaseline(
            current,
            baseline
          )
            .find(
              item =>
                item.ruleId ===
                "PERFORMANCE_REGRESSION"
            );


        expect(
          finding?.status
        ).toBe(
          "WARN"
        );
      }
    );


    test(
      "does not compare different origins as if they were the same site",
      () => {

        const baseline =
          createDiscoveryBaseline(
            telemetry(
              1000,
              1000,
              10000
            )
          );


        const current =
          telemetry(
            1000,
            1000,
            10000
          );


        current.bootstrap
          .canonicalOrigin =
          "https://other.test/";


        const findings =
          compareDiscoveryBaseline(
            current,
            baseline
          );


        expect(
          findings
        ).toHaveLength(1);


        expect(
          findings[0]
            .ruleId
        ).toBe(
          "BASELINE_SCOPE_MATCH"
        );


        expect(
          findings[0]
            .status
        ).toBe(
          "WARN"
        );
      }
    );

  }
);