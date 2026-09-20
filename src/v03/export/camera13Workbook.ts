import ExcelJS from "exceljs";

import {
  mkdir,
  rename,
  rm
} from "node:fs/promises";

import {
  dirname
} from "node:path";

import {
  CAMERA13_HEADERS
} from "../contracts/camera13.js";

export {
  CAMERA13_HEADERS
} from "../contracts/camera13.js";

import type {
  MoneyEvidenceValue,
  VisualExtraction,
  VisualExtractionValidationResult
} from "../validation/visualExtractionValidator.js";


export interface Camera13WorkbookOptions {
  runId?:
    string;
}




function money(
  value:
    MoneyEvidenceValue |
    null
): string {

  if (
    value ===
      null
  ) {
    return "";
  }


  const formatted =
    new Intl.NumberFormat(
      "vi-VN",
      {
        maximumFractionDigits:
          2
      }
    ).format(
      value.value
    );


  return value.currency
    .trim()
    .length >
      0
    ? formatted +
      " " +
      value.currency.trim()
    : formatted;
}


function joined(
  values:
    readonly string[]
): string {

  return values
    .map(
      value =>
        value.trim()
    )
    .filter(
      (
        value,
        index,
        all
      ) =>
        value.length >
          0 &&
        all.indexOf(
          value
        ) ===
          index
    )
    .join(
      " | "
    );
}


function cameraRow(
  value:
    VisualExtraction
): unknown[] {

  return [
    value.website,

    value.productName
      ?.value ??
      "",

    value.condition
      ?.value ??
      "",

    joined(
      value.specs.map(
        spec =>
          spec.value
      )
    ),

    money(
      value.rentalPricePerDay
    ),

    value.rentalTerms
      ?.value ??
      "",

    value.accessoriesIncluded
      ? joined(
          value.accessoriesIncluded.map(
            item =>
              item.value
          )
        )
      : "",

    value.bundleIncluded
      ? joined(
          value.bundleIncluded.map(
            item =>
              item.value
          )
        )
      : "",

    value.rating
      ?.value ??
      "",

    value.reviewCount
      ?.value ??
      "",

    value.stock
      ?.value ??
      "",

    money(
      value.salePrice
    ),

    value.url
  ];
}


function evidencePayload(
  value:
    VisualExtraction
): string {

  return JSON.stringify({
    productName:
      value.productName,

    condition:
      value.condition,

    specs:
      value.specs,

    rentalPricePerDay:
      value.rentalPricePerDay,

    rentalTerms:
      value.rentalTerms,

    accessoriesIncluded:
      value.accessoriesIncluded,

    bundleIncluded:
      value.bundleIncluded,

    rating:
      value.rating,

    reviewCount:
      value.reviewCount,

    stock:
      value.stock,

    salePrice:
      value.salePrice
  });
}


function applySheetDefaults(
  sheet:
    ExcelJS.Worksheet
): void {

  sheet.getRow(
    1
  ).font = {
    bold:
      true
  };


  sheet.views = [
    {
      state:
        "frozen",
      ySplit:
        1
    }
  ];
}


function dataRows(
  workbook:
    ExcelJS.Workbook,
  sheetName:
    string
): number {

  const sheet =
    workbook.getWorksheet(
      sheetName
    );


  if (
    !sheet
  ) {
    return -1;
  }


  return Math.max(
    0,
    sheet.actualRowCount -
      1
  );
}


function verifyHeaders(
  workbook:
    ExcelJS.Workbook
): boolean {

  const sheet =
    workbook.getWorksheet(
      "Camera Data"
    );


  if (
    !sheet ||
    sheet.columnCount !==
      CAMERA13_HEADERS.length
  ) {
    return false;
  }


  return CAMERA13_HEADERS.every(
    (
      header,
      index
    ) =>
      sheet.getRow(
        1
      ).getCell(
        index +
        1
      ).value ===
      header
  );
}


export async function exportCamera13WorkbookAtomic(
  outputPath:
    string,
  results:
    readonly VisualExtractionValidationResult[],
  options:
    Camera13WorkbookOptions = {}
): Promise<void> {

  await mkdir(
    dirname(
      outputPath
    ),
    {
      recursive:
        true
    }
  );


  const partialPath =
    outputPath +
    ".partial.xlsx";


  await rm(
    partialPath,
    {
      force:
        true
    }
  );


  const workbook =
    new ExcelJS.Workbook();


  workbook.creator =
    "camera-intelligence-v3-vision-first";


  const cameraData =
    workbook.addWorksheet(
      "Camera Data"
    );


  cameraData.columns =
    CAMERA13_HEADERS.map(
      (
        header,
        index
      ) => ({
        header,
        key:
          "c" +
          String(
            index +
            1
          ),
        width:
          index ===
            12
            ? 62
            : index ===
                3
              ? 54
              : 26
      })
    );


  const validated =
    results.filter(
      result =>
        result.status ===
        "VALIDATED"
    );


  for (
    const result
    of validated
  ) {
    cameraData.addRow(
      cameraRow(
        result.value
      )
    );
  }


  const decisionAudit =
    workbook.addWorksheet(
      "Decision Audit"
    );


  decisionAudit.columns = [
    {
      header:
        "URL",
      key:
        "url",
      width:
        62
    },
    {
      header:
        "Validation status",
      key:
        "status",
      width:
        20
    },
    {
      header:
        "Validation issues",
      key:
        "issues",
      width:
        90
    },
    {
      header:
        "Evidence JSON",
      key:
        "evidence",
      width:
        120
    },
    {
      header:
        "Run ID",
      key:
        "runId",
      width:
        30
    }
  ];


  for (
    const result
    of results
  ) {
    decisionAudit.addRow({
      url:
        result.value.url,

      status:
        result.status,

      issues:
        result.issues
          .map(
            issue =>
              issue.code +
              (
                issue.field
                  ? " [" +
                    issue.field +
                    "]"
                  : ""
              ) +
              ": " +
              issue.message
          )
          .join(
            " | "
          ),

      evidence:
        evidencePayload(
          result.value
        ),

      runId:
        options.runId ??
        ""
    });
  }


  applySheetDefaults(
    cameraData
  );

  applySheetDefaults(
    decisionAudit
  );


  await workbook.xlsx.writeFile(
    partialPath
  );


  const verification =
    new ExcelJS.Workbook();


  await verification.xlsx.readFile(
    partialPath
  );


  if (
    !verifyHeaders(
      verification
    ) ||
    dataRows(
      verification,
      "Camera Data"
    ) !==
      validated.length ||
    dataRows(
      verification,
      "Decision Audit"
    ) !==
      results.length
  ) {
    throw new Error(
      "Camera13 workbook verification failed before atomic commit."
    );
  }


  await rm(
    outputPath,
    {
      force:
        true
    }
  );


  await rename(
    partialPath,
    outputPath
  );
}
