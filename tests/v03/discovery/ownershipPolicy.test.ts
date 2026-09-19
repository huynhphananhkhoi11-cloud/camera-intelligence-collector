import {
  describe,
  expect,
  test
} from "vitest";

import {
  decideDiscoveryTraversal
} from "../../../src/v03/discovery/ownershipPolicy.js";


describe(
  "V3 discovery ownership policy",
  () => {

    test(
      "listing-owned pagination may be followed as catalog traversal",
      () => {

        expect(
          decideDiscoveryTraversal({
            url:
              "https://example.com/catalog?page=2",
            parentUrl:
              "https://example.com/catalog",
            sourceKind:
              "STATIC_HTML",
            ownerKind:
              "LISTING",
            relation:
              "PAGINATION"
          })
        ).toBe(
          "FOLLOW_LISTING_PAGINATION"
        );
      }
    );


    test(
      "product-detail-owned pagination is not promoted to catalog traversal",
      () => {

        expect(
          decideDiscoveryTraversal({
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
          })
        ).toBe(
          "DO_NOT_TRAVERSE"
        );
      }
    );


    test(
      "related-product links remain detail candidates without becoming pagination",
      () => {

        expect(
          decideDiscoveryTraversal({
            url:
              "https://example.com/canon-r8",
            parentUrl:
              "https://example.com/canon-r50",
            sourceKind:
              "DETAIL_PAGE",
            ownerKind:
              "PRODUCT_DETAIL",
            relation:
              "RELATED_PRODUCT"
          })
        ).toBe(
          "DETAIL_CANDIDATE"
        );
      }
    );
  }
);
