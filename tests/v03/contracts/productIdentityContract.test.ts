import {
  describe,
  expect,
  test
} from "vitest";

import {
  productIdentityKey,
  sameProductIdentity
} from "../../../src/v03/contracts/productIdentityContract.ts";


describe(
  "V3 product identity semantic contract",
  () => {

    test(
      "query variant collapses only when both pages demonstrate the same canonical product",
      () => {

        const base = {
          requestedUrl:
            "https://mayanhtop1.com/canon-eos-r50-new",
          canonicalUrl:
            "https://mayanhtop1.com/canon-eos-r50-new"
        };

        const paginationVariant = {
          requestedUrl:
            "https://mayanhtop1.com/canon-eos-r50-new?p=2",
          canonicalUrl:
            "https://mayanhtop1.com/canon-eos-r50-new"
        };

        expect(
          sameProductIdentity(
            base,
            paginationVariant
          )
        ).toBe(true);

        expect(
          productIdentityKey(
            base
          )
        ).toBe(
          productIdentityKey(
            paginationVariant
          )
        );
      }
    );


    test(
      "query parameters are not globally stripped without identity evidence",
      () => {

        const base = {
          requestedUrl:
            "https://example.com/product"
        };

        const variant = {
          requestedUrl:
            "https://example.com/product?p=2"
        };

        expect(
          sameProductIdentity(
            base,
            variant
          )
        ).toBe(false);
      }
    );


    test(
      "structured product id can provide stable identity",
      () => {

        const left = {
          requestedUrl:
            "https://example.com/catalog/a",
          structuredProductId:
            "merchant-product-123"
        };

        const right = {
          requestedUrl:
            "https://example.com/catalog/b",
          structuredProductId:
            "merchant-product-123"
        };

        expect(
          sameProductIdentity(
            left,
            right
          )
        ).toBe(true);
      }
    );
  }
);
