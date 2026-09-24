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
    rating?: number | null;
    reviewCount?: number | null;
    [key: string]: unknown;
  };
  expectedNullFields?: Array<
    "rentalPricePerDay" |
    "rentalTerms" |
    "accessoriesIncluded" |
    "bundleIncluded"
  >;
};

export type BenchmarkMismatch = {
  id: string;
  field: string;
  expected: unknown;
  actual: unknown;
  message: string;
};

export type CameraRow = {
  website: string;
  productName: string;
  condition: string;
  rentalPrice: string;
  rentalTerms: string;
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

function numeric(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = String(value ?? "").trim();
  if (!text) return null;

  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
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

function normalizedCondition(value: string): "NEW" | "USED" | null {
  const normalized = value.trim().toUpperCase();

  if (normalized === "NEW" || normalized === "HÀNG MỚI" || normalized === "HANG MOI") {
    return "NEW";
  }

  if (normalized === "USED" || normalized === "HÀNG CŨ" || normalized === "HANG CU") {
    return "USED";
  }

  return null;
}

const STOCK_COMPARATOR_FILLER_TOKENS = new Set(["có", "sẵn"]);

function stockComparatorTokens(value: unknown): string[] {
  return String(value ?? "")
    .normalize("NFC")
    .toLocaleLowerCase("vi-VN")
    .replace(/\d+/gu, " ")
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !STOCK_COMPARATOR_FILLER_TOKENS.has(token));
}

export function stockComparatorMatches(expected: unknown, actual: unknown): boolean {
  const expectedTokens = stockComparatorTokens(expected);
  const actualTokens = stockComparatorTokens(actual);

  if (expectedTokens.length === 0 || actualTokens.length === 0) return false;

  let cursor = 0;
  for (const token of actualTokens) {
    if (token === expectedTokens[cursor]) cursor += 1;
    if (cursor === expectedTokens.length) return true;
  }

  return false;
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
      rentalTerms: cellText(row.getCell(6).value),
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
      normalizedCondition(row.condition) !== item.stable.condition
    ) {
      mismatches.push({
        id: item.id,
        field: "condition",
        expected: item.stable.condition,
        actual: row.condition,
        message: "Condition mismatch"
      });
    }

    if (item.stable.selectedVariantIncludes) {
      const variantSurface = [row.productName, row.bundle].join(" ").toLowerCase();

      if (!variantSurface.includes(item.stable.selectedVariantIncludes.toLowerCase())) {
        mismatches.push({
          id: item.id,
          field: "selectedVariant",
          expected: item.stable.selectedVariantIncludes,
          actual: [row.productName, row.bundle].filter(Boolean).join(" | "),
          message: "Selected variant/kit identity mismatch"
        });
      }
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
      typeof item.liveReference.rating === "number" &&
      numeric(row.rating) !== item.liveReference.rating
    ) {
      mismatches.push({
        id: item.id,
        field: "rating",
        expected: item.liveReference.rating,
        actual: row.rating,
        message: "Rating mismatch"
      });
    }

    if (
      typeof item.liveReference.reviewCount === "number" &&
      numeric(row.reviewCount) !== item.liveReference.reviewCount
    ) {
      mismatches.push({
        id: item.id,
        field: "reviewCount",
        expected: item.liveReference.reviewCount,
        actual: row.reviewCount,
        message: "Review count mismatch"
      });
    }

    if (
      item.liveReference.stockText &&
      !stockComparatorMatches(item.liveReference.stockText, row.stock)
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

    if (/(?:bảo\s*hành|bao\s*hanh|warranty|vat|chính\s*sách|chinh\s*sach)/iu.test(row.accessories)) {
      mismatches.push({
        id: item.id,
        field: "accessoriesIncluded",
        expected: "No warranty/VAT/policy contamination",
        actual: row.accessories,
        message: "Warranty/VAT/policy text leaked into accessories"
      });
    }

    if (/(?:khách\s*thường\s*mua\s*thêm|khach\s*thuong\s*mua\s*them|customers?\s+also\s+buy|frequently\s+bought|related\s+products?)/iu.test(row.bundle)) {
      mismatches.push({
        id: item.id,
        field: "bundleIncluded",
        expected: "No related/customers-also-buy contamination",
        actual: row.bundle,
        message: "Related product content leaked into bundle"
      });
    }

    const nullSurface: Record<string, string> = {
      rentalPricePerDay: row.rentalPrice,
      rentalTerms: row.rentalTerms,
      accessoriesIncluded: row.accessories,
      bundleIncluded: row.bundle
    };

    for (const field of item.expectedNullFields ?? []) {
      const actual = nullSurface[field] ?? "";
      if (actual.trim().length > 0) {
        mismatches.push({
          id: item.id,
          field,
          expected: null,
          actual,
          message: "Field must remain null when no explicit evidence exists"
        });
      }
    }
  }

  return mismatches;
}
