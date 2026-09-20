import ExcelJS from "exceljs";

export const CAMERA_DATA_HEADERS = [
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

export type BenchmarkDisposition =
  | "CAMERA"
  | "NON_CAMERA_LENS"
  | "NON_PRODUCT";

export type BenchmarkCase = {
  id: string;
  site: string;
  url: string;
  expectedDisposition: BenchmarkDisposition;
  stable: {
    productNameIncludes?: string;
    condition?: "NEW" | "USED";
    selectedVariantIncludes?: string;
  };
  liveReference: {
    salePriceVnd?: number | null;
    rentalPricePerDayVnd?: number | null;
    stockText?: string | null;
    accessoriesIncluded?: string[];
    [key: string]: unknown;
  };
};

export type BenchmarkMismatch = {
  id: string;
  field: string;
  expected: unknown;
  actual: unknown;
  message: string;
};

type CameraRow = {
  website: string;
  productName: string;
  condition: string;
  rentalPrice: string;
  accessories: string;
  bundle: string;
  rating: string | number;
  reviewCount: string | number;
  stock: string;
  salePrice: string | number;
  url: string;
};

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  return String(value);
}

function parseVnd(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "");
  const candidates = text.match(/\d[\d.,]*/g) ?? [];
  if (candidates.length !== 1) return null;
  const digits = candidates[0].replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

function normalizedUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function conditionLabel(condition: "NEW" | "USED"): string {
  return condition === "NEW" ? "Hàng mới" : "Hàng cũ";
}

export async function readCameraWorkbook(path: string): Promise<CameraRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  const sheet = workbook.getWorksheet("Camera Data");
  if (!sheet) {
    throw new Error("Missing Camera Data sheet");
  }

  const headers = sheet.getRow(1).values.slice(1).map((value) => String(value ?? ""));
  if (JSON.stringify(headers) !== JSON.stringify(CAMERA_DATA_HEADERS)) {
    throw new Error(
      "Camera Data headers mismatch. Expected exact 13-column contract."
    );
  }

  const rows: CameraRow[] = [];
  for (let index = 2; index <= sheet.actualRowCount; index += 1) {
    const row = sheet.getRow(index);
    if (!row.hasValues) continue;

    rows.push({
      website: cellText(row.getCell(1).value),
      productName: cellText(row.getCell(2).value),
      condition: cellText(row.getCell(3).value),
      rentalPrice: cellText(row.getCell(5).value),
      accessories: cellText(row.getCell(7).value),
      bundle: cellText(row.getCell(8).value),
      rating: row.getCell(9).value as string | number,
      reviewCount: row.getCell(10).value as string | number,
      stock: cellText(row.getCell(11).value),
      salePrice: row.getCell(12).value as string | number,
      url: cellText(row.getCell(13).value)
    });
  }

  return rows;
}

export function compareRows(
  cases: BenchmarkCase[],
  rows: CameraRow[]
): BenchmarkMismatch[] {
  const mismatches: BenchmarkMismatch[] = [];
  const byUrl = new Map(rows.map((row) => [normalizedUrl(row.url), row]));

  for (const item of cases) {
    const row = byUrl.get(normalizedUrl(item.url));

    if (item.expectedDisposition !== "CAMERA") {
      if (row) {
        mismatches.push({
          id: item.id,
          field: "disposition",
          expected: item.expectedDisposition,
          actual: "CAMERA_ROW_PRESENT",
          message: "Negative sentinel leaked into Camera Data"
        });
      }
      continue;
    }

    if (!row) {
      mismatches.push({
        id: item.id,
        field: "disposition",
        expected: "CAMERA",
        actual: "MISSING",
        message: "Expected camera row is missing"
      });
      continue;
    }

    if (row.website !== item.site) {
      mismatches.push({
        id: item.id,
        field: "website",
        expected: item.site,
        actual: row.website,
        message: "Website host mismatch"
      });
    }

    if (
      item.stable.productNameIncludes &&
      !row.productName.toLowerCase().includes(item.stable.productNameIncludes.toLowerCase())
    ) {
      mismatches.push({
        id: item.id,
        field: "productName",
        expected: item.stable.productNameIncludes,
        actual: row.productName,
        message: "Product identity mismatch"
      });
    }

    if (
      item.stable.condition &&
      row.condition.trim().toLowerCase() !== conditionLabel(item.stable.condition).toLowerCase()
    ) {
      mismatches.push({
        id: item.id,
        field: "condition",
        expected: conditionLabel(item.stable.condition),
        actual: row.condition,
        message: "Condition mismatch"
      });
    }

    if (
      typeof item.liveReference.salePriceVnd === "number" &&
      parseVnd(row.salePrice) !== item.liveReference.salePriceVnd
    ) {
      mismatches.push({
        id: item.id,
        field: "salePrice",
        expected: item.liveReference.salePriceVnd,
        actual: row.salePrice,
        message: "Selected current sale price mismatch"
      });
    }

    if (
      typeof item.liveReference.rentalPricePerDayVnd === "number" &&
      parseVnd(row.rentalPrice) !== item.liveReference.rentalPricePerDayVnd
    ) {
      mismatches.push({
        id: item.id,
        field: "rentalPricePerDay",
        expected: item.liveReference.rentalPricePerDayVnd,
        actual: row.rentalPrice,
        message: "Rental price/day mismatch"
      });
    }

    if (
      item.liveReference.stockText &&
      !row.stock.toLowerCase().includes(item.liveReference.stockText.toLowerCase())
    ) {
      mismatches.push({
        id: item.id,
        field: "stock",
        expected: item.liveReference.stockText,
        actual: row.stock,
        message: "Stock mismatch"
      });
    }

    if (item.liveReference.accessoriesIncluded) {
      for (const expectedAccessory of item.liveReference.accessoriesIncluded) {
        if (!row.accessories.toLowerCase().includes(expectedAccessory.toLowerCase())) {
          mismatches.push({
            id: item.id,
            field: "accessoriesIncluded",
            expected: expectedAccessory,
            actual: row.accessories,
            message: "Expected explicit accessory is missing"
          });
        }
      }
    }
  }

  return mismatches;
}
