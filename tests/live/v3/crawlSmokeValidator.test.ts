import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { validateCrawlWorkbook } from "./crawlSmokeValidator.js";
import { CAMERA_DATA_HEADERS } from "./workbookComparator.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

async function workbookWith(rows: Array<Array<string | number>>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "dev6-crawl-smoke-"));
  directories.push(directory);

  const path = join(directory, "crawl.xlsx");
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Camera Data");
  sheet.addRow([...CAMERA_DATA_HEADERS]);

  for (const row of rows) sheet.addRow(row);

  await workbook.xlsx.writeFile(path);
  return path;
}

function row(url: string, bundle = "", accessories = ""): Array<string | number> {
  return [
    "zshop.vn",
    "Canon EOS R50",
    "NEW",
    "",
    "",
    "",
    accessories,
    bundle,
    "",
    "",
    "",
    "15.990.000 VND",
    url
  ];
}

describe("Dev6 three-site crawl smoke validator", () => {
  it("allows distinct variation URLs and rejects exact duplicates", async () => {
    const path = await workbookWith([
      row("https://zshop.vn/canon-eos-r50-vi.html?variation_id=65130"),
      row("https://zshop.vn/canon-eos-r50-vi.html?variation_id=70768"),
      row("https://zshop.vn/canon-eos-r50-vi.html?variation_id=70768")
    ]);

    const result = await validateCrawlWorkbook("zshop.vn", path, 15);

    expect(result.status).toBe("FAIL");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "DUPLICATE_URL" })
      ])
    );

    expect(
      result.issues.filter((issue) => issue.code === "DUPLICATE_URL")
    ).toHaveLength(1);
  });

  it("rejects related-product and warranty contamination", async () => {
    const path = await workbookWith([
      row(
        "https://zshop.vn/canon-eos-r50-vi.html",
        "Khách thường mua thêm: lens",
        "Bảo hành 12 tháng"
      )
    ]);

    const result = await validateCrawlWorkbook("zshop.vn", path, 15);

    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "RELATED_PRODUCT_AS_BUNDLE" }),
        expect.objectContaining({ code: "ACCESSORY_POLICY_CONTAMINATION" })
      ])
    );
  });

  it("passes clean rows under the configured site cap", async () => {
    const path = await workbookWith([
      row("https://zshop.vn/canon-eos-r50-vi.html"),
      row("https://zshop.vn/canon-eos-r50-likenew.html")
    ]);

    const result = await validateCrawlWorkbook("zshop.vn", path, 15);

    expect(result).toEqual(
      expect.objectContaining({
        site: "zshop.vn",
        rowCount: 2,
        cap: 15,
        status: "PASS",
        issues: []
      })
    );
  });
});
