import {
  describe,
  expect,
  test
} from "vitest";

import {
  buildRootCandidates,
  isHardExcludedRootUrl
} from "../../../src/v02/discovery/commercialRootCandidate.ts";

import type {
  SiteBootstrapResult
} from "../../../src/v02/discovery/siteBootstrapper.ts";


function bootstrapFixture():
  SiteBootstrapResult {

  return {
    inputUrl:
      "example.com",

    normalizedUrl:
      "https://example.com/",

    finalUrl:
      "https://example.com/",

    canonicalOrigin:
      "https://example.com/",

    redirect: {
      inputUrl:
        "example.com",

      normalizedUrl:
        "https://example.com/",

      finalUrl:
        "https://example.com/",

      canonicalOrigin:
        "https://example.com/",

      status:
        200,

      method:
        "HEAD",

      redirects: []
    },

    robots: {
      robotsUrl:
        "https://example.com/robots.txt",

      status:
        200,

      available:
        true,

      sitemapUrls: [],

      groups: [],

      rawText:
        "",

      error:
        null
    },

    sitemaps: {
      sitemapUrls: [
        "https://example.com/sitemap.xml"
      ],

      pageUrls: [
        "https://example.com/categories",
        "https://example.com/categories/1",
        "https://example.com/categories/2",
        "https://example.com/categories/3",
        "https://example.com/products/item-a",
        "https://example.com/products/item-b"
      ],

      fetched: [],

      usedFallback:
        false
    },

    menuSeeds: [
      {
        url:
          "https://example.com/categories",

        text:
          "Danh mục sản phẩm",

        confidence:
          0.85,

        reasons: [
          "navigation structure"
        ]
      }
    ],

    seeds: [
      {
        url:
          "https://example.com/",

        sources: [
          "HOMEPAGE",
          "ENTRY"
        ],

        confidence:
          1
      },

      {
        url:
          "https://example.com/categories",

        sources: [
          "MENU",
          "SITEMAP"
        ],

        confidence:
          0.85
      },

      {
        url:
          "https://example.com/cart",

        sources: [
          "MENU"
        ],

        confidence:
          0.85
      }
    ],

    diagnostics: {
      redirectCount: 0,
      robotsAvailable:
        true,
      sitemapCount: 1,
      sitemapPageCount: 6,
      menuSeedCount: 1,
      seedCount: 3,
      excludedByRobots: 0,
      excludedOutOfScope: 0
    }
  };
}


describe(
  "Commercial Root Candidate Engine",
  () => {

    test(
      "ranks a commercial category seed above homepage",
      () => {

        const candidates =
          buildRootCandidates(
            bootstrapFixture()
          );


        expect(
          candidates[0]?.url
        ).toBe(
          "https://example.com/categories"
        );


        expect(
          candidates[0]?.score
        ).toBeGreaterThan(
          candidates.find(
            candidate =>
              candidate.url ===
              "https://example.com/"
          )?.score ??
          0
        );


        expect(
          candidates[0]
            ?.evidence
            .some(
              evidence =>
                evidence.kind ===
                "SITEMAP_CLUSTER"
            )
        ).toBe(true);
      }
    );


    test(
      "hard excludes utility pages",
      () => {

        expect(
          isHardExcludedRootUrl(
            "https://example.com/cart"
          )
        ).toBe(true);


        expect(
          isHardExcludedRootUrl(
            "https://example.com/checkout"
          )
        ).toBe(true);


        const candidates =
          buildRootCandidates(
            bootstrapFixture()
          );


        expect(
          candidates.some(
            candidate =>
              candidate.url.endsWith(
                "/cart"
              )
          )
        ).toBe(false);
      }
    );


    test(
      "does not require camera or brand keyword",
      () => {

        const fixture =
          bootstrapFixture();

        fixture.menuSeeds = [
          {
            url:
              "https://example.com/store",

            text:
              "Store",

            confidence:
              0.85,

            reasons: [
              "navigation structure"
            ]
          }
        ];

        fixture.seeds = [
          {
            url:
              "https://example.com/store",

            sources: [
              "MENU"
            ],

            confidence:
              0.85
          }
        ];


        const candidates =
          buildRootCandidates(
            fixture
          );


        expect(
          candidates[0]?.url
        ).toBe(
          "https://example.com/store"
        );


        expect(
          candidates[0]?.score
        ).toBeGreaterThanOrEqual(
          35
        );
      }
    );

  }
);