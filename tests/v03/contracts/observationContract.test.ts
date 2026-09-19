import {
  describe,
  expect,
  test
} from "vitest";

import {
  isMainExportEligible,
  preserveUniqueObservations
} from "../../../src/v03/contracts/observationContract.ts";


describe(
  "V3 observation-first semantic contract",
  () => {

    test(
      "conflicting condition observations are both preserved and a confirmed camera remains exportable",
      () => {

        const observations =
          preserveUniqueObservations([
            {
              productIdentity:
                "CANONICAL:https://example.com/canon-r50",
              field:
                "CONDITION",
              rawValue:
                "NEW 100%",
              sourceKind:
                "VISIBLE_TEXT",
              sourceUrl:
                "https://example.com/canon-r50",
              locator:
                "h1"
            },
            {
              productIdentity:
                "CANONICAL:https://example.com/canon-r50",
              field:
                "CONDITION",
              rawValue:
                "https://schema.org/UsedCondition",
              sourceKind:
                "JSON_LD",
              sourceUrl:
                "https://example.com/canon-r50",
              locator:
                "Product.offers.itemCondition"
            }
          ]);

        expect(
          observations
        ).toHaveLength(
          2
        );

        expect(
          observations.map(
            observation =>
              observation.rawValue
          )
        ).toEqual([
          "NEW 100%",
          "https://schema.org/UsedCondition"
        ]);

        expect(
          isMainExportEligible(
            "CAMERA"
          )
        ).toBe(true);
      }
    );


    test(
      "only exact duplicate evidence is collapsed",
      () => {

        const observation = {
          productIdentity:
            "CANONICAL:https://example.com/canon-r50",
          field:
            "SALE_PRICE",
          rawValue:
            "18.000.000đ",
          sourceKind:
            "VISIBLE_TEXT" as const,
          sourceUrl:
            "https://example.com/canon-r50",
          locator:
            ".price"
        };

        const observations =
          preserveUniqueObservations([
            observation,
            observation,
            {
              ...observation,
              sourceKind:
                "JSON_LD" as const,
              rawValue:
                "18000000",
              locator:
                "Product.offers.price"
            }
          ]);

        expect(
          observations
        ).toHaveLength(
          2
        );
      }
    );


    test(
      "uncertain entities are not main-export eligible",
      () => {

        expect(
          isMainExportEligible(
            "UNCERTAIN"
          )
        ).toBe(false);

        expect(
          isMainExportEligible(
            "NON_CAMERA"
          )
        ).toBe(false);
      }
    );
  }
);
