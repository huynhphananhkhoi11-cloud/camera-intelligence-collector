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
        "scoped-price[0]",
      semanticRole:
        "CURRENT_PRODUCT_PRICE" as const,
      ownership:
        "PRIMARY_PRODUCT" as const,
      contextKind:
        "SALE" as const
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
    },
    {
      productIdentity:
        identity.identityId,
      field:
        "PRICE_CURRENCY" as const,
      rawValue:
        "VND",
      sourceKind:
        "JSON_LD" as const,
      sourceUrl:
        "https://example.com/canon-r50",
      locator:
        "Product.offers[0].priceCurrency"
    },
    {
      productIdentity:
        identity.identityId,
      field:
        "AVAILABILITY" as const,
      rawValue:
        "https://schema.org/InStock",
      sourceKind:
        "JSON_LD" as const,
      sourceUrl:
        "https://example.com/canon-r50",
      locator:
        "Product.offers[0].availability"
    },
    {
      productIdentity:
        identity.identityId,
      field:
        "INVENTORY_LEVEL" as const,
      rawValue:
        "5",
      sourceKind:
        "JSON_LD" as const,
      sourceUrl:
        "https://example.com/canon-r50",
      locator:
        "Product.offers[0].inventoryLevel"
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
      },
      staticTraversal: {
        visitedPages:
          [],
        evidence:
          [],
        warnings:
          []
      },
      sitemap: {
        sitemapDocuments:
          [],
        evidence:
          [],
        warnings:
          []
      },
      renderedDom: {
        used:
          false,
        evidence:
          [],
        warnings:
          []
      },
      evidence:
        [],
      allDiscoveredUrls: [
        "https://example.com/canon-r50",
        "https://example.com/canon-r50?p=2"
      ],
      channelCounts: {
        STATIC_HTML:
          0,
        SITEMAP:
          0,
        ENDPOINT_REPLAY:
          2,
        RENDERED_DOM:
          0
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
    skippedPages:
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
          "Skipped Pages",
          "Errors",
          "Coverage",
          "Audit"
        ]);
      }
    );


    test(
      "main camera sheet stays compact and presents readable values while raw evidence remains elsewhere",
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


        expect(
          sheet!.columnCount
        ).toBe(
          13
        );


        expect(
          headers
        ).toEqual(
          expect.arrayContaining([
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
          ])
        );


        expect(
          headers.some(
            value =>
              String(
                value ??
                ""
              ).includes(
                "(observed)"
              )
          )
        ).toBe(false);


        expect(
          headers
        ).not.toEqual(
          expect.arrayContaining([
            "SKU",
            "Breadcrumb",
            "Action text",
            "URL count",
            "Identity ID"
          ])
        );


        const conditionColumn =
          headers.indexOf(
            "Hàng cũ/Hàng mới"
          );


        const priceColumn =
          headers.indexOf(
            "Giá bán"
          );


        const stockColumn =
          headers.indexOf(
            "Tồn kho"
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
          "Hàng mới"
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
          "18.000.000 VND"
        );


        expect(
          String(
            sheet!.getRow(
              2
            ).getCell(
              stockColumn
            ).value
          )
        ).toBe(
          "5"
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

    test(
      "observations sheet exports semantic role ownership and context metadata",
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


        const headers =
          sheet!.getRow(
            1
          ).values as
            unknown[];


        expect(
          headers
        ).toEqual(
          expect.arrayContaining([
            "Semantic role",
            "Ownership",
            "Context kind"
          ])
        );


        const values:
          string[] =
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


            for (
              const value
              of row.values
            ) {
              values.push(
                String(
                  value ??
                  ""
                )
              );
            }
          }
        );


        expect(
          values
        ).toEqual(
          expect.arrayContaining([
            "CURRENT_PRODUCT_PRICE",
            "PRIMARY_PRODUCT",
            "SALE"
          ])
        );
      }
    );

  }
);
