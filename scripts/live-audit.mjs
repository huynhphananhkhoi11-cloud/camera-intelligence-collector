import ExcelJS from "exceljs";
import { existsSync } from "node:fs";

const [xlsxPath, site = "unknown"] = process.argv.slice(2);

if (!xlsxPath || !existsSync(xlsxPath)) {
  console.error("LIVE_AUDIT: workbook missing: " + String(xlsxPath ?? ""));
  process.exit(2);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(xlsxPath);

function worksheet(name) {
  const sheet = workbook.getWorksheet(name);
  if (!sheet) {
    throw new Error("Missing worksheet: " + name);
  }
  return sheet;
}

function headerMap(sheet) {
  const values = sheet.getRow(1).values;
  const map = new Map();

  for (let index = 1; index < values.length; index++) {
    map.set(String(values[index] ?? "").trim(), index);
  }

  return map;
}

function textAt(row, header, map) {
  const index = map.get(header);
  if (!index) return "";
  return String(row.getCell(index).text ?? "").trim();
}

function monetaryAmounts(value) {
  const matches = value.match(/\d[\d.,]*/g) ?? [];

  return matches
    .map(raw => Number.parseInt(raw.replace(/\D/g, ""), 10))
    .filter(value => Number.isFinite(value) && value > 0);
}

const camera = worksheet("Camera Data");
const review = worksheet("Review");
const excluded = worksheet("Excluded");
const errors = worksheet("Errors");
const skipped = worksheet("Skipped Pages");
const observations = worksheet("Observations");

const cameraHeaders = headerMap(camera);
const errorHeaders = headerMap(errors);
const skippedHeaders = headerMap(skipped);

const suspiciousPrices = [];
const suspiciousStock = [];
const conditionUnions = [];
const sample = [];

camera.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;

  const name = textAt(row, "Tên sản phẩm", cameraHeaders);
  const condition = textAt(row, "Hàng cũ/Hàng mới", cameraHeaders);
  const stock = textAt(row, "Tồn kho", cameraHeaders);
  const price = textAt(row, "Giá bán", cameraHeaders);
  const url = textAt(row, "URL", cameraHeaders);
  const amounts = monetaryAmounts(price);

  if (
    amounts.some(amount => amount > 1_000_000_000) ||
    amounts.length > 2
  ) {
    suspiciousPrices.push({ name, price, url, amounts });
  }

  if (
    stock.length > 160 ||
    /\b(?:share|print|facebook|zalo)\b/iu.test(stock)
  ) {
    suspiciousStock.push({ name, stock, url });
  }

  if (
    condition.includes("Hàng mới") &&
    condition.includes("Hàng cũ")
  ) {
    conditionUnions.push({ name, condition, url });
  }

  if (sample.length < 25) {
    sample.push({ name, condition, stock, price, url });
  }
});

const errorRows = [];
errors.eachRow((row, rowNumber) => {
  if (rowNumber === 1) return;
  errorRows.push({
    url: textAt(row, "URL", errorHeaders),
    message: textAt(row, "Message", errorHeaders)
  });
});

const assetSkipCount = (() => {
  let count = 0;
  skipped.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const reason = textAt(row, "Reason", skippedHeaders);
    if (/non_html_resource|asset/iu.test(reason)) count++;
  });
  return count;
})();

const summary = {
  site,
  cameraRows: Math.max(0, camera.actualRowCount - 1),
  reviewRows: Math.max(0, review.actualRowCount - 1),
  excludedRows: Math.max(0, excluded.actualRowCount - 1),
  errorRows: Math.max(0, errors.actualRowCount - 1),
  skippedRows: Math.max(0, skipped.actualRowCount - 1),
  observationRows: Math.max(0, observations.actualRowCount - 1),
  assetSkipCount,
  suspiciousPriceCount: suspiciousPrices.length,
  suspiciousStockCount: suspiciousStock.length,
  conditionUnionCount: conditionUnions.length
};

console.log("=== LIVE AUDIT " + site + " ===");
console.log(JSON.stringify(summary, null, 2));

console.log("\n--- CAMERA SAMPLE ---");
for (const row of sample) {
  console.log(JSON.stringify(row));
}

console.log("\n--- ERRORS ---");
for (const row of errorRows.slice(0, 30)) {
  console.log(JSON.stringify(row));
}

console.log("\n--- SUSPICIOUS PRICES ---");
for (const row of suspiciousPrices.slice(0, 30)) {
  console.log(JSON.stringify(row));
}

console.log("\n--- SUSPICIOUS STOCK ---");
for (const row of suspiciousStock.slice(0, 30)) {
  console.log(JSON.stringify(row));
}

console.log("\n--- CONDITION UNIONS (audit, not automatic failure) ---");
for (const row of conditionUnions.slice(0, 30)) {
  console.log(JSON.stringify(row));
}

console.log("\nLIVE_AUDIT_JSON=" + JSON.stringify(summary));

if (
  summary.cameraRows === 0 ||
  summary.suspiciousPriceCount > 0 ||
  summary.suspiciousStockCount > 0
) {
  process.exitCode = 1;
}
