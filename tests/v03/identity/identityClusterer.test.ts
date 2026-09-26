import {
  describe,
  expect,
  test
} from "vitest";

import {
  createProductIdentityRecord,
  resolveProductIdentities
} from "../../../src/v03/identity/identityClusterer.js";

import type {
  DetailIdentitySignals
} from "../../../src/v03/identity/productIdentityTypes.js";


function signals(
  overrides:
    Partial<
      DetailIdentitySignals
    > = {}
): DetailIdentitySignals {

  return {
    requestedUrl:
      "https://example.com/product",
    finalUrl:
      "https://example.com/product",
    canonicalUrl:
      null,
    structuredProductId:
      null,
    sku:
      null,
    productId:
      null,
    structuredProductUrl:
      null,
    productObjectCount:
      0,
    primaryProductSelection:
      "NONE",
    ...overrides
  };
}


describe(
  "V3 deterministic product identity clustering",
  () => {

    test(
      "R50 and R50?p=2 collapse only when canonical evidence overlaps",
      () => {

        const records = [
          createProductIdentityRecord(
            signals({
              requestedUrl:
                "https://example.com/canon-r50",
              finalUrl:
                "https://example.com/canon-r50",
              canonicalUrl:
                "https://example.com/canon-r50"
            })
          ),
          createProductIdentityRecord(
            signals({
              requestedUrl:
                "https://example.com/canon-r50?p=2",
              finalUrl:
                "https://example.com/canon-r50?p=2",
              canonicalUrl:
                "https://example.com/canon-r50"
            })
          )
        ];


        const resolution =
          resolveProductIdentities(
            records
          );


        expect(
          resolution.clusters
        ).toHaveLength(
          1
        );

        expect(
          resolution.clusters[0]
            ?.memberUrls
        ).toEqual([
          "https://example.com/canon-r50",
          "https://example.com/canon-r50?p=2"
        ]);
      }
    );


    test(
      "canonical target bridges to the actual requested URL record even if that target page has no canonical tag",
      () => {

        const resolution =
          resolveProductIdentities([
            createProductIdentityRecord(
              signals({
                requestedUrl:
                  "https://example.com/canon-r50",
                finalUrl:
                  "https://example.com/canon-r50"
              })
            ),
            createProductIdentityRecord(
              signals({
                requestedUrl:
                  "https://example.com/canon-r50?p=2",
                finalUrl:
                  "https://example.com/canon-r50?p=2",
                canonicalUrl:
                  "https://example.com/canon-r50"
              })
            )
          ]);


        expect(
          resolution.clusters
        ).toHaveLength(
          1
        );

        expect(
          resolution.clusters[0]
            ?.tokens.find(
              token =>
                token.token ===
                  "URL:https://example.com/canon-r50"
            )?.kind
        ).toBe(
          "CANONICAL"
        );
      }
    );


    test(
      "query variants remain separate when no strong identity signal overlaps",
      () => {

        const resolution =
          resolveProductIdentities([
            createProductIdentityRecord(
              signals({
                requestedUrl:
                  "https://example.com/product",
                finalUrl:
                  "https://example.com/product"
              })
            ),
            createProductIdentityRecord(
              signals({
                requestedUrl:
                  "https://example.com/product?p=2",
                finalUrl:
                  "https://example.com/product?p=2"
              })
            )
          ]);


        expect(
          resolution.clusters
        ).toHaveLength(
          2
        );
      }
    );


    test(
      "shared merchant SKU bridges pages even when only one page also has canonical evidence",
      () => {

        const resolution =
          resolveProductIdentities([
            createProductIdentityRecord(
              signals({
                requestedUrl:
                  "https://example.com/a",
                finalUrl:
                  "https://example.com/a",
                canonicalUrl:
                  "https://example.com/a",
                sku:
                  "SKU-123"
              })
            ),
            createProductIdentityRecord(
              signals({
                requestedUrl:
                  "https://example.com/b",
                finalUrl:
                  "https://example.com/b",
                sku:
                  "SKU-123"
              })
            )
          ]);


        expect(
          resolution.clusters
        ).toHaveLength(
          1
        );

        expect(
          resolution.clusters[0]
            ?.identityId
        ).toBe(
          "URL:https://example.com/a"
        );
      }
    );


    test(
      "same SKU on different origins does not merge",
      () => {

        const resolution =
          resolveProductIdentities([
            createProductIdentityRecord(
              signals({
                requestedUrl:
                  "https://shop-a.example/p",
                finalUrl:
                  "https://shop-a.example/p",
                sku:
                  "SKU-123"
              })
            ),
            createProductIdentityRecord(
              signals({
                requestedUrl:
                  "https://shop-b.example/p",
                finalUrl:
                  "https://shop-b.example/p",
                sku:
                  "SKU-123"
              })
            )
          ]);


        expect(
          resolution.clusters
        ).toHaveLength(
          2
        );
      }
    );


    test(
      "identity output is deterministic regardless of input ordering",
      () => {

        const first =
          createProductIdentityRecord(
            signals({
              requestedUrl:
                "https://example.com/a",
              finalUrl:
                "https://example.com/a",
              canonicalUrl:
                "https://example.com/product"
            })
          );


        const second =
          createProductIdentityRecord(
            signals({
              requestedUrl:
                "https://example.com/b",
              finalUrl:
                "https://example.com/b",
              canonicalUrl:
                "https://example.com/product"
            })
          );


        const forward =
          resolveProductIdentities([
            first,
            second
          ]);


        const reverse =
          resolveProductIdentities([
            second,
            first
          ]);


        expect(
          reverse
        ).toEqual(
          forward
        );
      }
    );
  }
);
