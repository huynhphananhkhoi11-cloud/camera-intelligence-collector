import {
  describe,
  expect,
  test
} from "vitest";

import {
  redactRequestBody,
  redactUrl
} from "../../../src/v03/acquisition/networkReconRedaction.js";


describe(
  "V3 network recon redaction",
  () => {

    test(
      "redacts sensitive URL query values while preserving discovery parameters",
      () => {

        expect(
          redactUrl(
            "https://example.com/api/paging.php?page=2&token=secret&id=6"
          )
        ).toBe(
          "https://example.com/api/paging.php?page=2&token=%5BREDACTED%5D&id=6"
        );
      }
    );


    test(
      "redacts sensitive JSON fields recursively",
      () => {

        expect(
          redactRequestBody(
            JSON.stringify({
              page:
                2,

              token:
                "secret",

              nested: {
                csrf:
                  "abc",

                category:
                  6
              }
            }),
            "application/json"
          )
        ).toBe(
          JSON.stringify({
            page:
              2,

            token:
              "[REDACTED]",

            nested: {
              csrf:
                "[REDACTED]",

              category:
                6
            }
          })
        );
      }
    );


    test(
      "preserves ordinary form parameters needed for endpoint learning",
      () => {

        expect(
          redactRequestBody(
            "page=2&id=6&limit=20",
            "application/x-www-form-urlencoded"
          )
        ).toBe(
          "page=2&id=6&limit=20"
        );
      }
    );
  }
);
