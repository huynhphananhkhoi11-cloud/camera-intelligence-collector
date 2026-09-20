import ExcelJS from "exceljs";

import {
  access,
  mkdtemp,
  rm
} from "node:fs/promises";

import {
  tmpdir
} from "node:os";

import {
  join
} from "node:path";

import {
  afterEach,
  describe,
  expect,
  test
} from "vitest";

import {
  exportCamera13WorkbookAtomic
} from "../../../src/v03/export/camera13Workbook.js";

import {
  validateVisualExtraction
} from "../../../src/v03/validation/visualExtractionValidator.js";

import type {
  VisualExtraction
} from "../../../src/v03/validation/visualExtractionValidator.js";


const tempRoots:
  string[] = [];


function sampleExtraction(): VisualExtraction {

  return {
    website:
      {
        value:
          "zshop.vn",
        rawText:
          "zshop.vn",
        shotId:
          "context"
      },

    productName:
      {
        value:
          "Canon EOS R50",
        rawText:
          "Canon EOS R50",
        shotId:
          "hero-01"
      },

    condition:
      {
        value:
          "USED",
        rawText:
          "Hàng Likenew",
        shotId:
          "hero-01"
      },

    specs:
      [
        {
          value:
            "Cảm biến APS-C CMOS 24.2MP",
          rawText:
            "Cảm biến APS-C CMOS 24.2MP",
          shotId:
            "specs-03"
        }
      ],

    rentalPricePerDay:
      null,

    rentalTerms:
      null,

    accessoriesIncluded:
      {
        value:
          [
            "Thân máy",
            "Pin",
            "Sạc"
          ],
        rawText:
          "Thân máy, Pin, Sạc",
        shotId:
          "commerce-02"
      },

    bundleIncluded:
      null,

    rating:
      {
        value:
          4.9,
        rawText:
          "4.9/5",
        shotId:
          "reviews-04"
      },

    reviewCount:
      {
        value:
          27,
        rawText:
          "27 đánh giá",
        shotId:
          "reviews-04"
      },

    stock:
      {
        value:
          "Còn hàng",
        rawText:
          "Còn hàng",
        shotId:
          "hero-01"
      },

    salePrice:
      {
        value:
          14990000,
        currency:
          "VND",
        rawText:
          "14.990.000đ",
        shotId:
          "hero-01"
      },

    url:
      "https://zshop.vn/canon-eos-r50-likenew.html"
  };
}


function context() {

  return {
    expectedUrl:
      "https://zshop.vn/canon-eos-r50-likenew.html",

    expectedDomain:
      "zshop.vn",

    shotIds:
      new Set([
        "context",
        "hero-01",
        "commerce-02",
        "specs-03",
        "reviews-04"
      ]),

    disposition:
      "CAMERA" as const
  };
}


afterEach(
  async () => {

    await Promise.all(
      tempRoots.splice(
        0
      ).map(
        root =>
          rm(
            root,
            {
              force:
                true,
              recursive:
                true
            }
          )
      )
    );
  }
);


describe(
  "Vision-first 13-column workbook",
  () => {

    test(
      "writes Camera Data with exactly the 13 user columns in the required order",
      async () => {

        const root =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-v3-workbook-"
            )
          );

        tempRoots.push(
          root
        );

        const output =
          join(
            root,
            "result.xlsx"
          );

        const validation =
          validateVisualExtraction(
            sampleExtraction(),
            context()
          );

        expect(
          validation.status
        ).toBe(
          "VALIDATED"
        );

        await exportCamera13WorkbookAtomic(
          output,
          [
            validation
          ],
          {
            runId:
              "run-test-001"
          }
        );

        const workbook =
          new ExcelJS.Workbook();

        await workbook.xlsx.readFile(
          output
        );

        const cameraData =
          workbook.getWorksheet(
            "Camera Data"
          );

        expect(
          cameraData
        ).toBeDefined();

        const headers =
          cameraData!
            .getRow(
              1
            )
            .values;

        expect(
          Array.from(
            headers as unknown[]
          ).slice(
            1
          )
        ).toEqual([
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

        expect(
          cameraData!.columnCount
        ).toBe(
          13
        );

        expect(
          cameraData!.getRow(
            2
          ).getCell(
            2
          ).value
        ).toBe(
          "Canon EOS R50"
        );

        expect(
          cameraData!.getRow(
            2
          ).getCell(
            3
          ).value
        ).toBe(
          "USED"
        );
      }
    );


    test(
      "keeps technical evidence in Decision Audit and excludes REVIEW rows from Camera Data",
      async () => {

        const root =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-v3-audit-"
            )
          );

        tempRoots.push(
          root
        );

        const output =
          join(
            root,
            "review.xlsx"
          );

        const invalid =
          sampleExtraction();

        invalid.rating = {
          value:
            15,
          rawText:
            "15/5",
          shotId:
            "reviews-04"
        };

        const validation =
          validateVisualExtraction(
            invalid,
            context()
          );

        expect(
          validation.status
        ).toBe(
          "REVIEW"
        );

        await exportCamera13WorkbookAtomic(
          output,
          [
            validation
          ]
        );

        const workbook =
          new ExcelJS.Workbook();

        await workbook.xlsx.readFile(
          output
        );

        const cameraData =
          workbook.getWorksheet(
            "Camera Data"
          );

        const audit =
          workbook.getWorksheet(
            "Decision Audit"
          );

        expect(
          cameraData?.actualRowCount
        ).toBe(
          1
        );

        expect(
          audit?.actualRowCount
        ).toBe(
          2
        );

        const auditText =
          audit?.getRow(
            2
          ).values.join(
            " | "
          ) ?? "";

        expect(
          auditText
        ).toContain(
          "REVIEW"
        );

        expect(
          auditText
        ).toContain(
          "reviews-04"
        );

        expect(
          auditText
        ).toContain(
          "15/5"
        );
      }
    );


    test(
      "atomically promotes the partial workbook and leaves no partial file on success",
      async () => {

        const root =
          await mkdtemp(
            join(
              tmpdir(),
              "camintel-v3-atomic-"
            )
          );

        tempRoots.push(
          root
        );

        const output =
          join(
            root,
            "atomic.xlsx"
          );

        await exportCamera13WorkbookAtomic(
          output,
          [
            validateVisualExtraction(
              sampleExtraction(),
              context()
            )
          ]
        );

        await expect(
          access(
            output
          )
        ).resolves.toBeUndefined();

        await expect(
          access(
            output +
            ".partial.xlsx"
          )
        ).rejects.toBeDefined();
      }
    );
  }
);
