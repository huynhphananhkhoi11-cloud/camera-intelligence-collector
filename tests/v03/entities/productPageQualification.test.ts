import {
  describe,
  expect,
  test
} from "vitest";

import {
  qualifyProductDetailPage
} from "../../../src/v03/entities/productPageQualification.js";

import type {
  ObservationCollectionResult
} from "../../../src/v03/observations/observationTypes.js";


function result(
  overrides:
    Partial<
      ObservationCollectionResult
    > = {}
): ObservationCollectionResult {

  return {
    identity: {
      requestedUrl:
        "https://example.com/p",
      signals: {
        requestedUrl:
          "https://example.com/p",
        finalUrl:
          "https://example.com/p",
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
          "NONE"
      },
      tokens: [
        {
          kind:
            "REQUESTED_URL",
          value:
            "https://example.com/p",
          token:
            "URL:https://example.com/p"
        }
      ]
    },
    identityId:
      "URL:https://example.com/p",
    observations:
      [],
    warnings:
      [],
    ...overrides
  };
}


describe(
  "V3 product page qualification",
  () => {

    test(
      "accepts a structured Product detail page",
      () => {

        const input =
          result({
            identity: {
              ...result().identity,
              signals: {
                ...result().identity.signals,
                primaryProductSelection:
                  "SINGLE_PRODUCT"
              }
            },
            observations: [
              {
                productIdentity:
                  "URL:https://example.com/p",
                field:
                  "PRODUCT_NAME",
                rawValue:
                  "Canon EOS R50",
                sourceKind:
                  "JSON_LD",
                sourceUrl:
                  "https://example.com/p",
                locator:
                  "Product.name"
              },
              {
                productIdentity:
                  "URL:https://example.com/p",
                field:
                  "PRICE",
                rawValue:
                  "18000000",
                sourceKind:
                  "JSON_LD",
                sourceUrl:
                  "https://example.com/p",
                locator:
                  "Product.offers[0].price"
              }
            ]
          });


        expect(
          qualifyProductDetailPage(
            input
          ).isProductDetail
        ).toBe(true);
      }
    );


    test(
      "accepts visible name plus scoped price plus purchase action",
      () => {

        const input =
          result({
            observations: [
              {
                productIdentity:
                  "URL:https://example.com/p",
                field:
                  "PRODUCT_NAME",
                rawValue:
                  "Canon EOS R50",
                sourceKind:
                  "VISIBLE_TEXT",
                sourceUrl:
                  "https://example.com/p",
                locator:
                  "h1[0]"
              },
              {
                productIdentity:
                  "URL:https://example.com/p",
                field:
                  "PRICE",
                rawValue:
                  "18.000.000đ",
                sourceKind:
                  "VISIBLE_TEXT",
                sourceUrl:
                  "https://example.com/p",
                locator:
                  "scoped-price[0]"
              },
              {
                productIdentity:
                  "URL:https://example.com/p",
                field:
                  "ACTION_TEXT",
                rawValue:
                  "Mua ngay",
                sourceKind:
                  "VISIBLE_TEXT",
                sourceUrl:
                  "https://example.com/p",
                locator:
                  "action[0]"
              }
            ]
          });


        expect(
          qualifyProductDetailPage(
            input
          ).isProductDetail
        ).toBe(true);
      }
    );


    test(
      "rejects article-style pages that mention one Product but expose no commerce evidence",
      () => {

        const base =
          result();


        const input =
          result({
            identity: {
              ...base.identity,
              signals: {
                ...base.identity.signals,
                primaryProductSelection:
                  "SINGLE_PRODUCT"
              }
            },
            observations: [
              {
                productIdentity:
                  "URL:https://example.com/review-r50",
                field:
                  "PRODUCT_NAME",
                rawValue:
                  "Canon EOS R50",
                sourceKind:
                  "JSON_LD",
                sourceUrl:
                  "https://example.com/review-r50",
                locator:
                  "Product.name"
              }
            ]
          });


        expect(
          qualifyProductDetailPage(
            input
          ).isProductDetail
        ).toBe(false);
      }
    );


    test(
      "rejects a category page even when its title contains camera words",
      () => {

        const input =
          result({
            observations: [
              {
                productIdentity:
                  "URL:https://example.com/may-anh",
                field:
                  "PRODUCT_NAME",
                rawValue:
                  "Máy ảnh Canon",
                sourceKind:
                  "VISIBLE_TEXT",
                sourceUrl:
                  "https://example.com/may-anh",
                locator:
                  "h1[0]"
              },
              {
                productIdentity:
                  "URL:https://example.com/may-anh",
                field:
                  "BREADCRUMB",
                rawValue:
                  "Máy ảnh",
                sourceKind:
                  "VISIBLE_TEXT",
                sourceUrl:
                  "https://example.com/may-anh",
                locator:
                  "breadcrumb[0]"
              }
            ]
          });


        expect(
          qualifyProductDetailPage(
            input
          )
        ).toMatchObject({
          isProductDetail:
            false,
          confidence:
            "LOW"
        });
      }
    );
  }
);
