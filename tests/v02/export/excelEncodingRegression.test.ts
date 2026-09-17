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
  exportWorkbookV2
} from "../../../src/v02/export/excelExporterV2.ts";

const outputPath =
  resolve(
    process.cwd(),
    "output",
    "__v02_encoding_regression.xlsx"
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
          force: true
        }
      );
    }
  }
);

describe(
  "Excel Exporter V2 encoding regression",
  () => {
    test(
      "preserves Vietnamese worksheet names and headers",
      async () => {
        await exportWorkbookV2(
          outputPath,
          {
            results: [],

            coverage: {
              metrics: [],
              accepted: 0,
              review: 0,
              excluded: 0,
              totalClassified: 0,
              allRequiredEvidenceComplete: 0
            },

            audit: []
          }
        );

        const workbook =
          new ExcelJS.Workbook();

        await workbook.xlsx.readFile(
          outputPath
        );

        expect(
          workbook.worksheets.map(
            sheet =>
              sheet.name
          )
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
          main
        ).toBeDefined();

        const expectedHeaders = [
          "Website",
          "T\u00ean s\u1ea3n ph\u1ea9m",
          "H\u00ecnh th\u1ee9c",
          "Th\u00f4ng s\u1ed1 m\u00f4 t\u1ea3",
          "Gi\u00e1 thu\u00ea/ng\u00e0y",
          "\u0110i\u1ec1u ki\u1ec7n thu\u00ea ri\u00eang",
          "Ph\u1ee5 ki\u1ec7n \u0111i k\u00e8m",
          "Combo/g\u00f3i \u0111i k\u00e8m",
          "\u0110i\u1ec3m \u0111\u00e1nh gi\u00e1",
          "S\u1ed1 l\u01b0\u1ee3t \u0111\u00e1nh gi\u00e1/review",
          "T\u1ed3n kho",
          "Gi\u00e1 b\u00e1n",
          "URL"
        ];

        const actualHeaders =
          expectedHeaders.map(
            (_, index) =>
              main?.getCell(
                1,
                index + 1
              ).value
          );

        expect(
          actualHeaders
        ).toEqual(
          expectedHeaders
        );
      }
    );
  }
);
