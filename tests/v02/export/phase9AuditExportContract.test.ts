import {
  afterEach,
  describe,
  expect,
  test
} from "vitest";

import ExcelJS from "exceljs";

import {
  existsSync
} from "node:fs";

import {
  rm
} from "node:fs/promises";

import {
  resolve
} from "node:path";

import {
  processProductHtml
} from "../../../src/v02/pipeline/productPipeline.ts";

import {
  computeCoverage
} from "../../../src/v02/coverage/coverageEngine.ts";

import {
  exportWorkbookV2
} from "../../../src/v02/export/excelExporterV2.ts";


const outputPath =
  resolve(
    process.cwd(),
    "output",
    "__phase9_audit_export_contract.xlsx"
  );


afterEach(
  async () => {

    if (
      existsSync(
        outputPath
      )
    ) {
      await rm(
        outputPath,
        {
          force:
            true
        }
      );
    }
  }
);


function cameraHtml():
  string {

  return `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@context":
            "https://schema.org",

          "@type":
            "Product",

          "name":
            "Canon EOS R50",

          "itemCondition":
            "https://schema.org/NewCondition",

          "offers": {
            "@type":
              "Offer",

            "price":
              "18000000.00",

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
          Canon EOS R50 NEW 100%
        </h1>

        <div class="price">
          18.000.000&#273;
        </div>

        <button>
          MUA NGAY
        </button>

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
}


describe(
  "Phase 9 audit export contract",
  () => {

    test(
      "exports run-scoped evidence, reconciliation and technical errors",
      async () => {

        const runId =
          "phase9-export-run-001";

        const successUrl =
          "https://example.com/canon-r50";

        const failedUrl =
          "https://example.com/failure";

        const result =
          processProductHtml(
            cameraHtml(),
            successUrl,
            "UNKNOWN"
          );

        const coverage =
          computeCoverage({
            catalogPagesDiscovered:
              1,

            catalogPagesVisited:
              1,

            productUrlsDiscovered:
              2,

            detailPagesAttempted:
              2,

            detailPagesCompleted:
              1,

            results: [
              result
            ]
          });

        await exportWorkbookV2(
          outputPath,
          {
            runId,

            results: [
              result
            ],

            coverage,

            reconciliation: {
              runId,

              discovered:
                2,

              accepted:
                1,

              review:
                0,

              excluded:
                0,

              error:
                1,

              inProgress:
                0,

              accounted:
                2,

              balanced:
                true,

              complete:
                true
            },

            errors: [
              {
                runId,

                url:
                  failedUrl,

                stage:
                  "DETAIL",

                errorClass:
                  "TimeoutError",

                message:
                  "navigation timed out",

                attempts:
                  1,

                lastStatus:
                  null,

                retriable:
                  true,

                diagnosticPath:
                  null
              }
            ],

            audit:
              []
          }
        );

        expect(
          existsSync(
            outputPath
          )
        ).toBe(true);

        const workbook =
          new ExcelJS.Workbook();

        await workbook.xlsx.readFile(
          outputPath
        );


        const evidence =
          workbook.getWorksheet(
            "Evidence"
          );

        expect(
          evidence
        ).toBeDefined();

        expect(
          evidence?.getCell(
            "A1"
          ).value
        ).toBe(
          "Run ID"
        );

        expect(
          evidence?.getCell(
            "F1"
          ).value
        ).toBe(
          "Selected value"
        );

        expect(
          evidence?.getCell(
            "K1"
          ).value
        ).toBe(
          "Rule ID"
        );

        expect(
          evidence?.getCell(
            "A2"
          ).value
        ).toBe(
          runId
        );

        expect(
          String(
            evidence?.getCell(
              "F2"
            ).value ??
            ""
          ).length
        ).toBeGreaterThan(
          0
        );

        expect(
          String(
            evidence?.getCell(
              "K2"
            ).value ??
            ""
          ).length
        ).toBeGreaterThan(
          0
        );


        const errors =
          workbook.getWorksheet(
            "Errors"
          );

        expect(
          errors
        ).toBeDefined();

        expect(
          errors?.getCell(
            "A1"
          ).value
        ).toBe(
          "Run ID"
        );

        expect(
          errors?.getCell(
            "A2"
          ).value
        ).toBe(
          runId
        );

        expect(
          errors?.getCell(
            "B2"
          ).value
        ).toBe(
          failedUrl
        );

        expect(
          errors?.getCell(
            "C2"
          ).value
        ).toBe(
          "DETAIL"
        );

        expect(
          errors?.getCell(
            "D2"
          ).value
        ).toBe(
          "TimeoutError"
        );

        expect(
          errors?.getCell(
            "F2"
          ).value
        ).toBe(
          1
        );

        expect(
          errors?.getCell(
            "H2"
          ).value
        ).toBe(true);


        const coverageSheet =
          workbook.getWorksheet(
            "Coverage"
          );

        expect(
          coverageSheet
        ).toBeDefined();


        const findCoverageValue = (
          label:
            string
        ): unknown => {

          if (!coverageSheet) {
            return undefined;
          }

          for (
            let row = 1;
            row <=
              coverageSheet.rowCount;
            row++
          ) {
            if (
              coverageSheet
                .getCell(
                  row,
                  1
                )
                .value ===
              label
            ) {
              return coverageSheet
                .getCell(
                  row,
                  2
                )
                .value;
            }
          }

          return undefined;
        };


        expect(
          findCoverageValue(
            "Reconciliation"
          )
        ).toBe(
          "PASS"
        );

        expect(
          findCoverageValue(
            "Discovered URLs"
          )
        ).toBe(
          2
        );

        expect(
          findCoverageValue(
            "Terminal ERROR"
          )
        ).toBe(
          1
        );

        expect(
          findCoverageValue(
            "In progress"
          )
        ).toBe(
          0
        );

        expect(
          findCoverageValue(
            "Run complete"
          )
        ).toBe(
          "YES"
        );


        const main =
          workbook.getWorksheet(
            "Dữ liệu đối thủ"
          );

        expect(
          main?.columnCount
        ).toBe(
          13
        );
      }
    );
  }
);