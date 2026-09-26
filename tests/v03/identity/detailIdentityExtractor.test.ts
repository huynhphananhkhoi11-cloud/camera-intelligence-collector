import {
  describe,
  expect,
  test
} from "vitest";

import {
  extractDetailIdentitySignals
} from "../../../src/v03/identity/detailIdentityExtractor.js";


describe(
  "V3 detail identity extraction",
  () => {

    test(
      "extracts canonical and primary Product identifiers from a matching JSON-LD product",
      () => {

        const html = `
          <html>
            <head>
              <link
                rel="canonical"
                href="/canon-r50"
              >

              <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "Product",
                "@id": "https://example.com/#product-r50",
                "url": "https://example.com/canon-r50",
                "sku": "R50-001",
                "productID": "P-R50",
                "name": "Canon EOS R50"
              }
              </script>
            </head>
          </html>
        `;


        const signals =
          extractDetailIdentitySignals(
            html,
            "https://example.com/canon-r50?p=2",
            "https://example.com/canon-r50?p=2"
          );


        expect(
          signals
        ).toMatchObject({
          canonicalUrl:
            "https://example.com/canon-r50",
          structuredProductId:
            "https://example.com/#product-r50",
          structuredProductUrl:
            "https://example.com/canon-r50",
          sku:
            "R50-001",
          productId:
            "P-R50",
          productObjectCount:
            1,
          primaryProductSelection:
            "MATCHED_URL"
        });
      }
    );


    test(
      "uses the only Product object when it has no URL identity",
      () => {

        const html = `
          <script type="application/ld+json">
          {
            "@type": "Product",
            "name": "Canon EOS R50",
            "sku": "R50-001"
          }
          </script>
        `;


        const signals =
          extractDetailIdentitySignals(
            html,
            "https://example.com/canon-r50"
          );


        expect(
          signals.primaryProductSelection
        ).toBe(
          "SINGLE_PRODUCT"
        );

        expect(
          signals.sku
        ).toBe(
          "R50-001"
        );
      }
    );


    test(
      "does not borrow identifiers from ambiguous unmatched Product objects",
      () => {

        const html = `
          <script type="application/ld+json">
          [
            {
              "@type": "Product",
              "url": "https://example.com/related-a",
              "sku": "RELATED-A"
            },
            {
              "@type": "Product",
              "url": "https://example.com/related-b",
              "sku": "RELATED-B"
            }
          ]
          </script>
        `;


        const signals =
          extractDetailIdentitySignals(
            html,
            "https://example.com/canon-r50"
          );


        expect(
          signals.primaryProductSelection
        ).toBe(
          "NONE"
        );

        expect(
          signals.sku
        ).toBeNull();

        expect(
          signals.structuredProductId
        ).toBeNull();
      }
    );
  }
);
