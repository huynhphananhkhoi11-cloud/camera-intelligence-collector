import {
  describe,
  expect,
  test
} from "vitest";

import {
  runDeterministicDiscoveryAudit
} from "../../../src/v02/diagnostics/deterministicDiscoveryAudit.ts";

import type {
  DiscoveryTelemetryInput
} from "../../../src/v02/diagnostics/discoveryTelemetry.ts";


function fixture():
  DiscoveryTelemetryInput {

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
        sitemapPageCount: 2,
        menuSeedCount: 2,
        seedCount: 3,
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

      rentalScore:
        0,

      saleScore:
        20,

      newScore:
        12,

      usedScore:
        12,

      platform:
        "CUSTOM",

      commercialEvidence:
        [{}],

      network: {
        requestCount: 10,
        responseCount: 10,
        failedRequestCount: 0,
        apiCandidateCount: 0
      }
    } as unknown as
      DiscoveryTelemetryInput["profile"],

    roots: {
      candidates: [
        {
          url:
            "https://shop.test/catalog"
        }
      ],

      probed: [
        {
          url:
            "https://shop.test/catalog"
        }
      ],

      roots: [
        {
          url:
            "https://shop.test/catalog",

          score:
            60
        }
      ],

      errors:
        []
    } as unknown as
      DiscoveryTelemetryInput["roots"],

    graph: {
      nodes: [
        {
          url:
            "https://shop.test/p/1",

          aliases:
            [],

          productId:
            null,

          score:
            55,

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
            },
            {
              source:
                "IMAGE_LINK",

              parentUrl:
                "https://shop.test/catalog",

              detail:
                null,

              weight:
                45
            }
          ]
        }
      ],

      rootsProcessed:
        1,

      catalogPagesVisited:
        1,

      interactions:
        2,

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
  "Deterministic Discovery Audit",
  () => {

    test(
      "passes a structurally healthy discovery run",
      () => {

        const findings =
          runDeterministicDiscoveryAudit(
            fixture()
          );

        expect(
          findings.every(
            finding =>
              finding.status ===
              "PASS"
          )
        ).toBe(true);
      }
    );


    test(
      "detects canonicalization leakage",
      () => {

        const input =
          fixture();

        (
          input.bootstrap as unknown as
          {
            finalUrl:
              string;
          }
        ).finalUrl =
          "https://shop.test/?srsltid=tracking";


        const finding =
          runDeterministicDiscoveryAudit(
            input
          )
            .find(
              item =>
                item.ruleId ===
                "URL_CANONICAL_SURVIVAL"
            );

        expect(
          finding?.status
        ).toBe(
          "FAIL"
        );
      }
    );


    test(
      "detects exact evidence duplication",
      () => {

        const input =
          fixture();

        const node =
          input.graph.nodes[0];

        node.evidence.push({
          ...node.evidence[0]
        });


        const findings =
          runDeterministicDiscoveryAudit(
            input
          );


        expect(
          findings.find(
            item =>
              item.ruleId ===
              "EXACT_EVIDENCE_IDEMPOTENCE"
          )?.status
        ).toBe(
          "FAIL"
        );


        expect(
          findings.find(
            item =>
              item.ruleId ===
              "SITEMAP_EVIDENCE_MULTIPLICATION"
          )?.status
        ).toBe(
          "FAIL"
        );
      }
    );


    test(
      "detects invalid score and root accounting",
      () => {

        const input =
          fixture();

        input.graph.nodes[0].score =
          120;

        input.graph.rootsProcessed =
          2;


        const findings =
          runDeterministicDiscoveryAudit(
            input
          );


        expect(
          findings.find(
            item =>
              item.ruleId ===
              "NODE_SCORE_BOUNDS"
          )?.status
        ).toBe(
          "FAIL"
        );


        expect(
          findings.find(
            item =>
              item.ruleId ===
              "ROOT_ACCOUNTING_INVARIANT"
          )?.status
        ).toBe(
          "FAIL"
        );
      }
    );

  }
);