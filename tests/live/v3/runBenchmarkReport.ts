import { resolve } from "node:path";

import { writeBenchmarkReport } from "./benchmarkReport.js";

const workbookPath = process.argv[2];

if (!workbookPath) {
  throw new Error(
    "Usage: npx tsx tests/live/v3/runBenchmarkReport.ts <workbook.xlsx> [output-prefix]"
  );
}

const outputPrefix =
  process.argv[3] ??
  resolve(process.cwd(), "benchmarks/v3/results/dev6-live");

const groundTruthPath =
  resolve(process.cwd(), "benchmarks/v3/ground_truth.json");

const report = await writeBenchmarkReport(
  resolve(process.cwd(), workbookPath),
  groundTruthPath,
  outputPrefix
);

process.stdout.write(
  [
    "DEV6 BENCHMARK REPORT",
    `Sentinels: ${report.summary.totalSentinels}`,
    `PASS: ${report.summary.passedSentinels}`,
    `FAIL: ${report.summary.failedSentinels}`,
    `Mismatches: ${report.summary.mismatches}`,
    `Output: ${outputPrefix}.md / ${outputPrefix}.json`
  ].join("\n") + "\n"
);

if (report.summary.failedSentinels > 0) {
  process.exitCode = 1;
}
