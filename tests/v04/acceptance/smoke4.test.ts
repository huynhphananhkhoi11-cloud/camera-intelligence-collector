import { describe, expect, it } from "vitest";

import {
  EXPECTED_SMOKE4_SUMMARY,
  SMOKE4_IDS,
  buildMinimalBatchCommand,
  buildMinimalBatchSpawnOptions,
  evaluateAcceptance,
  findUnrefreshedCameraCases,
  selectCasesById,
  stockComparatorMatches
} from "../../../scripts/v04/run-smoke4.mjs";

describe("V04 Smoke4 acceptance harness", () => {
  it("uses exactly S01, S07, S08 and S10", () => {
    expect(SMOKE4_IDS).toEqual(["S01", "S07", "S08", "S10"]);
  });

  it("invokes the temporary minimal CLI with --headless", () => {
    const command = buildMinimalBatchCommand({
      inputPath: "smoke4.txt",
      outputPath: "smoke4.xlsx",
      captureRoot: ".camintel/acceptance/v04/captures/smoke4",
      platform: "win32"
    });

    expect(command.command).toBe("npm.cmd");
    expect(command.args).toEqual([
      "run",
      "smart-batch:minimal",
      "--",
      "smoke4.txt",
      "--output",
      "smoke4.xlsx",
      "--capture-root",
      ".camintel/acceptance/v04/captures/smoke4",
      "--headless"
    ]);
    expect(command.args).toContain("--headless");
  });

  it("can resume the exact durable run id instead of repeating completed URLs", () => {
    const command = buildMinimalBatchCommand({
      inputPath: "smoke4.txt",
      outputPath: "smoke4.xlsx",
      captureRoot: ".camintel/acceptance/v04/captures/smoke4",
      runId: "v04-existing-run",
      platform: "win32"
    });

    expect(command.args).toContain("--run-id");
    expect(command.args).toContain("v04-existing-run");
  });


  it("streams child CLI output live instead of buffering it", () => {
    expect(buildMinimalBatchSpawnOptions("win32")).toEqual({
      cwd: expect.any(String),
      stdio: ["ignore", "inherit", "inherit"],
      shell: true
    });
  });

  it("accepts stable stock wording when live branch counts or availability filler words change", () => {
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

  it("passes only with the exact Smoke4 summary and zero comparator mismatches", () => {
    expect(
      evaluateAcceptance({
        summary: EXPECTED_SMOKE4_SUMMARY,
        expected: EXPECTED_SMOKE4_SUMMARY,
        mismatches: []
      })
    ).toEqual({ pass: true, problems: [] });

    expect(
      evaluateAcceptance({
        summary: {
          ...EXPECTED_SMOKE4_SUMMARY,
          review: 1,
          validated: 3
        },
        expected: EXPECTED_SMOKE4_SUMMARY,
        mismatches: []
      }).pass
    ).toBe(false);

    expect(
      evaluateAcceptance({
        summary: EXPECTED_SMOKE4_SUMMARY,
        expected: EXPECTED_SMOKE4_SUMMARY,
        mismatches: [{ id: "S01", field: "salePrice" }]
      }).pass
    ).toBe(false);
  });

  it("refresh-gates only the selected Smoke4 camera cases", () => {
    const cases = [
      {
        id: "S01",
        expectedDisposition: "CAMERA",
        liveReference: { sourceStatus: "STALE_REFRESH_IN_BROWSER_BEFORE_RUN" }
      },
      {
        id: "S02",
        expectedDisposition: "CAMERA",
        liveReference: { sourceStatus: "STALE_REFRESH_IN_BROWSER_BEFORE_RUN" }
      },
      {
        id: "S07",
        expectedDisposition: "CAMERA",
        liveReference: { sourceStatus: "BROWSER_REFRESHED_2026-09-21T14:30:00+07:00" }
      },
      {
        id: "S08",
        expectedDisposition: "CAMERA",
        liveReference: { sourceStatus: "BROWSER_REFRESHED_2026-09-21T14:31:00+07:00" }
      },
      {
        id: "S10",
        expectedDisposition: "CAMERA",
        liveReference: { sourceStatus: "BROWSER_REFRESHED_2026-09-21T14:32:00+07:00" }
      }
    ];

    const selected = selectCasesById(cases, SMOKE4_IDS);

    expect(selected.map((item) => item.id)).toEqual(SMOKE4_IDS);
    expect(findUnrefreshedCameraCases(selected)).toEqual([
      expect.objectContaining({ id: "S01" })
    ]);
  });
});
