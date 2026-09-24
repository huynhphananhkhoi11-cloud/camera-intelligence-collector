import ExcelJS from "exceljs";

import {
  mkdir,
  rename,
  rm
} from "node:fs/promises";

import {
  dirname
} from "node:path";

import type {
  Camera13Row,
  MoneyValue
} from "../contracts/minimalVisualDecision.js";

import type {
  ValidationResult
} from "../validation/structuralValidator.js";

export const CAMERA13_HEADERS = [
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
] as const;

function money(value: MoneyValue | null): string {
  if (value === null) {
    return "";
  }

  const amount = new Intl.NumberFormat(
    "vi-VN",
    {
      maximumFractionDigits: 2
    }
  ).format(value.value);

  return amount + " " + value.currency;
}

function joined(values: readonly string[] | null): string {
  if (values === null) {
    return "";
  }

  return values.join(" | ");
}

function cameraRow(row: Camera13Row): readonly unknown[] {
  return [
    row.website,
    row.productName ?? "",
    row.condition ?? "",
    joined(row.specs),
    money(row.rentalPricePerDay),
    row.rentalTerms ?? "",
    joined(row.accessoriesIncluded),
    joined(row.bundleIncluded),
    row.rating ?? "",
    row.reviewCount ?? "",
    row.stock ?? "",
    money(row.salePrice),
    row.url
  ];
}

function applySheetDefaults(sheet: ExcelJS.Worksheet): void {
  sheet.getRow(1).font = {
    bold: true
  };

  sheet.views = [
    {
      state: "frozen",
      ySplit: 1
    }
  ];
}

function verifyCameraData(
  workbook: ExcelJS.Workbook,
  expectedRows: number
): boolean {
  const sheet = workbook.getWorksheet("Camera Data");

  if (!sheet || sheet.columnCount !== CAMERA13_HEADERS.length) {
    return false;
  }

  const headersMatch = CAMERA13_HEADERS.every(
    (header, index) =>
      sheet.getRow(1).getCell(index + 1).value === header
  );

  return (
    headersMatch &&
    Math.max(0, sheet.actualRowCount - 1) === expectedRows
  );
}

export async function exportCamera13WorkbookAtomic(
  outputPath: string,
  results: readonly ValidationResult[]
): Promise<void> {
  await mkdir(
    dirname(outputPath),
    {
      recursive: true
    }
  );

  const partialPath = outputPath + ".partial.xlsx";

  await rm(
    partialPath,
    {
      force: true
    }
  );

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "camera-intelligence-v04-minimal";

  const cameraData = workbook.addWorksheet("Camera Data");

  cameraData.columns = CAMERA13_HEADERS.map(
    (header, index) => ({
      header,
      key: "c" + String(index + 1),
      width:
        index === 12
          ? 62
          : index === 3
            ? 54
            : 26
    })
  );

  const validatedRows = results.flatMap(
    result =>
      result.status === "VALIDATED"
        ? [result.row]
        : []
  );

  for (const row of validatedRows) {
    cameraData.addRow(cameraRow(row));
  }

  applySheetDefaults(cameraData);

  await workbook.xlsx.writeFile(partialPath);

  const verification = new ExcelJS.Workbook();
  await verification.xlsx.readFile(partialPath);

  if (!verifyCameraData(verification, validatedRows.length)) {
    await rm(
      partialPath,
      {
        force: true
      }
    );

    throw new Error(
      "Camera13 workbook verification failed before atomic commit."
    );
  }

  await rm(
    outputPath,
    {
      force: true
    }
  );

  await rename(partialPath, outputPath);
}
