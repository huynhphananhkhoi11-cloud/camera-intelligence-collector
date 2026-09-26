import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildPortableCommandInvocation,
  assessComparatorRelease,
  findUnrefreshedCameraCases,
  inspectRequiredCoverage,
  runV15CodeGate,
  runLiveCliWithCaptureResume,
  scanProductionArchitecture,
  selectCasesById
} from "./run-v15-smoke4.mjs";
import { spawnSync } from "node:child_process";

export const SENTINEL10_IDS = Object.freeze([
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

export const EXPECTED_SENTINEL10_SUMMARY = Object.freeze({
  total: 10,
  validated: 8,
  review: 0,
  skippedNonCamera: 2,
  errors: 0
});

function repoRootFromScript() {
  return fileURLToPath(new URL("../../", import.meta.url));
}

async function pathExists(path) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

export async function assertSmoke4GateBeforeSentinel(report) {
  if (!report || report.suite !== "smoke4" || report.pass !== true) {
    throw new Error("Sentinel10 is blocked until Smoke4 has a passing acceptance report");
  }
}

function runCommand(command, args, { cwd, label }) {
  const invocation = buildPortableCommandInvocation(command, args);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 32 * 1024 * 1024
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`);
  return result;
}

function extractSummaryFromText(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line.startsWith("{") || !line.endsWith("}")) continue;
    try {
      const parsed = JSON.parse(line);
      const summary = parsed?.summary ?? parsed;
      if (
        summary &&
        ["total", "validated", "review", "skippedNonCamera", "errors"].every(
          (field) => Number.isInteger(summary[field])
        )
      ) return summary;
    } catch {
      // Ignore non-JSON log lines.
    }
  }
  return null;
}

async function loadSummary(outputPath, stdout) {
  const direct = extractSummaryFromText(stdout);
  if (direct) return direct;
  for (const suffix of [".run-report.json", ".run-summary.json"]) {
    const path = `${outputPath}${suffix}`;
    if (!(await pathExists(path))) continue;
    const parsed = JSON.parse(await readFile(path, "utf8"));
    return parsed?.summary ?? parsed;
  }
  throw new Error(
    "BatchSummary not observable. Expected final JSON stdout or <output>.run-report.json/.run-summary.json"
  );
}

async function compareWorkbook(root, selectedCases, outputPath) {
  const comparator = await import(
    pathToFileURL(join(root, "tests/live/v3/workbookComparator.ts")).href
  );
  const rows = await comparator.readCameraWorkbook(outputPath);
  return { rows, mismatches: comparator.compareRows(selectedCases, rows) };
}

export async function runSentinel10() {
  const root = repoRootFromScript();
  const smokeReportPath = join(root, ".camintel", "acceptance", "v15", "smoke4", "acceptance.json");
  if (!(await pathExists(smokeReportPath))) {
    throw new Error("Sentinel10 is blocked: Smoke4 acceptance report is missing");
  }
  const smokeReport = JSON.parse(await readFile(smokeReportPath, "utf8"));
  await assertSmoke4GateBeforeSentinel(smokeReport);

  // Re-run code/architecture gates so Sentinel10 cannot reuse a stale green code state.
  await runV15CodeGate(root);
  const coverageFindings = await inspectRequiredCoverage(root);
  const architectureFindings = await scanProductionArchitecture(root);
  if (coverageFindings.length || architectureFindings.length) {
    throw new Error(
      [...coverageFindings, ...architectureFindings].join("\n")
    );
  }

  const groundTruth = JSON.parse(
    await readFile(join(root, "benchmarks/v3/ground_truth.json"), "utf8")
  );
  const selectedCases = selectCasesById(groundTruth.cases ?? [], SENTINEL10_IDS);
  const stale = findUnrefreshedCameraCases(selectedCases);

  const runDir = resolve(root, ".camintel", "acceptance", "v15", "sentinel10");
  const inputPath = join(runDir, "sentinel10.txt");
  const outputPath = join(runDir, "sentinel10.xlsx");
  const captureRoot = join(runDir, "captures");
  const reportPath = join(runDir, "acceptance.json");
  const auditPath = join(runDir, "benchmark-audit.json");
  const stdoutPath = join(runDir, "live-cli.stdout.log");
  const stderrPath = join(runDir, "live-cli.stderr.log");
  await mkdir(captureRoot, { recursive: true });
  await writeFile(inputPath, `${selectedCases.map((item) => item.url).join("\n")}\n`, "utf8");

  const live = await runLiveCliWithCaptureResume({
    root,
    suite: "sentinel10",
    inputPath,
    outputPath,
    captureRoot,
    stdoutPath,
    stderrPath
  });
  const result = live.result;

  const summary = live.report?.summary ?? await loadSummary(outputPath, result.stdout);
  const { rows, mismatches } = await compareWorkbook(root, selectedCases, outputPath);
  const evaluation = assessComparatorRelease({
    summary,
    expected: EXPECTED_SENTINEL10_SUMMARY,
    mismatches,
    staleCases: stale,
    captureRoot,
    outputPath,
    reportPath,
    auditPath
  });

  const audit = {
    suite: "sentinel10",
    generatedAt: new Date().toISOString(),
    staleBenchmarkCases: stale,
    mismatchCount: mismatches.length,
    mismatches,
    releaseBlocker: evaluation.releaseBlocker,
    diagnosisRequired: evaluation.diagnosisRequired,
    guidance:
      evaluation.releaseBlocker === "BENCHMARK_REFRESH_REQUIRED"
        ? "Inspect the fresh capture packet and workbook. If the mismatch reflects changed live state, refresh the benchmark reference; do not change semantic/runtime code to fabricate historical values."
        : "Use fresh captures to diagnose comparator mismatches. Do not change semantic/runtime code to fabricate benchmark values.",
    paths: {
      captureRoot,
      workbook: outputPath,
      acceptanceReport: reportPath,
      stdoutLog: stdoutPath,
      stderrLog: stderrPath
    }
  };
  await writeFile(auditPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");

  const report = {
    suite: "sentinel10",
    pass: evaluation.pass,
    generatedAt: new Date().toISOString(),
    summary,
    mismatchCount: mismatches.length,
    mismatches,
    staleBenchmarkCaseIds: evaluation.staleBenchmarkCaseIds,
    staleMismatchCaseIds: evaluation.staleMismatchCaseIds,
    releaseBlocker: evaluation.releaseBlocker,
    diagnosisRequired: evaluation.diagnosisRequired,
    auditPaths: {
      ...evaluation.auditPaths,
      stdoutLog: stdoutPath,
      stderrLog: stderrPath
    },
    workbookRowCount: rows.length,
    outputPath,
    problems: evaluation.problems
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (!evaluation.pass) {
    if (evaluation.releaseBlocker === "BENCHMARK_REFRESH_REQUIRED") {
      throw new Error(
        `sentinel10 release blocked: BENCHMARK_REFRESH_REQUIRED. ` +
          `Inspect fresh captures at ${captureRoot} and audit ${auditPath}; ` +
          "refresh benchmark reference only if the live capture confirms changed site state."
      );
    }
    throw new Error(`sentinel10 acceptance failed:\n${evaluation.problems.join("\n")}`);
  }

  process.stdout.write(
    `sentinel10 acceptance PASS; report=${reportPath}; workbook=${outputPath}\n`
  );
  return report;
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  runSentinel10().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
