import {
  mkdtemp,
  rm
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import ExcelJS from "exceljs";

import {
  describe,
  expect,
  test
} from "vitest";

import {
  exportSemantic13WorkbookAtomic
} from "../../../src/v03/export/semantic13Workbook.js";

import type {
  SemanticDecisionValidationResult
} from "../../../src/v03/ai/semanticDecisionSchema.js";

function validation():
SemanticDecisionValidationResult {
  const evidence = {
    classification: [],
    productName: [
      {
        shotId: "hero-01",
        rawText: "Canon EOS R50 Body"
      }
    ],
    condition: [
      {
        shotId: "hero-01",
        rawText: "Hàng mới"
      }
    ],
    specs: [
      {
        shotId: "hero-01",
        rawText: "APS-C 24.2MP"
      }
    ],
    rentalPricePerDay: [
      {
        shotId: "hero-01",
        rawText: "Thuê một ngày 400.000 đ"
      }
    ],
    rentalTerms: [],
    accessoriesIncluded: [
      {
        shotId: "hero-01",
        rawText: "KIOXIA 64GB"
      }
    ],
    bundleIncluded: [],
    rating: [],
    reviewCount: [],
    stock: [],
    salePrice: [
      {
        shotId: "hero-01",
        rawText: "15.990.000 đ"
      }
    ]
  };

  const row = {
    website: "zshop.vn",
    productName:
      "Canon EOS R50 Body",
    condition:
      "NEW" as const,
    specs: [
      "APS-C 24.2MP"
    ],
    rentalPricePerDay: {
      value: 400000,
      currency: "VND"
    },
    rentalTerms: null,
    accessoriesIncluded: [
      "Kioxia 64GB"
    ],
    bundleIncluded: null,
    rating: null,
    reviewCount: null,
    stock: null,
    salePrice: {
      value: 15990000,
      currency: "VND"
    },
    url:
      "https://zshop.vn/camera"
  };

  return {
    status: "VALIDATED",
    issues: [],
    value: row,
    decision: {
      classification:
        "CAMERA_PRODUCT",
      reviewReason: null,
      row,
      evidence
    }
  };
}

describe(
  "AI-owned semantic workbook",
  () => {
    test(
      "maps the canonical semantic row one-to-one into the exact 13-column contract",
      async () => {
        const dir =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-semantic-"
            )
          );

        try {
          const output =
            join(
              dir,
              "out.xlsx"
            );

          await exportSemantic13WorkbookAtomic(
            output,
            [validation()],
            {
              runId: "test-run"
            }
          );

          const workbook =
            new ExcelJS.Workbook();

          await workbook.xlsx.readFile(
            output
          );

          const sheet =
            workbook.getWorksheet(
              "Camera Data"
            );

          expect(sheet).toBeTruthy();

          const headers =
            sheet!
              .getRow(1)
              .values
              .slice(1)
              .map(
                value =>
                  String(
                    value ??
                    ""
                  )
              );

          expect(headers).toEqual([
            "Website",
            "Tên sản phẩm",
            "Hàng cũ/Hàng mới",
            "Thông số mô tả",
            "Giá thuê/ngày",
            "Điều kiện thuê riêng",
            "Phụ kiện đi kèm",
            "Combo/gói đi kèm",
            "Điểm đánh giá",
            "Số lượt đánh giá/review",
            "Tồn kho",
            "Giá bán",
            "URL"
          ]);

          const row =
            sheet!.getRow(2);

          expect(
            String(
              row.getCell(5)
                .value
            )
          ).toContain(
            "400.000"
          );

          expect(
            String(
              row.getCell(7)
                .value
            )
          ).toBe(
            "Kioxia 64GB"
          );

          expect(
            String(
              row.getCell(8)
                .value ??
              ""
            )
          ).toBe("");

          expect(
            String(
              row.getCell(12)
                .value
            )
          ).toContain(
            "15.990.000"
          );
        }
        finally {
          await rm(
            dir,
            {
              recursive: true,
              force: true
            }
          );
        }
      }
    );
  }
);
