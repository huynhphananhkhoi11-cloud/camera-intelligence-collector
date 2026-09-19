import {
  describe,
  expect,
  test
} from "vitest";

import {
  buildMainPresentationRow
} from "../../../src/v03/export/mainPresentation.js";

import type {
  BulkProductRecord
} from "../../../src/v03/bulk/bulkTypes.js";

import type {
  ProductObservation
} from "../../../src/v03/observations/observationTypes.js";


function product(
  observations:
    readonly ProductObservation[]
): BulkProductRecord {

  return {
    identity: {
      identityId:
        "URL:https://example.com/canon-r50",
      memberUrls: [
        "https://example.com/canon-r50"
      ],
      tokens: [
        {
          kind:
            "CANONICAL",
          value:
            "https://example.com/canon-r50",
          token:
            "URL:https://example.com/canon-r50"
        }
      ],
      records:
        []
    },
    observations,
    entity: {
      route:
        "CAMERA",
      subtype:
        "CAMERA",
      classifier: {
        type:
          "CAMERA",
        isCamera:
          true,
        confidence:
          "MEDIUM",
        evidence:
          []
      },
      input: {
        title:
          "Canon EOS R50",
        category:
          "MÁY ẢNH CANON",
        specs:
          "",
        description:
          ""
      }
    }
  };
}


function observation(
  field:
    ProductObservation["field"],
  rawValue:
    string,
  sourceKind:
    ProductObservation["sourceKind"] =
      "VISIBLE_TEXT"
): ProductObservation {

  return {
    productIdentity:
      "URL:https://example.com/canon-r50",
    field,
    rawValue,
    sourceKind,
    sourceUrl:
      "https://example.com/canon-r50",
    locator:
      "test"
  };
}


describe(
  "V3 main-sheet presentation",
  () => {

    test(
      "equivalent observed prices collapse to one clean VND amount",
      () => {

        const row =
          buildMainPresentationRow(
            product([
              observation(
                "PRODUCT_NAME",
                "Canon EOS R50"
              ),
              observation(
                "PRICE",
                "Giá: 18.000.000đ"
              ),
              observation(
                "PRICE",
                "18000000",
                "JSON_LD"
              ),
              observation(
                "PRICE_CURRENCY",
                "VND",
                "JSON_LD"
              )
            ]),
            "https://example.com/"
          );


        expect(
          row.salePrice
        ).toBe(
          "18.000.000 VND"
        );
      }
    );


    test(
      "different observed prices display as a range",
      () => {

        const row =
          buildMainPresentationRow(
            product([
              observation(
                "PRODUCT_NAME",
                "Canon EOS R50"
              ),
              observation(
                "PRICE",
                "100.000đ"
              ),
              observation(
                "PRICE",
                "200000",
                "JSON_LD"
              ),
              observation(
                "PRICE_CURRENCY",
                "VND",
                "JSON_LD"
              )
            ]),
            "https://example.com/"
          );


        expect(
          row.salePrice
        ).toBe(
          "100.000 VND - 200.000 VND"
        );
      }
    );


    test(
      "availability URL becomes a readable state when numeric inventory is absent",
      () => {

        const row =
          buildMainPresentationRow(
            product([
              observation(
                "PRODUCT_NAME",
                "Canon EOS R50"
              ),
              observation(
                "AVAILABILITY",
                "https://schema.org/InStock",
                "JSON_LD"
              )
            ]),
            "https://example.com/"
          );


        expect(
          row.stock
        ).toBe(
          "Còn hàng"
        );
      }
    );


    test(
      "published inventory quantity takes precedence over availability state",
      () => {

        const row =
          buildMainPresentationRow(
            product([
              observation(
                "PRODUCT_NAME",
                "Canon EOS R50"
              ),
              observation(
                "AVAILABILITY",
                "https://schema.org/InStock",
                "JSON_LD"
              ),
              observation(
                "INVENTORY_LEVEL",
                "7",
                "JSON_LD"
              )
            ]),
            "https://example.com/"
          );


        expect(
          row.stock
        ).toBe(
          "7"
        );
      }
    );
  }
);
