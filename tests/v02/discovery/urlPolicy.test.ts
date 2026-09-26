import {
  describe,
  expect,
  test
} from "vitest";

import {
  canonicalizeUrl,
  getCanonicalOrigin,
  isUrlInScope,
  normalizeSiteInput
} from "../../../src/v02/discovery/urlPolicy.ts";


describe(
  "URL Policy V2",
  () => {

    test(
      "normalizes schemeless site input",
      () => {

        expect(
          normalizeSiteInput(
            "  example.com/catalog/?utm_source=test#top  "
          )
        ).toBe(
          "https://example.com/catalog"
        );
      }
    );


    test(
      "keeps explicit http scheme",
      () => {

        expect(
          normalizeSiteInput(
            "http://example.com/catalog/"
          )
        ).toBe(
          "http://example.com/catalog"
        );
      }
    );


    test(
      "supports host and port",
      () => {

        expect(
          normalizeSiteInput(
            "localhost:3000/catalog/"
          )
        ).toBe(
          "https://localhost:3000/catalog"
        );
      }
    );


    test(
      "supports protocol-relative input",
      () => {

        expect(
          normalizeSiteInput(
            "//example.com/catalog/"
          )
        ).toBe(
          "https://example.com/catalog"
        );
      }
    );


    test(
      "rejects non-http protocols",
      () => {

        expect(
          normalizeSiteInput(
            "javascript:alert(1)"
          )
        ).toBeNull();

        expect(
          normalizeSiteInput(
            "mailto:test@example.com"
          )
        ).toBeNull();

        expect(
          normalizeSiteInput(
            "ftp://example.com/file"
          )
        ).toBeNull();
      }
    );


    test(
      "rejects embedded credentials",
      () => {

        expect(
          normalizeSiteInput(
            "https://user:password@example.com/catalog"
          )
        ).toBeNull();
      }
    );


    test(
      "canonicalizes relative URLs",
      () => {

        expect(
          canonicalizeUrl(
            "../product/camera/?utm_medium=email#spec",
            "https://example.com/catalog/list/"
          )
        ).toBe(
          "https://example.com/catalog/product/camera"
        );
      }
    );


    test(
      "removes tracking params but keeps business params",
      () => {

        expect(
          canonicalizeUrl(
            "/products?page=2&utm_campaign=sale&fbclid=abc",
            "https://example.com/catalog"
          )
        ).toBe(
          "https://example.com/products?page=2"
        );
      }
    );


    test(
      "tracking param matching is case insensitive",
      () => {

        expect(
          canonicalizeUrl(
            "/products?UTM_Source=test&page=3",
            "https://example.com"
          )
        ).toBe(
          "https://example.com/products?page=3"
        );
      }
    );


    test(
      "returns canonical site origin",
      () => {

        expect(
          getCanonicalOrigin(
            "HTTPS://Example.COM:443/catalog?page=2#top"
          )
        ).toBe(
          "https://example.com/"
        );
      }
    );


    test(
      "accepts same origin and rejects other origins",
      () => {

        expect(
          isUrlInScope(
            "/product/1",
            "https://example.com/catalog"
          )
        ).toBe(true);

        expect(
          isUrlInScope(
            "https://cdn.example.com/product/1",
            "https://example.com"
          )
        ).toBe(false);
      }
    );


    test(
      "different ports are different origins",
      () => {

        expect(
          isUrlInScope(
            "https://example.com:8443/product/1",
            "https://example.com"
          )
        ).toBe(false);
      }
    );


    test(
      "supports explicit allowed origin aliases",
      () => {

        expect(
          isUrlInScope(
            "https://shop.example.com/product/1",
            "https://example.com",
            [
              "https://shop.example.com"
            ]
          )
        ).toBe(true);
      }
    );
  }
);