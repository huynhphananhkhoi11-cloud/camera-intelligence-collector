import {
  describe,
  expect,
  test
} from "vitest";

import {
  buildDiscoveryTelemetry,
  type DiscoveryTelemetryInput
} from "../../../src/v02/diagnostics/discoveryTelemetry.ts";


function fixture():
  DiscoveryTelemetryInput {

  return {
    bootstrap: {
      inputUrl:
        "https://shop.test/?utm_source=x",

      normalizedUrl:
        "https://shop.test/",

      finalUrl:
        "https://shop.test/",

      canonicalOrigin:
        "https://shop.test/",

      diagnostics: {
        redirectCount:
          1,

        robotsAvailable:
          true,

        sitemapCount:
          1,

        sitemapPageCount:
          100,

        menuSeedCount:
          10,

        seedCount:
          105,

        excludedByRobots:
          2,

        excludedOutOfScope:
          3
      }
    } as unknown as
      DiscoveryTelemetryInput[
        "bootstrap"
      ],

    profile: {
      suggestedSiteMode:
        "SALE_MIXED",

      confidence:
        "MEDIUM",

      rentalScore:
        10,

      saleScore:
        30,

      newScore:
        12,

      usedScore:
        12,

      platform:
        "CUSTOM",

      commercialEvidence:
        [
          {},
          {},
          {}
        ],

      network: {
        requestCount:
          50,

        responseCount:
          48,

        failedRequestCount:
          2,

        apiCandidateCount:
          1
      }
    } as unknown as
      DiscoveryTelemetryInput[
        "profile"
      ],

    roots: {
      candidates:
        new Array(20)
          .fill({}),

      probed: [
        {},
        {},
        {}
      ],

      roots: [
        {
          url:
            "https://shop.test/catalog",

          score:
            76
        },
        {
          url:
            "https://shop.test/used",

          score:
            61
        }
      ],

      errors:
        []
    } as unknown as
      DiscoveryTelemetryInput[
        "roots"
      ],

    graph: {
      nodes: [
        {
          url:
            "https://shop.test/p/1",

          aliases:
            [],

          score:
            55,

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
        },
        {
          url:
            "https://shop.test/p/2?variant=black",

          aliases: [
            "https://shop.test/p/2?product-id=22"
          ],

          score:
            70,

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
                "REPEATED_CARD",

              parentUrl:
                "https://shop.test/catalog",

              detail:
                null,

              weight:
                60
            }
          ]
        }
      ],

      rootsProcessed:
        2,

      catalogPagesVisited:
        4,

      interactions:
        8,

      errors:
        []
    } as unknown as
      DiscoveryTelemetryInput[
        "graph"
      ],

    timingsMs: {
      bootstrapMs:
        500,

      profileMs:
        1500,

      rootDiscoveryMs:
        2000,

      productGraphMs:
        4000
    },

    budgets: {
      rootProbeLimit:
        4,

      minimumRootScore:
        45,

      maxGraphRoots:
        3,

      maxPagesPerRoot:
        5,

      maxInteractionsPerPage:
        3,

      noNewUrlRounds:
        2
    }
  };
}


describe(
  "Discovery Telemetry V1",
  () => {

    test(
      "collects cross-stage facts without interpretation",
      () => {

        const telemetry =
          buildDiscoveryTelemetry(
            fixture()
          );


        expect(
          telemetry.schemaVersion
        ).toBe(
          "discovery-telemetry-v1"
        );


        expect(
          telemetry.bootstrap
            .sitemapPageCount
        ).toBe(100);


        expect(
          telemetry.profile
            .network
            .failedRequestCount
        ).toBe(2);


        expect(
          telemetry.roots
            .rootCount
        ).toBe(2);


        expect(
          telemetry.graph
            .nodeCount
        ).toBe(2);


        expect(
          telemetry.graph
            .catalogPagesVisited
        ).toBe(4);
      }
    );


    test(
      "accounts for evidence by source and by unique node support",
      () => {

        const telemetry =
          buildDiscoveryTelemetry(
            fixture()
          );


        expect(
          telemetry.graph
            .totalEvidenceCount
        ).toBe(5);


        expect(
          telemetry.graph
            .uniqueEvidenceCount
        ).toBe(4);


        expect(
          telemetry.graph
            .exactDuplicateEvidenceCount
        ).toBe(1);


        const sitemap =
          telemetry.graph
            .evidenceSources
            .find(
              source =>
                source.source ===
                "SITEMAP_PATTERN"
            );


        expect(
          sitemap
            ?.evidenceCount
        ).toBe(3);


        expect(
          sitemap
            ?.nodeCount
        ).toBe(2);


        const image =
          telemetry.graph
            .evidenceSources
            .find(
              source =>
                source.source ===
                "IMAGE_LINK"
            );


        expect(
          image
            ?.evidenceCount
        ).toBe(1);


        expect(
          image
            ?.nodeCount
        ).toBe(1);
      }
    );


    test(
      "records alias, query and score distributions",
      () => {

        const telemetry =
          buildDiscoveryTelemetry(
            fixture()
          );


        expect(
          telemetry.graph
            .nodesWithAliases
        ).toBe(1);


        expect(
          telemetry.graph
            .totalAliasCount
        ).toBe(1);


        expect(
          telemetry.graph
            .maxAliasesPerNode
        ).toBe(1);


        expect(
          telemetry.graph
            .queryBearingNodeCount
        ).toBe(1);


        expect(
          telemetry.graph
            .minimumScore
        ).toBe(55);


        expect(
          telemetry.graph
            .maximumScore
        ).toBe(70);


        expect(
          telemetry.graph
            .averageScore
        ).toBeCloseTo(
          62.5
        );
      }
    );


    test(
      "handles an empty graph without fake statistics",
      () => {

        const input =
          fixture();

        input.graph =
          {
            nodes:
              [],

            rootsProcessed:
              0,

            catalogPagesVisited:
              0,

            interactions:
              0,

            errors:
              []
          } as unknown as
            DiscoveryTelemetryInput[
              "graph"
            ];


        const telemetry =
          buildDiscoveryTelemetry(
            input
          );


        expect(
          telemetry.graph
            .minimumScore
        ).toBeNull();


        expect(
          telemetry.graph
            .maximumScore
        ).toBeNull();


        expect(
          telemetry.graph
            .averageScore
        ).toBeNull();


        expect(
          telemetry.graph
            .evidenceSources
        ).toEqual([]);
      }
    );

  }
);