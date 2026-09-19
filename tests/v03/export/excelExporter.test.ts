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
  exportBulkWorkbook
} from "../../../src/v03/export/excelExporter.js";

import type {
  BulkCollectionResult
} from "../../../src/v03/bulk/bulkTypes.js";


const outputPath =
  resolve(
    process.cwd(),
    "output",
    "__v3_export_test.xlsx"
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


function fixture():
  BulkCollectionResult {

  const identity = {
    identityId:
      "URL:https://example.com/canon-r50",
    memberUrls: [
      "https://example.com/canon-r50",
      "https://example.com/canon-r50?p=2"
    ],
    tokens: [
      {
        kind:
          "CANONICAL" as const,
        value:
          "https://example.com/canon-r50",
        token:
          "URL:https://example.com/canon-r50"
      },
      {
        kind:
          "SKU" as const,
        value:
          "SP0003",
        token:
          "SKU:https://example.com:SP0003"
      }
    ],
    records:
      []
  };


  const observations = [
    {
      productIdentity:
        identity.identityId,
      field:
        "PRODUCT_NAME" as const,
      rawValue:
        "CANON EOS R50 (NEW 100%)",
      sourceKind:
        "VISIBLE_TEXT" as const,
      sourceUrl:
        "https://example.com/canon-r50",
      locator:
        "h1[0]"
    },
    {
      productIdentity:
        identity.identityId,
      field:
        "CONDITION" as const,
      rawValue:
        "CANON EOS R50 (NEW 100%)",
      sourceKind:
        "VISIBLE_TEXT" as const,
      sourceUrl:
        "https://example.com/canon-r50",
      locator:
        "h1[0]"
    },
    {
      productIdentity:
        identity.identityId,
      field:
        "CONDITION" as const,
      rawValue:
        "https://schema.org/UsedCondition",
      sourceKind:
        "JSON_LD" as const,
      sourceUrl:
        "https://example.com/canon-r50",
      locator:
        "Product.offers[0].itemCondition"
    },
    {
      productIdentity:
        identity.identityId,
      field:
        "PRICE" as const,
      rawValue:
        "18.000.000đ",
      sourceKind:
        "VISIBLE_TEXT" as const,
      sourceUrl:
        "https://example.com/canon-r50",
      locator:
        "scoped-price[0]"
    },
    {
      productIdentity:
        identity.identityId,
      field:
        "PRICE" as const,
      rawValue:
        "18000000",
      sourceKind:
        "JSON_LD" as const,
      sourceUrl:
        "https://example.com/canon-r50",
      locator:
        "Product.offers[0].price"
    }
  ];


  const entity = {
    route:
      "CAMERA" as const,
    subtype:
      "CAMERA" as const,
    input: {
      title:
        "CANON EOS R50",
      category:
        "MÁY ẢNH CANON",
      specs:
        "",
      description:
        ""
    },
    classifier: {
      type:
        "CAMERA" as const,
      isCamera:
        true,
      confidence:
        "MEDIUM" as const,
      evidence:
        []
    }
  };


  const product = {
    identity,
    observations,
    entity
  };


  return {
    rootUrl:
      "https://example.com/",
    discovery: {
      recon: {
        rootUrl:
          "https://example.com/",
        finalPageUrl:
          "https://example.com/",
        exchanges:
          [],
        observationWindowMs:
          1
      },
      qualification: {
        candidates:
          [],
        qualified:
          []
      },
      replay: {
        qualifiedCandidateCount:
          0,
        replayedCandidateCount:
          0,
        discoveries:
          [],
        discoveredUrls: [
          "https://example.com/canon-r50",
          "https://example.com/canon-r50?p=2"
        ],
        warnings:
          []
      }
    },
    candidateUrls: [
      "https://example.com/canon-r50",
      "https://example.com/canon-r50?p=2"
    ],
    attemptedUrls: [
      "https://example.com/canon-r50",
      "https://example.com/canon-r50?p=2"
    ],
    identityResolution: {
      clusters: [
        identity
      ],
      byRequestedUrl: {
        "https://example.com/canon-r50":
          identity.identityId,
        "https://example.com/canon-r50?p=2":
          identity.identityId
      }
    },
    products: [
      product
    ],
    cameras: [
      product
    ],
    nonCameras:
      [],
    uncertain:
      [],
    errors:
      []
  };
}


describe(
  "V3 observation-first Excel exporter",
  () => {

    test(
      "creates camera, review, excluded, observations, identity, errors, coverage and audit sheets",
      async () => {

        await exportBulkWorkbook(
          outputPath,
          fixture()
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


        expect(
          workbook.worksheets.map(
            sheet =>
              sheet.name
          )
        ).toEqual([
          "Camera Data",
          "Review",
          "Excluded",
          "Observations",
          "Identity",
          "Errors",
          "Coverage",
          "Audit"
        ]);
      }
    );


    test(
      "main camera row preserves conflicting observed values instead of selecting one",
      async () => {

        await exportBulkWorkbook(
          outputPath,
          fixture()
        );


        const workbook =
          new ExcelJS.Workbook();


        await workbook.xlsx.readFile(
          outputPath
        );


        const sheet =
          workbook.getWorksheet(
            "Camera Data"
          );


        expect(
          sheet
        ).toBeDefined();


        const headers =
          sheet!.getRow(
            1
          ).values as
            unknown[];


        const conditionColumn =
          headers.indexOf(
            "Tình trạng (observed)"
          );


        const priceColumn =
          headers.indexOf(
            "Giá (observed)"
          );


        expect(
          String(
            sheet!.getRow(
              2
            ).getCell(
              conditionColumn
            ).value
          )
        ).toBe(
          "CANON EOS R50 (NEW 100%) || https://schema.org/UsedCondition"
        );


        expect(
          String(
            sheet!.getRow(
              2
            ).getCell(
              priceColumn
            ).value
          )
        ).toBe(
          "18.000.000đ || 18000000"
        );
      }
    );


    test(
      "long-form observations retain source kind and locator provenance",
      async () => {

        await exportBulkWorkbook(
          outputPath,
          fixture()
        );


        const workbook =
          new ExcelJS.Workbook();


        await workbook.xlsx.readFile(
          outputPath
        );


        const sheet =
          workbook.getWorksheet(
            "Observations"
          );


        const rows:
          string[][] =
            [];


        sheet!.eachRow(
          (
            row,
            rowNumber
          ) => {

            if (
              rowNumber ===
                1
            ) {
              return;
            }


            rows.push(
              row.values
                .slice(
                  1
                )
                .map(
                  value =>
                    String(
                      value ??
                      ""
                    )
                )
            );
          }
        );


        expect(
          rows.some(
            row =>
              row.includes(
                "https://schema.org/UsedCondition"
              ) &&
              row.includes(
                "JSON_LD"
              ) &&
              row.includes(
                "Product.offers[0].itemCondition"
              )
          )
        ).toBe(true);
      }
    );
  }
);
