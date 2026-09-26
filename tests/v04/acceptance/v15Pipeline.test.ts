import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  EXPECTED_SMOKE4_SUMMARY,
  PUBLISH_CHECKLIST,
  REQUIRED_V15_TEST_COVERAGE,
  SMOKE4_IDS,
  buildMinimalBatchCommand,
  assessComparatorRelease,
  evaluateAcceptance,
  findUnrefreshedCameraCases,
  inspectRequiredCoverage,
  isRecoverableAcceptanceCaptureError,
  selectCasesById,
  shouldResumeCaptureOnly
} from "../../../scripts/v04/run-v15-smoke4.mjs";
import {
  EXPECTED_SENTINEL10_SUMMARY,
  SENTINEL10_IDS,
  assertSmoke4GateBeforeSentinel
} from "../../../scripts/v04/run-v15-sentinel10.mjs";

describe("V15 pipeline/release acceptance contract", () => {
  it("locks Smoke4 and Sentinel10 case IDs", () => {
    expect(SMOKE4_IDS).toEqual(["S01", "S07", "S08", "S10"]);
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

  it("always invokes the V15 release CLI headless with AUDIT_KEEP_ALL evidence retention", () => {
    const command = buildMinimalBatchCommand({
      inputPath: "sentinel.txt",
      outputPath: "result.xlsx",
      captureRoot: ".camintel/v15/captures",
      platform: "win32"
    });

    expect(command.command).toBe("npm.cmd");
    expect(command.args).toEqual([
      "run",
      "smart-batch:minimal",
      "--",
      "sentinel.txt",
      "--output",
      "result.xlsx",
      "--capture-root",
      ".camintel/v15/captures",
      "--retention",
      "AUDIT_KEEP_ALL",
      "--headless"
    ]);
  });

  it("can resume the same V15 durable run id without replaying completed product semantics", () => {
    const command = buildMinimalBatchCommand({
      inputPath: "smoke4.txt",
      outputPath: "smoke4.xlsx",
      captureRoot: ".camintel/v15/captures",
      runId: "v15-existing-run",
      platform: "win32"
    });

    expect(command.args).toContain("--run-id");
    expect(command.args).toContain("v15-existing-run");
  });

  it("auto-resumes only durable CAPTURE transients and never semantic failures", () => {
    const transient = {
      phase: "CAPTURE",
      message: "page.goto: Timeout 20000ms exceeded."
    };

    expect(isRecoverableAcceptanceCaptureError(transient)).toBe(true);
    expect(
      shouldResumeCaptureOnly({
        itemErrors: [transient]
      })
    ).toBe(true);

    expect(
      shouldResumeCaptureOnly({
        itemErrors: [{
          phase: "SEMANTIC",
          message: "GEMINI_INTERACTION_HTTP_ERROR 503"
        }]
      })
    ).toBe(false);

    expect(
      shouldResumeCaptureOnly({
        itemErrors: [{
          phase: "CAPTURE",
          message: "capture artifact write permission denied"
        }]
      })
    ).toBe(false);
  });

  it("accepts only the exact frozen Smoke4/Sentinel10 summaries with zero comparator mismatches", () => {
    expect(
      evaluateAcceptance({
        summary: EXPECTED_SMOKE4_SUMMARY,
        expected: EXPECTED_SMOKE4_SUMMARY,
        mismatches: []
      })
    ).toEqual({ pass: true, problems: [] });

    expect(
      evaluateAcceptance({
        summary: EXPECTED_SENTINEL10_SUMMARY,
        expected: EXPECTED_SENTINEL10_SUMMARY,
        mismatches: []
      })
    ).toEqual({ pass: true, problems: [] });

    const rejected = evaluateAcceptance({
      summary: { ...EXPECTED_SENTINEL10_SUMMARY, skippedNonCamera: 1, errors: 1 },
      expected: EXPECTED_SENTINEL10_SUMMARY,
      mismatches: [{ id: "S10", field: "salePrice" }]
    });

    expect(rejected.pass).toBe(false);
    expect(rejected.problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining("skippedNonCamera"),
        expect.stringContaining("errors"),
        expect.stringContaining("comparator mismatches")
      ])
    );
  });

  it("selects benchmark cases by frozen ID without inventing URLs", () => {
    const cases = [
      { id: "S01", url: "https://example.test/one" },
      { id: "S07", url: "https://example.test/seven" },
      { id: "S08", url: "https://example.test/eight" },
      { id: "S10", url: "https://example.test/ten" }
    ];

    expect(selectCasesById(cases, SMOKE4_IDS)).toEqual(cases);
    expect(() => selectCasesById(cases, ["S01", "missing"])).toThrow(
      "Missing benchmark case missing"
    );
  });

  it("requires overlap/order/resume/classification/reliability coverage before live quota", async () => {
    const root = await mkdtemp(join(tmpdir(), "camintel-v15-coverage-"));

    // Create only the declared coverage fixture tree.
    for (const requirement of REQUIRED_V15_TEST_COVERAGE) {
      const pieces = requirement.path.split("/");
      pieces.pop();
      await mkdir(join(root, ...pieces), { recursive: true });
      await writeFile(
        join(root, requirement.path),
        requirement.markers.map((marker) => marker.example).join("\n"),
        "utf8"
      );
    }

    expect(await inspectRequiredCoverage(root)).toEqual([]);
  });


  it("uses the real V13.2 stalled-font reliability regression path", () => {
    const reliability = REQUIRED_V15_TEST_COVERAGE.find(
      (requirement) => requirement.path === "tests/v04/vision/screenshotReliability.real.test.ts"
    );

    expect(reliability).toBeDefined();
    expect(reliability?.markers).toHaveLength(3);
    expect(
      REQUIRED_V15_TEST_COVERAGE.some(
        (requirement) =>
          requirement.path === "tests/v04/vision/adaptiveCapture.test.ts" &&
          requirement.markers.some((marker) => /font|stalled/i.test(marker.example))
      )
    ).toBe(false);
  });

  it("does not pre-block fresh Smoke4 evidence collection on stale benchmark metadata", async () => {
    const staleCases = findUnrefreshedCameraCases([
      {
        id: "S01",
        expectedDisposition: "CAMERA",
        liveReference: { sourceStatus: "STALE_REFERENCE_REFRESH_IN_BROWSER_BEFORE_RUN" }
      }
    ]);

    expect(staleCases).toHaveLength(1);

    const runnerSource = await readFile(
      join(process.cwd(), "scripts/v04/run-v15-smoke4.mjs"),
      "utf8"
    );
    expect(runnerSource).not.toContain("Ground truth must be refreshed before live quota");
  });

  it("marks stale-only comparator drift as BENCHMARK_REFRESH_REQUIRED with audit paths", () => {
    const result = assessComparatorRelease({
      summary: EXPECTED_SMOKE4_SUMMARY,
      expected: EXPECTED_SMOKE4_SUMMARY,
      mismatches: [{ id: "S01", field: "salePrice" }],
      staleCases: [{ id: "S01", sourceStatus: "STALE_REFERENCE" }],
      captureRoot: ".camintel/acceptance/v15/smoke4/captures",
      outputPath: ".camintel/acceptance/v15/smoke4/smoke4.xlsx",
      reportPath: ".camintel/acceptance/v15/smoke4/acceptance.json",
      auditPath: ".camintel/acceptance/v15/smoke4/benchmark-audit.json"
    });

    expect(result.pass).toBe(false);
    expect(result.releaseBlocker).toBe("BENCHMARK_REFRESH_REQUIRED");
    expect(result.staleMismatchCaseIds).toEqual(["S01"]);
    expect(result.auditPaths).toEqual({
      captureRoot: ".camintel/acceptance/v15/smoke4/captures",
      workbook: ".camintel/acceptance/v15/smoke4/smoke4.xlsx",
      acceptanceReport: ".camintel/acceptance/v15/smoke4/acceptance.json",
      benchmarkAudit: ".camintel/acceptance/v15/smoke4/benchmark-audit.json"
    });
  });

  it("does not mislabel fresh comparator failures as benchmark refresh", () => {
    const result = assessComparatorRelease({
      summary: EXPECTED_SMOKE4_SUMMARY,
      expected: EXPECTED_SMOKE4_SUMMARY,
      mismatches: [{ id: "S07", field: "condition" }],
      staleCases: [],
      captureRoot: "captures",
      outputPath: "smoke4.xlsx",
      reportPath: "acceptance.json",
      auditPath: "benchmark-audit.json"
    });

    expect(result.pass).toBe(false);
    expect(result.releaseBlocker).toBe("ACCEPTANCE_FAILED");
    expect(result.staleMismatchCaseIds).toEqual([]);
  });

  it("locks the Downloads/export/publish checklist", () => {
    expect(PUBLISH_CHECKLIST).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/Smoke4/i),
        expect.stringMatching(/Sentinel10/i),
        expect.stringMatching(/13 frozen headers/i),
        expect.stringMatching(/NON_CAMERA/i),
        expect.stringMatching(/canonical CLI/i),
        expect.stringMatching(/Downloads/i),
        expect.stringMatching(/secret scan/i)
      ])
    );
  });

  it("blocks Sentinel10 unless a fresh Smoke4 gate report says pass", async () => {
    await expect(
      assertSmoke4GateBeforeSentinel({ pass: false, suite: "smoke4" })
    ).rejects.toThrow(/Smoke4/i);

    await expect(
      assertSmoke4GateBeforeSentinel({ pass: true, suite: "smoke4" })
    ).resolves.toBeUndefined();
  });
});
