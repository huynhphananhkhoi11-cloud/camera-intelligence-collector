import {
  describe,
  expect,
  test
} from "vitest";

import {
  ProductUrlGraph
} from "../../../src/v02/discovery/productUrlGraph.ts";

import {
  inferProductUrlPatterns,
  scoreSitemapProductCandidates
} from "../../../src/v02/discovery/productUrlPattern.ts";


describe(
  "product URL pattern inference",
  () => {

    test(
      "infers numeric product path from strong seeds",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        graph.addCandidate(
          "/equipment/101",
          {
            source:
              "REPEATED_CARD",
            weight:
              80
          }
        );

        graph.addCandidate(
          "/equipment/102",
          {
            source:
              "REPEATED_CARD",
            weight:
              80
          }
        );


        const patterns =
          inferProductUrlPatterns(
            graph.values()
          );


        expect(
          patterns[0]
            ?.prefix
        ).toBe(
          "/equipment/"
        );


        const scored =
          scoreSitemapProductCandidates(
            [
              "https://example.com/equipment/103",
              "https://example.com/blog/103",
              "https://example.com/equipment/foo"
            ],
            patterns,
            "https://example.com/"
          );


        expect(
          scored.map(
            item =>
              item.url
          )
        ).toEqual([
          "https://example.com/equipment/103"
        ]);
      }
    );


    test(
      "keeps root-level slug patterns weak",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        graph.addCandidate(
          "/canon-r50-new",
          {
            source:
              "JSON_LD_PRODUCT",
            weight:
              95
          }
        );

        graph.addCandidate(
          "/sony-a7-old",
          {
            source:
              "JSON_LD_PRODUCT",
            weight:
              95
          }
        );


        const patterns =
          inferProductUrlPatterns(
            graph.values()
          );


        expect(
          patterns[0]
            ?.score
        ).toBe(
          15
        );
      }
    );

  }
);