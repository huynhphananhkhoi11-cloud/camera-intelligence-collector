import { describe, expect, it } from "vitest";

import {
  SENTINEL10_IDS,
  EXPECTED_SENTINEL10_SUMMARY,
  buildSentinel10Command
} from "../../../scripts/v04/run-sentinel10.mjs";

import { evaluateAcceptance } from "../../../scripts/v04/run-smoke4.mjs";

describe("V04 Sentinel10 acceptance harness", () => {
  it("uses all ten frozen sentinel IDs", () => {
    expect(SENTINEL10_IDS).toEqual([
      "S01",
      "S02",
      "S03",
      "S04",
      "S05",
      "S06",
      "S07",
      "S08",
      "S09",
      "S10"
    ]);
  });

  it("invokes the temporary minimal CLI with --headless", () => {
    const command = buildSentinel10Command({
      inputPath: "sentinel10.txt",
      outputPath: "sentinel10.xlsx",
      captureRoot: ".camintel/acceptance/v04/captures/sentinel10",
      platform: "linux"
    });

    expect(command.command).toBe("npm");
    expect(command.args).toContain("smart-batch:minimal");
    expect(command.args).toContain("--headless");
    expect(command.args.at(-1)).toBe("--headless");
  });

  it("passes only at 8 validated, 2 skipped, 0 review, 0 errors and 0 mismatches", () => {
    expect(
      evaluateAcceptance({
        summary: EXPECTED_SENTINEL10_SUMMARY,
        expected: EXPECTED_SENTINEL10_SUMMARY,
        mismatches: []
      })
    ).toEqual({ pass: true, problems: [] });

    expect(
      evaluateAcceptance({
        summary: {
          ...EXPECTED_SENTINEL10_SUMMARY,
          skippedNonCamera: 1,
          errors: 1
        },
        expected: EXPECTED_SENTINEL10_SUMMARY,
        mismatches: []
      }).problems
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("skippedNonCamera"),
        expect.stringContaining("errors")
      ])
    );
  });

  it("fails the gate when the workbook comparator reports any mismatch", () => {
    const result = evaluateAcceptance({
      summary: EXPECTED_SENTINEL10_SUMMARY,
      expected: EXPECTED_SENTINEL10_SUMMARY,
      mismatches: [
        {
          id: "S10",
          field: "accessoriesIncluded",
          message: "missing explicit accessory"
        }
      ]
    });

    expect(result.pass).toBe(false);
    expect(result.problems).toEqual([
      "comparator mismatches: expected 0, got 1"
    ]);
  });
});
