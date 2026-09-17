import {
  describe,
  expect,
  test
} from "vitest";

import {
  runContextualDiscoveryAudit
} from "../../../src/v02/diagnostics/contextualDiscoveryAudit.ts";

import type {
  DiscoveryTelemetryInput
} from "../../../src/v02/diagnostics/discoveryTelemetry.ts";


function fixture():
  DiscoveryTelemetryInput {

  const nodes =
    Array.from(
      {
        length:
          100
      },
      (
        _,
        index
      ) => ({
        url:
          index <
          6
            ? `https://shop.test/p/shared?product-id=${index}`
            : `https://shop.test/p/${index}`,

        aliases:
          [],

        productId:
          null,

        score:
          index ===
          0
            ? 100
            : 55,

        state:
          "DISCOVERED",

        parentUrls:
          [
            "https://shop.test/catalog"
          ],

        evidence: [
          {
            source:
              "SITEMAP_PATTERN",

            parentUrl:
              null,

            detail:
              "slug",

            weight:
              10
          }
        ]
      })
    );


  return {
    bootstrap: {
      inputUrl:
        "https://shop.test/",

      normalizedUrl:
        "https://shop.test/",

      finalUrl:
        "https://shop.test/",

      canonicalOrigin:
        "https://shop.test/",

      diagnostics: {
        redirectCount: 0,
        robotsAvailable: true,
        sitemapCount: 1,
        sitemapPageCount: 5000,
        menuSeedCount: 5,
        seedCount: 5001,
        excludedByRobots: 0,
        excludedOutOfScope: 0
      }
    } as unknown as
      DiscoveryTelemetryInput["bootstrap"],

    profile: {
      suggestedSiteMode:
        "SALE_MIXED",

      confidence:
        "MEDIUM",

      rentalScore: 10,
      saleScore: 30,
      newScore: 12,
      usedScore: 12,
      platform: "CUSTOM",
      commercialEvidence: [{}],

      network: {
        requestCount: 50,
        responseCount: 50,
        failedRequestCount: 0,
        apiCandidateCount: 0
      }
    } as unknown as
      DiscoveryTelemetryInput["profile"],

    roots: {
      candidates:
        new Array(10)
          .fill({}),

      probed:
        new Array(4)
          .fill({}),

      roots: [
        {
          url:
            "https://shop.test/catalog-a",

          score:
            60
        },
        {
          url:
            "https://shop.test/catalog-b",

          score:
            59
        },
        {
          url:
            "https://shop.test/catalog-c",

          score:
            58
        },
        {
          url:
            "https://shop.test/catalog-d",

          score:
            57
        }
      ],

      errors:
        []
    } as unknown as
      DiscoveryTelemetryInput["roots"],

    graph: {
      nodes,

      rootsProcessed:
        3,

      catalogPagesVisited:
        3,

      interactions:
        6,

      errors:
        []
    } as unknown as
      DiscoveryTelemetryInput["graph"],

    budgets: {
      rootProbeLimit: 4,
      minimumRootScore: 45,
      maxGraphRoots: 3,
      maxPagesPerRoot: 5,
      maxInteractionsPerPage: 3,
      noNewUrlRounds: 2
    }
  };
}


describe(
  "Contextual Discovery Audit",
  () => {

    test(
      "detects recall and concentration anomalies without deleting data",
      () => {

        const findings =
          runContextualDiscoveryAudit(
            fixture()
          );


        expect(
          findings.find(
            finding =>
              finding.ruleId ===
              "RECALL_SITEMAP_ALIGNMENT"
          )?.status
        ).toBe(
          "WARN"
        );


        expect(
          findings.find(
            finding =>
              finding.ruleId ===
              "SOURCE_CONCENTRATION"
          )?.status
        ).toBe(
          "WARN"
        );


        expect(
          findings.find(
            finding =>
              finding.ruleId ===
              "ROOT_BUDGET_TRUNCATION"
          )?.status
        ).toBe(
          "WARN"
        );


        expect(
          findings.find(
            finding =>
              finding.ruleId ===
              "QUERY_VARIANT_EXPLOSION"
          )?.status
        ).toBe(
          "WARN"
        );


        expect(
          findings.find(
            finding =>
              finding.ruleId ===
              "HIGH_SCORE_WEAK_EVIDENCE"
          )?.status
        ).toBe(
          "WARN"
        );
      }
    );


    test(
      "keeps contextual anomalies as warnings rather than deterministic failures",
      () => {

        const findings =
          runContextualDiscoveryAudit(
            fixture()
          );


        expect(
          findings.some(
            finding =>
              finding.status ===
              "FAIL"
          )
        ).toBe(false);
      }
    );

  }
);