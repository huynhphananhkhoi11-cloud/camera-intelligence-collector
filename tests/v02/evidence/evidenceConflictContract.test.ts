import {
  describe,
  expect,
  test
} from "vitest";

import {
  processProductHtml,
  type PipelineResult
} from "../../../src/v02/pipeline/productPipeline.ts";

import {
  buildEvidenceRows
} from "../../../src/v02/evidence/evidenceStore.ts";

import {
  detectConflicts
} from "../../../src/v02/conflicts/conflictEngine.ts";


type GenericRow =
  Record<
    string,
    unknown
  >;


function conflictFixture():
  PipelineResult {

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
            "Canon EOS R50 Structured",

          "itemCondition":
            "https://schema.org/UsedCondition",

          "aggregateRating": {
            "@type":
              "AggregateRating",

            "ratingValue":
              "4.8",

            "reviewCount":
              "87"
          },

          "offers": {
            "@type":
              "Offer",

            "price":
              "19000000.00",

            "priceCurrency":
              "VND",

            "availability":
              "https://schema.org/InStock"
          }
        }
        </script>
      </head>

      <body>
        <h1>
          CANON EOS R50 NEW 100%
        </h1>

        <div class="price">
          18.000.000&#273;
        </div>

        <button>
          MUA NGAY
        </button>

        <div class="rating">
          4.5/5
        </div>

        <div class="review-count">
          50 reviews
        </div>

        <div class="stock">
          H&#7871;t h&#224;ng
        </div>

        <h2>
          TH&#212;NG S&#7888; K&#7928; THU&#7852;T
        </h2>

        <div>
          Mirrorless.
          APS-C sensor.
          ISO 100-32000.
          Autofocus.
          EVF.
          4K video.
        </div>
      </body>
    </html>
  `;

  return processProductHtml(
    html,
    "https://example.com/canon-r50-conflict",
    "UNKNOWN"
  );
}


function evidenceRowsWithRunId(
  result:
    PipelineResult,
  runId:
    string
): GenericRow[] {

  /*
   * Cast only allows this RED contract to compile
   * before the Phase 9 API exists.
   *
   * Current implementation ignores argument #2,
   * therefore the runtime assertion must be RED.
   */
  const build =
    buildEvidenceRows as unknown as (
      result:
        PipelineResult,
      runId:
        string
    ) => GenericRow[];

  return build(
    result,
    runId
  );
}


function genericConflicts(
  result:
    PipelineResult
): GenericRow[] {

  return detectConflicts(
    result
  ) as unknown as
    GenericRow[];
}


function conflictFor(
  rows:
    GenericRow[],
  field:
    string
): GenericRow | undefined {

  return rows.find(
    row =>
      row.field ===
        field
  );
}


describe(
  "Phase 9B evidence and independent conflict contract",
  () => {

    test(
      "EvidenceStore carries runId on every flattened row",
      () => {

        const result =
          conflictFixture();

        const rows =
          evidenceRowsWithRunId(
            result,
            "phase9b-run-001"
          );

        expect(
          rows.length
        ).toBeGreaterThan(
          0
        );

        expect(
          rows.every(
            row =>
              row.runId ===
                "phase9b-run-001"
          )
        ).toBe(true);
      }
    );


    test(
      "resolved evidence exposes selectedValue ruleId and resolver confidence",
      () => {

        const result =
          conflictFixture();

        expect(
          result.fields.salePrice.amount
        ).toBe(
          18000000
        );

        expect(
          result.fields.salePrice.conflict
        ).toBe(true);

        expect(
          result.fields.salePrice.confidence
        ).toBe(
          0.5
        );

        const rows =
          evidenceRowsWithRunId(
            result,
            "phase9b-run-002"
          );

        const saleRows =
          rows.filter(
            row =>
              row.field ===
                "SALE_PRICE"
          );

        expect(
          saleRows.length
        ).toBeGreaterThanOrEqual(
          2
        );

        expect(
          saleRows.every(
            row =>
              row.selectedValue ===
                "18000000"
          )
        ).toBe(true);

        expect(
          saleRows.every(
            row =>
              typeof row.ruleId ===
                "string" &&
              String(
                row.ruleId
              ).trim().length >
                0
          )
        ).toBe(true);

        expect(
          saleRows.every(
            row =>
              row.confidence ===
                0.5
          )
        ).toBe(true);
      }
    );


    test(
      "sale price conflict is recomputed from independent evidence",
      () => {

        const result =
          conflictFixture();

        expect(
          result.fields.salePrice.conflict
        ).toBe(true);

        /*
         * Phase 9 conflict detection must not trust
         * this precomputed flag as its source of truth.
         */
        result.fields.salePrice.conflict =
          false;

        const conflict =
          conflictFor(
            genericConflicts(
              result
            ),
            "SALE_PRICE"
          );

        expect(
          conflict
        ).toBeDefined();

        expect(
          conflict?.severity
        ).toBe(
          "HIGH"
        );
      }
    );


    test(
      "rating mismatch is independently detected as MEDIUM",
      () => {

        const result =
          conflictFixture();

        expect(
          result.fields.rating.conflict
        ).toBe(true);

        result.fields.rating.conflict =
          false;

        const conflict =
          conflictFor(
            genericConflicts(
              result
            ),
            "RATING"
          );

        expect(
          conflict
        ).toBeDefined();

        expect(
          conflict?.severity
        ).toBe(
          "MEDIUM"
        );
      }
    );


    test(
      "contradictory stock is independently detected as HIGH",
      () => {

        const result =
          conflictFixture();

        expect(
          result.fields.stock.conflict
        ).toBe(true);

        result.fields.stock.conflict =
          false;

        const conflict =
          conflictFor(
            genericConflicts(
              result
            ),
            "STOCK"
          );

        expect(
          conflict
        ).toBeDefined();

        expect(
          conflict?.severity
        ).toBe(
          "HIGH"
        );
      }
    );


    test(
      "NEW versus USED is independently detected as HIGH",
      () => {

        const result =
          conflictFixture();

        expect(
          result.analysis.condition.conflict
        ).toBe(true);

        result.analysis.condition.conflict =
          false;

        const conflict =
          conflictFor(
            genericConflicts(
              result
            ),
            "CONDITION"
          );

        expect(
          conflict
        ).toBeDefined();

        expect(
          conflict?.severity
        ).toBe(
          "HIGH"
        );
      }
    );


    test(
      "canonical versus structured product-name mismatch is MEDIUM",
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
                  "Sony A6400"
              }
              </script>
            </head>

            <body>
              <h1>
                Canon EOS R50
              </h1>

              <h2>
                TH&#212;NG S&#7888; K&#7928; THU&#7852;T
              </h2>

              <div>
                Mirrorless.
                APS-C sensor.
                ISO 100-32000.
                Autofocus.
                EVF.
                4K video.
              </div>
            </body>
          </html>
        `;

        const result =
          processProductHtml(
            html,
            "https://example.com/name-conflict",
            "UNKNOWN"
          );

        expect(
          result.facts.title
        ).toBe(
          "Canon EOS R50"
        );

        const conflict =
          conflictFor(
            genericConflicts(
              result
            ),
            "PRODUCT_NAME"
          );

        expect(
          conflict
        ).toBeDefined();

        expect(
          conflict?.severity
        ).toBe(
          "MEDIUM"
        );
      }
    );
  }
);