import ExcelJS from "exceljs";

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

import {
  afterEach,
  describe,
  expect,
  it
} from "vitest";

import {
  exportScaleWorkbookAtomic,
  type ScaleRunSummary
} from "../../../src/v03/ai/scaleWorkbookExporter.js";

import type {
  AISemanticDecision,
  SemanticValidationResult
} from "../../../src/v03/ai/semanticContracts.js";


const validation:
  SemanticValidationResult = {
    status:
      "VALIDATED",

    issues:
      []
  };


const summary:
  ScaleRunSummary = {
    rootUrl:
      "semantic-batch",

    provider:
      "smart-router",

    discovered:
      1,

    clearNonCameraSkipped:
      0,

    clearNonProductSkipped:
      0,

    deterministicNonCameraSkipped:
      0,

    attemptedDetail:
      1,

    qualifiedProductPages:
      1,

    validatedCameras:
      1,

    validatedNonCameras:
      0,

    review:
      0,

    errors:
      0,

    model:
      "gemini-3.5-flash-lite"
  };


function decision():
  AISemanticDecision {

  return {
    entity: {
      type:
        "CAMERA",

      subtype:
        "MIRRORLESS",

      confidence:
        0.99,

      evidenceIds: [
        "ev_title"
      ]
    },

    productName: {
      value:
        "Canon EOS R50 (Kèm Kit Lens 18-45mm, White, Hàng Mới Chính Hãng)",

      evidenceIds: [
        "ev_title"
      ],

      confidence:
        0.99
    },

    currentPrice: {
      value:
        18_490_000,

      currency:
        "VND",

      evidenceIds: [
        "ev_price_kit"
      ],

      confidence:
        0.99
    },

    oldPrice:
      null,

    giftValues:
      [],

    savingValues:
      [],

    installmentAmounts:
      [],

    variants: [
      {
        label:
          "Body Only",

        selected:
          false,

        condition:
          "NEW",

        price: {
          value:
            15_990_000,

          currency:
            "VND",

          evidenceIds: [
            "ev_price_body"
          ],

          confidence:
            0.99
        },

        priceDelta:
          null,

        evidenceIds: [
          "ctrl_body"
        ],

        confidence:
          0.99
      },
      {
        label:
          "Kèm Kit Lens 18-45mm",

        selected:
          true,

        condition:
          "NEW",

        price: {
          value:
            18_490_000,

          currency:
            "VND",

          evidenceIds: [
            "ev_price_kit"
          ],

          confidence:
            0.99
        },

        priceDelta:
          null,

        evidenceIds: [
          "ctrl_kit"
        ],

        confidence:
          0.99
      }
    ],

    condition: {
      value:
        "NEW",

      evidenceIds: [
        "ev_condition"
      ],

      confidence:
        0.99
    },

    availableConditions:
      [],

    stock: {
      state:
        "IN_STOCK",

      quantity:
        null,

      evidenceIds: [
        "ev_stock"
      ],

      confidence:
        0.99
    },

    rating: {
      value:
        4.9,

      evidenceIds: [
        "ev_rating"
      ],

      confidence:
        0.99
    },

    reviewCount: {
      value:
        243,

      evidenceIds: [
        "ev_reviews"
      ],

      confidence:
        0.99
    },

    specs: [
      {
        key:
          "Sensor",

        value:
          "APS-C CMOS 24.2MP",

        evidenceIds: [
          "ev_sensor"
        ],

        confidence:
          0.99
      },
      {
        key:
          "Video",

        value:
          "4K",

        evidenceIds: [
          "ev_video"
        ],

        confidence:
          0.99
      }
    ],

    conflicts:
      [],

    pageConfidence:
      0.99
  };
}


let tempDirectories:
  string[] =
    [];


afterEach(
  async () => {

    await Promise.all(
      tempDirectories.map(
        directory =>
          rm(
            directory,
            {
              recursive:
                true,
              force:
                true
            }
          )
      )
    );


    tempDirectories =
      [];
  }
);


describe(
  "human-facing Camera Data workbook",
  () => {

    it(
      "exports exactly the requested 13 business columns and moves technical metadata to Decision Audit",
      async () => {

        const directory =
          await mkdtemp(
            join(
              tmpdir(),
              "human-camera-workbook-"
            )
          );


        tempDirectories.push(
          directory
        );


        const output =
          join(
            directory,
            "CameraIntelligence_Smart.xlsx"
          );


        await exportScaleWorkbookAtomic(
          output,
          [
            {
              url:
                "https://www.example.test/canon-r50-kit",

              model:
                "gemini-3.5-flash-lite",

              decision:
                decision(),

              validation
            }
          ],
          [],
          [],
          summary
        );


        const workbook =
          new ExcelJS.Workbook();


        await workbook.xlsx.readFile(
          output
        );


        const sheet =
          workbook.getWorksheet(
            "Camera Data"
          )!;


        const headers =
          sheet.getRow(
            1
          ).values
            .slice(
              1
            );


        expect(
          headers
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
          headers
        ).not.toEqual(
          expect.arrayContaining([
            "AI confidence",
            "Evidence IDs",
            "Model"
          ])
        );


        const row =
          sheet.getRow(
            2
          );


        expect(
          row.getCell(
            1
          ).value
        ).toBe(
          "example.test"
        );


        expect(
          row.getCell(
            2
          ).value
        ).toBe(
          "Canon EOS R50"
        );


        expect(
          row.getCell(
            3
          ).value
        ).toBe(
          "Hàng mới"
        );


        expect(
          row.getCell(
            4
          ).value
        ).toBe(
          "Sensor: APS-C CMOS 24.2MP; Video: 4K"
        );


        expect(
          row.getCell(
            5
          ).value
        ).toBeNull();


        expect(
          row.getCell(
            6
          ).value
        ).toBeNull();


        expect(
          row.getCell(
            7
          ).value
        ).toBeNull();


        expect(
          row.getCell(
            8
          ).value
        ).toBe(
          "Kèm Kit Lens 18-45mm"
        );


        expect(
          row.getCell(
            9
          ).value
        ).toBe(
          4.9
        );


        expect(
          row.getCell(
            10
          ).value
        ).toBe(
          243
        );


        expect(
          row.getCell(
            11
          ).value
        ).toBe(
          "Còn hàng"
        );


        expect(
          row.getCell(
            12
          ).value
        ).toBe(
          "15.990.000 - 18.490.000 VND"
        );


        expect(
          row.getCell(
            13
          ).value
        ).toBe(
          "https://www.example.test/canon-r50-kit"
        );


        const audit =
          workbook.getWorksheet(
            "Decision Audit"
          )!;


        expect(
          audit.actualRowCount
        ).toBe(
          2
        );


        expect(
          audit.getRow(
            2
          ).getCell(
            2
          ).value
        ).toBe(
          "gemini-3.5-flash-lite"
        );
      }
    );
  }
);
