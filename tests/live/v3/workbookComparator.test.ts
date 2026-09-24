import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  CAMERA_DATA_HEADERS,
  compareRows,
  readCameraWorkbook,
  stockComparatorMatches,
  type BenchmarkCase
} from "./workbookComparator.js";

const tempDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function writeWorkbook(
  rows: Array<Array<string | number | null>>
): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "v3-live-benchmark-"));
  tempDirectories.push(directory);

  const path = join(directory, "CameraIntelligence_V3_RC.xlsx");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Camera Data");
  sheet.addRow([...CAMERA_DATA_HEADERS]);

  for (const row of rows) {
    sheet.addRow(row);
  }

  await workbook.xlsx.writeFile(path);
  return path;
}

describe("V15 live stock comparator normalization", () => {
  it("accepts a live availability phrase with a volatile branch count and filler wording", () => {
    expect(
      stockComparatorMatches(
        "cửa hàng có sản phẩm",
        "Có 4 cửa hàng có sẵn sản phẩm"
      )
    ).toBe(true);

    expect(
      stockComparatorMatches(
        "cửa hàng có sản phẩm",
        "Bảo hành 24 tháng chính hãng"
      )
    ).toBe(false);
  });
});

describe("Dev6 workbook comparator", () => {
  it("accepts exact 13-column Camera Data and compares stable/live fields", async () => {
    const path = await writeWorkbook([
      [
        "zshop.vn",
        "Canon EOS R50",
        "NEW",
        "APS-C CMOS 24.2MP",
        "400.000 VND/ngày",
        "",
        "",
        "",
        "",
        "",
        "",
        "15.990.000 VND",
        "https://zshop.vn/canon-eos-r50-vi.html"
      ]
    ]);

    const rows = await readCameraWorkbook(path);
    const cases: BenchmarkCase[] = [
      {
        id: "S01",
        site: "zshop.vn",
        url: "https://zshop.vn/canon-eos-r50-vi.html",
        expectedDisposition: "CAMERA",
        stable: {
          productNameIncludes: "Canon EOS R50",
          condition: "NEW"
        },
        liveReference: {
          salePriceVnd: 15_990_000,
          rentalPricePerDayVnd: 400_000
        }
      }
    ];

    expect(compareRows(cases, rows)).toEqual([]);
  });

  it("flags a non-camera sentinel if it leaks into Camera Data", async () => {
    const path = await writeWorkbook([
      [
        "zshop.vn",
        "Sony FE 50mm F/1.8",
        "Hàng mới",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "4.000.000 VND",
        "https://zshop.vn/sony-fe-50mm-f-1.8.html"
      ]
    ]);

    const rows = await readCameraWorkbook(path);
    const cases: BenchmarkCase[] = [
      {
        id: "S05",
        site: "zshop.vn",
        url: "https://zshop.vn/sony-fe-50mm-f-1.8.html",
        expectedDisposition: "NON_CAMERA_LENS",
        stable: { productNameIncludes: "Sony FE 50mm" },
        liveReference: {}
      }
    ];

    expect(compareRows(cases, rows)).toEqual([
      expect.objectContaining({
        id: "S05",
        field: "disposition",
        actual: "CAMERA_ROW_PRESENT"
      })
    ]);
  });

  it("rejects any Camera Data workbook whose header order is not exact", async () => {
    const directory = await mkdtemp(join(tmpdir(), "v3-live-benchmark-bad-header-"));
    tempDirectories.push(directory);
    const path = join(directory, "bad.xlsx");

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Camera Data");
    sheet.addRow([...CAMERA_DATA_HEADERS].reverse());
    await workbook.xlsx.writeFile(path);

    await expect(readCameraWorkbook(path)).rejects.toThrow(
      "Camera Data headers mismatch"
    );
  });
});


describe("Dev6 commerce contamination and visible review gates", () => {
  it("flags related-products-as-bundle and validates visible review count", async () => {
    const path = await writeWorkbook([
      [
        "vjshop.vn",
        "Sony Alpha A7 Mark IV (Body Only)",
        "NEW",
        "",
        "",
        "",
        "",
        "Khách thường mua thêm: thẻ nhớ",
        5,
        4,
        "",
        "53.990.182 VND",
        "https://vjshop.vn/a7-iv"
      ]
    ]);

    const rows = await readCameraWorkbook(path);
    const cases: BenchmarkCase[] = [
      {
        id: "S07",
        site: "vjshop.vn",
        url: "https://vjshop.vn/a7-iv",
        expectedDisposition: "CAMERA",
        stable: {
          productNameIncludes: "Sony Alpha A7 Mark IV",
          condition: "NEW",
          selectedVariantIncludes: "Body Only"
        },
        liveReference: {
          salePriceVnd: 53_990_182,
          reviewCount: 7
        }
      }
    ];

    const mismatches = compareRows(cases, rows);

    expect(mismatches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: "reviewCount" }),
        expect.objectContaining({ field: "bundleIncluded" })
      ])
    );
  });
});
