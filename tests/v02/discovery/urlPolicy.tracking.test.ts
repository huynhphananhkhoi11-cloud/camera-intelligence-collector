import {
  describe,
  expect,
  test
} from "vitest";

import {
  canonicalizeUrl
} from "../../../src/v02/discovery/urlPolicy.ts";


describe(
  "URL tracking canonicalization",
  () => {

    test(
      "removes srsltid from the zShop-style entry URL",
      () => {

        expect(
          canonicalizeUrl(
            "https://zshop.vn/cho-thue-may-anh/?srsltid=ABC123"
          )
        ).toBe(
          "https://zshop.vn/cho-thue-may-anh"
        );
      }
    );


    test(
      "removes the complete utm namespace",
      () => {

        expect(
          canonicalizeUrl(
            "https://example.com/product" +
            "?utm_source=google" +
            "&utm_medium=cpc" +
            "&utm_campaign=sale" +
            "&utm_id=123" +
            "&utm_source_platform=ads" +
            "&utm_future_key=future"
          )
        ).toBe(
          "https://example.com/product"
        );
      }
    );


    test(
      "removes known advertising click identifiers",
      () => {

        const keys = [
          "fbclid",
          "gclid",
          "dclid",
          "msclkid",
          "srsltid",
          "gbraid",
          "wbraid",
          "yclid",
          "ttclid",
          "twclid",
          "li_fat_id",
          "mc_cid",
          "mc_eid",
          "_gl"
        ];


        for (
          const key
          of keys
        ) {

          expect(
            canonicalizeUrl(
              `https://example.com/p/1?${key}=tracking`
            )
          ).toBe(
            "https://example.com/p/1"
          );
        }
      }
    );


    test(
      "tracking key matching is case insensitive",
      () => {

        expect(
          canonicalizeUrl(
            "https://example.com/p/1?SRSltId=abc&UTM_SOURCE=test"
          )
        ).toBe(
          "https://example.com/p/1"
        );
      }
    );


    test(
      "preserves meaningful unknown query parameters",
      () => {

        expect(
          canonicalizeUrl(
            "https://example.com/catalog?page=2&p=3&variant=red&product-id=123"
          )
        ).toBe(
          "https://example.com/catalog?page=2&p=3&variant=red&product-id=123"
        );
      }
    );


    test(
      "removes tracking while preserving meaningful query parameters",
      () => {

        expect(
          canonicalizeUrl(
            "https://example.com/product" +
            "?page=2" +
            "&utm_source=google" +
            "&variant=black" +
            "&srsltid=abc" +
            "&product-id=99" +
            "#reviews"
          )
        ).toBe(
          "https://example.com/product?page=2&variant=black&product-id=99"
        );
      }
    );


    test(
      "does not invent semantics for unknown parameters",
      () => {

        expect(
          canonicalizeUrl(
            "https://example.com/product?ref=something&foo=bar"
          )
        ).toBe(
          "https://example.com/product?ref=something&foo=bar"
        );
      }
    );

  }
);