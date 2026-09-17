import {
  describe,
  expect,
  test
} from "vitest";

import {
  ProductUrlGraph
} from "../../../src/v02/discovery/productUrlGraph.ts";


describe(
  "ProductUrlGraph",
  () => {

    test(
      "canonical-dedupes candidates and merges evidence",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        graph.addCandidate(
          "https://example.com/product/a#specs",
          {
            source:
              "REPEATED_CARD",

            parentUrl:
              "https://example.com/catalog",

            weight:
              80
          }
        );


        graph.addCandidate(
          "/product/a",
          {
            source:
              "JSON_LD_PRODUCT",

            parentUrl:
              "https://example.com/catalog",

            weight:
              90
          }
        );


        expect(
          graph.size
        ).toBe(1);


        const node =
          graph.values()[0];


        expect(
          node?.evidence.length
        ).toBe(2);

        expect(
          node?.score
        ).toBe(100);
      }
    );


    test(
      "merges alternate URLs when product ID matches",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        graph.addCandidate(
          "/product/alpha",
          {
            source:
              "API_ITEM",

            productId:
              123,

            weight:
              85
          }
        );


        graph.addCandidate(
          "/p/123",
          {
            source:
              "JSON_LD_PRODUCT",

            productId:
              "123",

            weight:
              90
          }
        );


        expect(
          graph.size
        ).toBe(1);


        expect(
          graph.values()[0]
            ?.aliases
        ).toContain(
          "https://example.com/p/123"
        );
      }
    );


    test(
      "does not filter non-camera inventory before detail",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        const urls = [
          "/canon-m",
          "/may-in-photo",
          "/lens-24-70",
          "/photobooth",
          "/tui-may-anh"
        ];


        for (
          const url
          of urls
        ) {

          graph.addCandidate(
            url,
            {
              source:
                "REPEATED_CARD",

              parentUrl:
                "https://example.com/catalog",

              weight:
                80
            }
          );
        }


        expect(
          graph.size
        ).toBe(5);
      }
    );


    test(
      "rejects out-of-origin and utility URLs",
      () => {

        const graph =
          new ProductUrlGraph(
            "https://example.com/"
          );


        expect(
          graph.addCandidate(
            "https://other.com/p/1",
            {
              source:
                "REPEATED_CARD"
            }
          )
        ).toBeNull();


        expect(
          graph.addCandidate(
            "/cart",
            {
              source:
                "REPEATED_CARD"
            }
          )
        ).toBeNull();
      }
    );

  }
);