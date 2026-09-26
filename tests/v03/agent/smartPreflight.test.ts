import {
  describe,
  expect,
  it
} from "vitest";

import {
  deterministicSmartPreflight
} from "../../../src/v03/agent/smartPreflight.js";


describe(
  "deterministic smart preflight",
  () => {

    it(
      "classifies standalone lens URL without AI",
      () => {

        const result =
          deterministicSmartPreflight(
            "https://shop.example/sony-fe-50mm-f-1.8.html"
          );


        expect(
          result
        ).toMatchObject({
          path:
            "NONE",

          disposition:
            "NON_CAMERA",

          attempts:
            0,

          model:
            null,

          reason:
            "DETERMINISTIC_CLEAR_NON_CAMERA",

          haltBatch:
            false
        });
      }
    );


    it(
      "classifies workshop/blog URL without AI",
      () => {

        const result =
          deterministicSmartPreflight(
            "https://shop.example/blogs/workshop-nhiep-anh-anh-sang.html"
          );


        expect(
          result
        ).toMatchObject({
          path:
            "NONE",

          disposition:
            "NON_CAMERA",

          reason:
            "DETERMINISTIC_CLEAR_NON_PRODUCT_CONTENT"
        });
      }
    );


    it(
      "keeps camera product URL eligible for FAST",
      () => {

        expect(
          deterministicSmartPreflight(
            "https://shop.example/canon-eos-r50-body-only.html"
          )
        ).toBeNull();
      }
    );
  }
);
