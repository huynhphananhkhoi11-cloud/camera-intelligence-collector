import { spawnSync } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import ExcelJS from "exceljs";

export const SMOKE4_IDS = Object.freeze(["S01", "S07", "S08", "S10"]);

export const EXPECTED_SMOKE4_SUMMARY = Object.freeze({
  total: 4,
  validated: 4,
  review: 0,
  skippedNonCamera: 0,
  errors: 0
});

const CAMERA_DATA_HEADERS = Object.freeze([
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

const STALE_SOURCE_MARKERS = Object.freeze([
  "REFRESH_IN_BROWSER_BEFORE_RUN",
  "STALE_",
  "WEB_OPEN_FAILED"
]);

function repoRoot() {
  return fileURLToPath(new URL("../../", import.meta.url));
}

function cellText(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && value !== null && "text" in value && typeof value.text === "string") {
    return value.text;
  }
  return String(value);
}

function parseVnd(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "");
  const candidates = text.match(/\d[\d.,]*/g) ?? [];
  if (candidates.length !== 1) return null;
  const digits = candidates[0].replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

function numeric(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedUrl(value) {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(value ?? "").trim();
  }
}

function normalizedCondition(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized === "NEW" || normalized === "HÀNG MỚI" || normalized === "HANG MOI") return "NEW";
  if (normalized === "USED" || normalized === "HÀNG CŨ" || normalized === "HANG CU") return "USED";
  return null;
}

const STOCK_COMPARATOR_FILLER_TOKENS = new Set(["có", "sẵn"]);

function stockComparatorTokens(value) {
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

export function stockComparatorMatches(expected, actual) {
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

export function buildMinimalBatchCommand({
  inputPath,
  outputPath,
  captureRoot,
  runId,
  platform = process.platform
}) {
  const args = [
    "run",
    "smart-batch:minimal",
    "--",
    inputPath,
    "--output",
    outputPath,
    "--capture-root",
    captureRoot
  ];

  if (runId?.trim()) {
    args.push(
      "--run-id",
      runId.trim()
    );
  }

  args.push("--headless");

  return {
    command: platform === "win32" ? "npm.cmd" : "npm",
    args
  };
}

export function buildMinimalBatchSpawnOptions(
  platform = process.platform
) {
  return {
    cwd: repoRoot(),
    stdio: ["ignore", "inherit", "inherit"],
    shell: platform === "win32"
  };
}

export function selectCasesById(cases, ids) {
  const byId = new Map(cases.map((item) => [item.id, item]));
  return ids.map((id) => {
    const item = byId.get(id);
    if (!item) throw new Error(`Missing benchmark case ${id}`);
    return item;
  });
}

export function findUnrefreshedCameraCases(cases) {
  return cases
    .filter((item) => item.expectedDisposition === "CAMERA")
    .map((item) => ({
      id: item.id,
      sourceStatus: String(item.liveReference?.sourceStatus ?? "")
    }))
    .filter(
      (item) =>
        item.sourceStatus.length === 0 ||
        STALE_SOURCE_MARKERS.some((marker) => item.sourceStatus.includes(marker))
    );
}

export function evaluateAcceptance({ summary, expected, mismatches }) {
  const problems = [];
  for (const field of ["total", "validated", "review", "skippedNonCamera", "errors"]) {
    if (summary?.[field] !== expected[field]) {
      problems.push(`${field}: expected ${expected[field]}, got ${String(summary?.[field])}`);
    }
  }

  if (mismatches.length !== 0) {
    problems.push(`comparator mismatches: expected 0, got ${mismatches.length}`);
  }

  return { pass: problems.length === 0, problems };
}

export async function readCameraWorkbook(path) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);

  const sheet = workbook.getWorksheet("Camera Data");
  if (!sheet) throw new Error('Missing "Camera Data" sheet');

  const headers = sheet.getRow(1).values.slice(1).map((value) => String(value ?? ""));
  if (JSON.stringify(headers) !== JSON.stringify(CAMERA_DATA_HEADERS)) {
    throw new Error("Camera Data headers mismatch. Expected exact 13-column contract.");
  }

  const rows = [];
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
      rating: row.getCell(9).value,
      reviewCount: row.getCell(10).value,
      stock: cellText(row.getCell(11).value),
      salePrice: row.getCell(12).value,
      url: cellText(row.getCell(13).value)
    });
  }

  return rows;
}

export function compareRows(cases, rows) {
  const mismatches = [];
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
      item.stable?.productNameIncludes &&
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

    if (item.stable?.condition && normalizedCondition(row.condition) !== item.stable.condition) {
      mismatches.push({
        id: item.id,
        field: "condition",
        expected: item.stable.condition,
        actual: row.condition,
        message: "Condition mismatch"
      });
    }

    if (item.stable?.selectedVariantIncludes) {
      const surface = [row.productName, row.bundle].join(" ").toLowerCase();
      if (!surface.includes(item.stable.selectedVariantIncludes.toLowerCase())) {
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
      typeof item.liveReference?.salePriceVnd === "number" &&
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
      typeof item.liveReference?.rentalPricePerDayVnd === "number" &&
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
      typeof item.liveReference?.rating === "number" &&
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
      typeof item.liveReference?.reviewCount === "number" &&
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
      item.liveReference?.stockText &&
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

    for (const expectedAccessory of item.liveReference?.accessoriesIncluded ?? []) {
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

    const nullSurface = {
      rentalPricePerDay: row.rentalPrice,
      rentalTerms: row.rentalTerms,
      accessoriesIncluded: row.accessories,
      bundleIncluded: row.bundle
    };

    for (const field of item.expectedNullFields ?? []) {
      const actual = nullSurface[field] ?? "";
      if (String(actual).trim().length > 0) {
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

function summaryFromValue(value) {
  const candidate = value?.summary ?? value;
  if (!candidate || typeof candidate !== "object") return null;

  const fields = ["total", "validated", "review", "skippedNonCamera", "errors"];
  if (!fields.every((field) => Number.isInteger(candidate[field]))) return null;

  return Object.fromEntries(fields.map((field) => [field, candidate[field]]));
}

export function extractBatchSummary(stdout) {
  const lines = String(stdout ?? "").split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try {
      const summary = summaryFromValue(JSON.parse(lines[index]));
      if (summary) return summary;
    } catch {
      // Non-JSON status output is expected before the final summary.
    }
  }
  return null;
}

async function readSummarySidecar(outputPath) {
  const candidates = [
    `${outputPath}.run-report.json`,
    `${outputPath}.run-summary.json`
  ];

  for (const path of candidates) {
    try {
      await access(path);
      const parsed = JSON.parse(await readFile(path, "utf8"));
      const summary = summaryFromValue(parsed);
      if (summary) return summary;
    } catch {
      // Try the next supported sidecar name.
    }
  }

  return null;
}

async function resolveBatchSummary(stdout, outputPath) {
  const fromStdout = extractBatchSummary(stdout);
  if (fromStdout) return fromStdout;

  const fromSidecar = await readSummarySidecar(outputPath);
  if (fromSidecar) return fromSidecar;

  throw new Error(
    "V04 CLI did not expose BatchSummary. Print a final JSON object with {summary:{total,validated,review,skippedNonCamera,errors}} or write <output>.run-report.json / <output>.run-summary.json."
  );
}

export async function runAcceptance({
  label,
  ids,
  expectedSummary,
  outputPath,
  captureRoot,
  inputPath,
  runId
}) {
  const root = repoRoot();
  const truthPath = join(root, "benchmarks", "v3", "ground_truth.json");
  const truth = JSON.parse(await readFile(truthPath, "utf8"));
  const cases = selectCasesById(truth.cases, ids);

  const stale = findUnrefreshedCameraCases(cases);
  if (stale.length > 0) {
    throw new Error(
      [
        `${label} ground truth is not browser-refreshed for all selected CAMERA cases.`,
        ...stale.map((item) => `${item.id}: ${item.sourceStatus || "MISSING_SOURCE_STATUS"}`),
        "Refresh dynamic fields immediately before the live run and replace sourceStatus with BROWSER_REFRESHED_<timestamp>."
      ].join("\n")
    );
  }

  await mkdir(dirname(inputPath), { recursive: true });
  await mkdir(dirname(outputPath), { recursive: true });
  await mkdir(captureRoot, { recursive: true });
  await writeFile(inputPath, cases.map((item) => item.url).join("\n") + "\n", "utf8");

  const invocation = buildMinimalBatchCommand({
    inputPath,
    outputPath,
    captureRoot,
    runId
  });
  const result = spawnSync(
    invocation.command,
    invocation.args,
    buildMinimalBatchSpawnOptions()
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} V04 CLI failed with exit code ${String(result.status)}`);
  }

  const summary = await resolveBatchSummary("", outputPath);
  const rows = await readCameraWorkbook(outputPath);
  const mismatches = compareRows(cases, rows);
  const gate = evaluateAcceptance({
    summary,
    expected: expectedSummary,
    mismatches
  });

  const report = {
    label,
    inputPath,
    outputPath,
    summary,
    comparatorMismatches: mismatches,
    pass: gate.pass,
    problems: gate.problems
  };

  const reportPath = `${outputPath}.acceptance.json`;
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  process.stdout.write(JSON.stringify(report) + "\n");

  if (!gate.pass) {
    throw new Error(`${label} acceptance FAILED:\n- ${gate.problems.join("\n- ")}`);
  }

  return report;
}

function isDirectExecution() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectExecution()) {
  const root = repoRoot();
  const artifactRoot = join(root, ".camintel", "acceptance", "v04");

  try {
    await runAcceptance({
      label: "Smoke4",
      ids: SMOKE4_IDS,
      expectedSummary: EXPECTED_SMOKE4_SUMMARY,
      inputPath: join(artifactRoot, "smoke4-urls.txt"),
      outputPath: join(artifactRoot, "smoke4.xlsx"),
      captureRoot: join(artifactRoot, "captures", "smoke4"),
      runId:
        process.env.V04_SMOKE4_RUN_ID?.trim() ||
        "v04-smoke4"
    });
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
}
