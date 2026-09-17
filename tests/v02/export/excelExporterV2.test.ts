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
    "__v02_export_test.xlsx"
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


describe(
  "Excel Exporter V2",
  () => {

    test(
      "creates the production workbook sheets",
      async () => {

        const html = `
          <nav class="breadcrumb">
            <a>Home</a>
            <a>THU\u00ca M\u00c1Y \u1ea2NH</a>
            <a>Sony A6400</a>
          </nav>

          <h1>Sony A6400</h1>

          <div class="price">
            360.000\u0111/ng\u00e0y
          </div>

          <button>
            THU\u00ca NGAY
          </button>

          <h2>
            TH\u00d4NG S\u1ed0 K\u1ef8 THU\u1eacT
          </h2>

          <div>
            Mirrorless.
            C\u1ea3m bi\u1ebfn APS-C.
            ISO 100-32000.
            AF 425 \u0111i\u1ec3m.
            EVF.
            Quay video 4K.
          </div>
        `;


        const result =
          processProductHtml(
            html,
            "https://example.com/a6400",
            "RENTAL"
          );


        const coverage =
          computeCoverage({
            catalogPagesDiscovered:
              1,

            catalogPagesVisited:
              1,

            productUrlsDiscovered:
              1,

            detailPagesAttempted:
              1,

            detailPagesCompleted:
              1,

            results: [
              result
            ]
          });


        await exportWorkbookV2(
          outputPath,
          {
            results: [
              result
            ],

            coverage,

            runId:
              "excel-export-test",

            reconciliation: {
              runId:
                "excel-export-test",

              discovered:
                1,

              accepted:
                1,

              review:
                0,

              excluded:
                0,

              error:
                0,

              inProgress:
                0,

              accounted:
                1,

              balanced:
                true,

              complete:
                true
            },

            errors:
              [],

            audit: []
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


        const names =
          workbook.worksheets.map(
            sheet =>
              sheet.name
          );


        expect(
          names
        ).toEqual(
          expect.arrayContaining([
            "D\u1eef li\u1ec7u \u0111\u1ed1i th\u1ee7",
            "C\u1ea7n ki\u1ec3m tra",
            "Kh\u00f4ng li\u00ean quan",
            "Evidence",
            "Conflicts",
            "Coverage",
            "Audit"
          ])
        );


        const main =
          workbook.getWorksheet(
            "D\u1eef li\u1ec7u \u0111\u1ed1i th\u1ee7"
          );


        expect(
          main?.columnCount
        ).toBe(13);
      }
    );
  }
);
