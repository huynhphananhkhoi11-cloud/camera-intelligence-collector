import {
  describe,
  expect,
  test
} from "vitest";

import {
  processProductHtml
} from "../../../src/v02/pipeline/productPipeline.ts";

import {
  detectConflicts
} from "../../../src/v02/conflicts/conflictEngine.ts";

describe(
  "Conflict Engine V2",
  () => {
    test(
      "detects conflicting visible and structured sale prices",
      () => {
        const html = `
          <html>
            <head>
              <script type="application/ld+json">
              {
                "@context":
                  "https://schema.org",

                "@type":
                  "Product",

                "name":
                  "Canon EOS R",

                "offers": {
                  "@type":
                    "Offer",

                  "price":
                    "19000000.00",

                  "priceCurrency":
                    "VND"
                }
              }
              </script>
            </head>

            <body>
              <nav class="breadcrumb">
                <a>Home</a>
                <a>M\u00c1Y \u1ea2NH C\u0168</a>
                <a>Canon EOS R</a>
              </nav>

              <h1>
                CANON EOS R H\u00c0NG C\u0168
              </h1>

              <div class="price">
                18.000.000\u0111
              </div>

              <button>
                MUA NGAY
              </button>

              <h2>
                TH\u00d4NG S\u1ed0 K\u1ef8 THU\u1eacT
              </h2>

              <div>
                Mirrorless.
                C\u1ea3m bi\u1ebfn Full Frame.
                ISO 100-40000.
                Dual Pixel AF.
                EVF.
                Quay video 4K.
              </div>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/eos-r",
            "SALE_MIXED"
          );

        expect(
          result.fields.salePrice.amount
        ).toBe(18000000);

        expect(
          result.fields.salePrice.evidence.some(
            evidence =>
              evidence.source ===
                "VISIBLE" &&
              evidence.raw.includes(
                "18.000.000"
              )
          )
        ).toBe(true);

        expect(
          result.fields.salePrice.evidence.some(
            evidence =>
              evidence.source ===
                "JSON_LD" &&
              evidence.raw.includes(
                "19000000"
              )
          )
        ).toBe(true);

        expect(
          result.fields.salePrice.conflict
        ).toBe(true);

        const conflicts =
          detectConflicts(
            result
          );

        expect(
          conflicts.some(
            row =>
              row.field ===
                "SALE_PRICE" &&
              row.severity ===
                "REVIEW"
          )
        ).toBe(true);
      }
    );
  }
);
