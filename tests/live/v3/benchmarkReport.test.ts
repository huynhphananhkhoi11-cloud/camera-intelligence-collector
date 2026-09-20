import ExcelJS from "exceljs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildBenchmarkReport, renderBenchmarkMarkdown } from "./benchmarkReport.js";
import { CAMERA_DATA_HEADERS, type BenchmarkCase } from "./workbookComparator.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("Dev6 evidence-backed benchmark report", () => {
  it("attaches rawText and shotId from Decision Audit to a field mismatch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "dev6-report-"));
    temporaryDirectories.push(directory);

    const workbookPath = join(directory, "benchmark.xlsx");
    const workbook = new ExcelJS.Workbook();

    const data = workbook.addWorksheet("Camera Data");
    data.addRow([...CAMERA_DATA_HEADERS]);
    data.addRow([
      "vjshop.vn",
      "Sony Alpha A7 Mark IV",
      "NEW",
      "33MP full-frame",
      "",
      "",
      "",
      "",
      5,
      7,
      "",
      "50.000.000 VND",
      "https://vjshop.vn/a7-iv"
    ]);

    const audit = workbook.addWorksheet("Decision Audit");
    audit.addRow([
      "URL",
      "Validation status",
      "Validation issues",
      "Evidence JSON",
      "Run ID"
    ]);
    audit.addRow([
      "https://vjshop.vn/a7-iv",
      "VALIDATED",
      "",
      JSON.stringify({
        salePrice: {
          value: 50_000_000,
          currency: "VND",
          rawText: "50.000.000 đ",
          shotId: "hero-01"
        }
      }),
      "run-test"
    ]);

    await workbook.xlsx.writeFile(workbookPath);

    const cases: BenchmarkCase[] = [
      {
        id: "S07",
        site: "vjshop.vn",
        url: "https://vjshop.vn/a7-iv",
        expectedDisposition: "CAMERA",
        stable: {
          productNameIncludes: "Sony Alpha A7 Mark IV",
          condition: "NEW"
        },
        liveReference: {
          salePriceVnd: 53_990_182
        }
      }
    ];

    const report = await buildBenchmarkReport(workbookPath, cases);

    expect(report.summary).toEqual({
      totalSentinels: 1,
      passedSentinels: 0,
      failedSentinels: 1,
      mismatches: 1
    });

    expect(report.mismatches[0]).toEqual(
      expect.objectContaining({
        id: "S07",
        field: "salePrice",
        rawText: "50.000.000 đ",
        shotIds: ["hero-01"],
        validationStatus: "VALIDATED"
      })
    );

    const markdown = renderBenchmarkMarkdown(report);
    expect(markdown).toContain("hero-01");
    expect(markdown).toContain("50.000.000 đ");
  });
});
