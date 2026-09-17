import {
  describe,
  expect,
  test
} from "vitest";

import {
  runDiscoveryAudit
} from "../../../src/v02/diagnostics/discoveryAuditEngine.ts";

import {
  formatDiscoveryAuditReport
} from "../../../src/v02/diagnostics/discoveryAuditReporter.ts";

import type {
  DiscoveryTelemetryInput
} from "../../../src/v02/diagnostics/discoveryTelemetry.ts";


function healthy():
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
        sitemapPageCount: 10,
        menuSeedCount: 4,
        seedCount: 11,
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

      rentalScore: 0,
      saleScore: 20,
      newScore: 12,
      usedScore: 12,
      platform: "CUSTOM",
      commercialEvidence: [{}],

      network: {
        requestCount: 10,
        responseCount: 10,
        failedRequestCount: 0,
        apiCandidateCount: 1
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
            70
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
            "1",

          score:
            70,

          state:
            "DISCOVERED",

          parentUrls: [
            "https://shop.test/catalog"
          ],

          evidence: [
            {
              source:
                "API_ITEM",

              parentUrl:
                "https://shop.test/catalog",

              detail:
                "id=1",

              weight:
                70
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
  "Discovery Self-Audit Engine",
  () => {

    test(
      "returns PASS for a healthy run",
      () => {

        const report =
          runDiscoveryAudit(
            healthy()
          );


        expect(
          report.summary.status
        ).toBe(
          "PASS"
        );


        expect(
          report.summary.failures
        ).toBe(0);


        expect(
          report.summary.warnings
        ).toBe(0);
      }
    );


    test(
      "deterministic violation makes overall result FAIL",
      () => {

        const input =
          healthy();


        (
          input.bootstrap as unknown as
          {
            finalUrl:
              string;
          }
        ).finalUrl =
          "https://shop.test/?srsltid=x";


        const report =
          runDiscoveryAudit(
            input
          );


        expect(
          report.summary.status
        ).toBe(
          "FAIL"
        );


        expect(
          report.summary.failures
        ).toBeGreaterThan(0);
      }
    );


    test(
      "contextual anomaly produces WARN but not FAIL",
      () => {

        const input =
          healthy();


        const contextualRoots = [
          {
            url:
              "https://shop.test/catalog",

            score:
              70
          },
          {
            url:
              "https://shop.test/used",

            score:
              65
          }
        ];


        (
          input.roots as unknown as
          {
            candidates:
              unknown[];

            probed:
              unknown[];

            roots:
              {
                url:
                  string;

                score:
                  number;
              }[];
          }
        ).candidates = [
          {},
          {}
        ];


        (
          input.roots as unknown as
          {
            candidates:
              unknown[];

            probed:
              unknown[];

            roots:
              {
                url:
                  string;

                score:
                  number;
              }[];
          }
        ).probed = [
          {},
          {}
        ];


        (
          input.roots as unknown as
          {
            candidates:
              unknown[];

            probed:
              unknown[];

            roots:
              {
                url:
                  string;

                score:
                  number;
              }[];
          }
        ).roots =
          contextualRoots;


        const report =
          runDiscoveryAudit(
            input
          );


        expect(
          report.summary.status
        ).toBe(
          "WARN"
        );


        expect(
          report.summary.failures
        ).toBe(0);


        expect(
          report.summary.warnings
        ).toBeGreaterThan(0);
      }
    );


    test(
      "reporter exposes rule IDs and summary",
      () => {

        const report =
          runDiscoveryAudit(
            healthy()
          );


        const text =
          formatDiscoveryAuditReport(
            report
          )
            .join(
              "\n"
            );


        expect(
          text
        ).toContain(
          "Discovery Self-Audit:"
        );


        expect(
          text
        ).toContain(
          "URL_CANONICAL_SURVIVAL"
        );


        expect(
          text
        ).toContain(
          "Audit result: PASS"
        );
      }
    );

  }
);