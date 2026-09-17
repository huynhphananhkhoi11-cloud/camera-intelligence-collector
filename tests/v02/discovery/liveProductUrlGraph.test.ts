import {
  describe,
  expect,
  test
} from "vitest";

import {
  createCatalogPageQueue
} from "../../../src/v02/discovery/liveProductUrlGraph.ts";


describe(
  "live Product URL Graph helpers",
  () => {

    test(
      "dedupes pagination URLs and respects page budget",
      () => {

        const queue =
          createCatalogPageQueue(
            "https://example.com/catalog",
            [
              "https://example.com/catalog?page=2",
              "https://example.com/catalog?page=2",
              "https://example.com/catalog?page=3",
              "https://other.com/catalog?page=4"
            ],
            3
          );


        expect(
          queue
        ).toEqual([
          "https://example.com/catalog",
          "https://example.com/catalog?page=2",
          "https://example.com/catalog?page=3"
        ]);
      }
    );

  }
);