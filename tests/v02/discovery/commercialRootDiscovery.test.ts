import {
  describe,
  expect,
  test
} from "vitest";

import {
  mergeCandidateAndProbe,
  selectCommercialRoots
} from "../../../src/v02/discovery/commercialRootDiscovery.ts";


describe(
  "Commercial Root Discovery V2",
  () => {

    test(
      "merges strong probe evidence into candidate score",
      () => {

        const merged =
          mergeCandidateAndProbe(
            {
              url:
                "https://example.com/products",

              score:
                40,

              sources: [
                "MENU"
              ],

              evidence: []
            },

            {
              url:
                "https://example.com/products",

              score:
                80,

              repeatedCardCount:
                10,

              priceNodeCount:
                10,

              linkedImageCount:
                10,

              ctaCount:
                4,

              paginationCount:
                1,

              jsonLdProductCount:
                0,

              jsonLdItemListCount:
                1,

              apiCandidateCount:
                0,

              evidence: [
                {
                  kind:
                    "REPEATED_CARDS",

                  weight:
                    30,

                  detail:
                    "cards=10"
                }
              ]
            }
          );


        expect(
          merged.initialScore
        ).toBe(
          40
        );


        expect(
          merged.score
        ).toBeGreaterThan(
          80
        );
      }
    );


    test(
      "selects multiple roots above threshold",
      () => {

        const base = {
          sources:
            ["MENU"],

          evidence: [],

          initialScore:
            30,

          probe: {
            url:
              "",

            score:
              50,

            repeatedCardCount:
              3,

            priceNodeCount:
              3,

            linkedImageCount:
              3,

            ctaCount:
              0,

            paginationCount:
              0,

            jsonLdProductCount:
              0,

            jsonLdItemListCount:
              0,

            apiCandidateCount:
              0,

            evidence: []
          }
        };


        const roots =
          selectCommercialRoots(
            [
              {
                ...base,

                url:
                  "https://example.com/rental",

                score:
                  80
              },

              {
                ...base,

                url:
                  "https://example.com/shop",

                score:
                  70
              },

              {
                ...base,

                url:
                  "https://example.com/blog",

                score:
                  20
              }
            ],
            45
          );


        expect(
          roots.map(
            root =>
              root.url
          )
        ).toEqual([
          "https://example.com/rental",
          "https://example.com/shop"
        ]);
      }
    );

  }
);