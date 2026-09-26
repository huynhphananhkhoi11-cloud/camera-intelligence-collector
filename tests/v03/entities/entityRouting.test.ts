import {
  describe,
  expect,
  test
} from "vitest";

import {
  routeEntityFromObservations
} from "../../../src/v03/entities/entityRouting.js";

import type {
  ProductObservation
} from "../../../src/v03/observations/observationTypes.js";


function observation(
  field:
    ProductObservation["field"],
  rawValue:
    string
): ProductObservation {

  return {
    productIdentity:
      "URL:https://example.com/p",
    field,
    rawValue,
    sourceKind:
      "VISIBLE_TEXT",
    sourceUrl:
      "https://example.com/p",
    locator:
      "test"
  };
}


describe(
  "V3 entity routing from observations",
  () => {

    test(
      "routes a camera using observed name and category without resolving field truth",
      () => {

        const result =
          routeEntityFromObservations([
            observation(
              "PRODUCT_NAME",
              "Canon EOS R50"
            ),
            observation(
              "CATEGORY",
              "MÁY ẢNH CANON"
            )
          ]);


        expect(
          result.route
        ).toBe(
          "CAMERA"
        );

        expect(
          result.subtype
        ).toBe(
          "CAMERA"
        );
      }
    );


    test(
      "routes a lens away from the main camera dataset",
      () => {

        const result =
          routeEntityFromObservations([
            observation(
              "PRODUCT_NAME",
              "Canon EF 50mm f/1.8"
            ),
            observation(
              "CATEGORY",
              "ỐNG KÍNH CANON"
            )
          ]);


        expect(
          result.route
        ).toBe(
          "NON_CAMERA"
        );

        expect(
          result.subtype
        ).toBe(
          "LENS"
        );
      }
    );


    test(
      "keeps weak evidence uncertain",
      () => {

        const result =
          routeEntityFromObservations([
            observation(
              "PRODUCT_NAME",
              "Mystery Item 123"
            )
          ]);


        expect(
          result.route
        ).toBe(
          "UNCERTAIN"
        );
      }
    );
  }
);
