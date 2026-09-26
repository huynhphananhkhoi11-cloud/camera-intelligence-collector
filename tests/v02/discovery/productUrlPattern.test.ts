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


        const equipmentPattern =
          patterns.find(
            pattern =>
              pattern.prefix ===
              "/equipment/"
          );


        expect(
          equipmentPattern
            ?.tailKind
        ).toBe(
          "NUMERIC"
        );


        expect(
          equipmentPattern
            ?.strongEvidenceCount
        ).toBe(
          2
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
      "keeps root-level slug patterns weak even with strong seeds",
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


        const rootPattern =
          patterns.find(
            pattern =>
              pattern.prefix ===
              "/"
          );


        expect(
          rootPattern?.score
        ).toBe(
          15
        );
      }
    );


    test(
      "infers a weak root-level pattern from repeated image links",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        for (
          const url
          of [
            "/product-alpha",
            "/product-beta",
            "/product-gamma",
            "/product-delta"
          ]
        ) {

          graph.addCandidate(
            url,
            {
              source:
                "IMAGE_LINK",

              weight:
                45
            }
          );
        }


        const patterns =
          inferProductUrlPatterns(
            graph.values()
          );


        const rootPattern =
          patterns.find(
            pattern =>
              pattern.prefix ===
              "/" &&
              pattern.tailKind ===
              "SLUG"
          );


        expect(
          rootPattern
        ).toBeDefined();


        expect(
          rootPattern
            ?.strongEvidenceCount
        ).toBe(
          0
        );


        expect(
          rootPattern
            ?.mediumEvidenceCount
        ).toBe(
          4
        );


        expect(
          rootPattern
            ?.score
        ).toBe(
          10
        );


        const scored =
          scoreSitemapProductCandidates(
            [
              "https://example.com/product-alpha",
              "https://example.com/product-beta",
              "https://example.com/product-gamma",
              "https://example.com/another-slug"
            ],
            patterns,
            "https://example.com/"
          );


        expect(
          scored
        ).toHaveLength(
          4
        );
      }
    );


    test(
      "does not infer patterns from CTA-only links",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        for (
          const url
          of [
            "/booking",
            "/checkout-now",
            "/contact-now"
          ]
        ) {

          graph.addCandidate(
            url,
            {
              source:
                "CTA_LINK",

              weight:
                60
            }
          );
        }


        expect(
          inferProductUrlPatterns(
            graph.values()
          )
        ).toEqual([]);
      }
    );

  }
);