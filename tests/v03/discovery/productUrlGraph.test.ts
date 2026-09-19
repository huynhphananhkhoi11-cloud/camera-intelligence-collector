import {
  describe,
  expect,
  test
} from "vitest";

import {
  ProductUrlGraph
} from "../../../src/v03/discovery/productUrlGraph.js";


describe(
  "V3 ProductUrlGraph",
  () => {

    test(
      "does not collapse query variants before product identity evidence exists",
      () => {

        const graph =
          new ProductUrlGraph();


        graph.add({
          url:
            "https://example.com/canon-r50",
          parentUrl:
            "https://example.com/catalog",
          sourceKind:
            "STATIC_HTML",
          ownerKind:
            "LISTING",
          relation:
            "PRODUCT_LINK"
        });


        graph.add({
          url:
            "https://example.com/canon-r50?p=2",
          parentUrl:
            "https://example.com/canon-r50",
          sourceKind:
            "DETAIL_PAGE",
          ownerKind:
            "PRODUCT_DETAIL",
          relation:
            "PAGINATION"
        });


        expect(
          graph.snapshot().nodes.map(
            node =>
              node.url
          )
        ).toEqual([
          "https://example.com/canon-r50",
          "https://example.com/canon-r50?p=2"
        ]);
      }
    );


    test(
      "preserves multiple provenance observations for the same exact URL",
      () => {

        const graph =
          new ProductUrlGraph();


        graph.add({
          url:
            "https://example.com/canon-r50",
          parentUrl:
            "https://example.com/catalog-a",
          sourceKind:
            "STATIC_HTML",
          ownerKind:
            "LISTING",
          relation:
            "PRODUCT_LINK",
          sourceRef:
            "a"
        });


        graph.add({
          url:
            "https://example.com/canon-r50",
          parentUrl:
            "https://example.com/api/list",
          sourceKind:
            "ENDPOINT_REPLAY",
          ownerKind:
            "ENDPOINT_RESPONSE",
          relation:
            "PRODUCT_LINK",
          sourceRef:
            "b"
        });


        const node =
          graph.get(
            "https://example.com/canon-r50"
          );


        expect(
          node?.evidence
        ).toHaveLength(
          2
        );
      }
    );


    test(
      "collapses only exact duplicate evidence",
      () => {

        const graph =
          new ProductUrlGraph();


        const evidence = {
          url:
            "https://example.com/canon-r50#details",
          parentUrl:
            "https://example.com/catalog",
          sourceKind:
            "STATIC_HTML" as const,
          ownerKind:
            "LISTING" as const,
          relation:
            "PRODUCT_LINK" as const,
          sourceRef:
            "same"
        };


        graph.add(
          evidence
        );

        graph.add(
          evidence
        );


        const node =
          graph.get(
            "https://example.com/canon-r50"
          );


        expect(
          node?.url
        ).toBe(
          "https://example.com/canon-r50"
        );

        expect(
          node?.evidence
        ).toHaveLength(
          1
        );
      }
    );
  }
);
