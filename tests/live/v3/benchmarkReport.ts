import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import {
  compareRows,
  readCameraWorkbook,
  type BenchmarkCase,
  type BenchmarkMismatch
} from "./workbookComparator.js";

import {
  evidenceForField,
  readDecisionAudit,
  type AuditRecord
} from "./auditEvidence.js";

export type EvidenceBackedMismatch = BenchmarkMismatch & {
  url: string;
  rawText: string;
  shotIds: string[];
  validationStatus: string;
  validationIssues: string;
};

export type SentinelResult = {
  id: string;
  url: string;
  expectedDisposition: string;
  status: "PASS" | "FAIL";
  mismatchCount: number;
};

export type BenchmarkReport = {
  generatedAt: string;
  workbookPath: string;
  summary: {
    totalSentinels: number;
    passedSentinels: number;
    failedSentinels: number;
    mismatches: number;
  };
  sentinels: SentinelResult[];
  mismatches: EvidenceBackedMismatch[];
};

function canonicalUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return value.trim();
  }
}

function auditMap(records: AuditRecord[]): Map<string, AuditRecord> {
  return new Map(records.map((record) => [canonicalUrl(record.url), record]));
}

function escapeTable(value: unknown): string {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\r?\n/g, " ");
}

export async function buildBenchmarkReport(
  workbookPath: string,
  cases: BenchmarkCase[]
): Promise<BenchmarkReport> {
  const [rows, audits] = await Promise.all([
    readCameraWorkbook(workbookPath),
    readDecisionAudit(workbookPath)
  ]);

  const baseMismatches = compareRows(cases, rows);
  const auditsByUrl = auditMap(audits);
  const casesById = new Map(cases.map((item) => [item.id, item]));

  const mismatches: EvidenceBackedMismatch[] = baseMismatches.map((mismatch) => {
    const benchmarkCase = casesById.get(mismatch.id);
    const url = benchmarkCase?.url ?? "";
    const audit = auditsByUrl.get(canonicalUrl(url));
    const evidence = evidenceForField(audit?.evidence ?? null, mismatch.field);

    return {
      ...mismatch,
      url,
      rawText: evidence.rawText,
      shotIds: evidence.shotIds,
      validationStatus: audit?.validationStatus ?? "",
      validationIssues: audit?.validationIssues ?? ""
    };
  });

  const mismatchIds = new Set(mismatches.map((item) => item.id));
  const sentinels = cases.map((item) => ({
    id: item.id,
    url: item.url,
    expectedDisposition: item.expectedDisposition,
    status: mismatchIds.has(item.id) ? "FAIL" as const : "PASS" as const,
    mismatchCount: mismatches.filter((mismatch) => mismatch.id === item.id).length
  }));

  const passedSentinels = sentinels.filter((item) => item.status === "PASS").length;

  return {
    generatedAt: new Date().toISOString(),
    workbookPath,
    summary: {
      totalSentinels: cases.length,
      passedSentinels,
      failedSentinels: cases.length - passedSentinels,
      mismatches: mismatches.length
    },
    sentinels,
    mismatches
  };
}

export function renderBenchmarkMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [
    "# Camera Intelligence V3 — Dev6 Benchmark Result",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Workbook: \`${report.workbookPath}\``,
    "",
    "## Summary",
    "",
    `- Sentinels: ${report.summary.totalSentinels}`,
    `- PASS: ${report.summary.passedSentinels}`,
    `- FAIL: ${report.summary.failedSentinels}`,
    `- Field mismatches: ${report.summary.mismatches}`,
    "",
    "## Sentinel status",
    "",
    "| ID | Expected disposition | Status | Mismatches | URL |",
    "| --- | --- | --- | ---: | --- |"
  ];

  for (const item of report.sentinels) {
    lines.push(
      `| ${escapeTable(item.id)} | ${escapeTable(item.expectedDisposition)} | ${item.status} | ${item.mismatchCount} | ${escapeTable(item.url)} |`
    );
  }

  lines.push(
    "",
    "## Field-by-field mismatches",
    "",
    "| ID | Field | Expected | Actual | rawText | shotId | Validation | Issues |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |"
  );

  if (report.mismatches.length === 0) {
    lines.push("| — | — | — | — | — | — | — | No mismatches |");
  } else {
    for (const mismatch of report.mismatches) {
      lines.push(
        `| ${escapeTable(mismatch.id)} | ${escapeTable(mismatch.field)} | ${escapeTable(mismatch.expected)} | ${escapeTable(mismatch.actual)} | ${escapeTable(mismatch.rawText)} | ${escapeTable(mismatch.shotIds.join(", "))} | ${escapeTable(mismatch.validationStatus)} | ${escapeTable(mismatch.validationIssues || mismatch.message)} |`
      );
    }
  }

  lines.push("");
  return lines.join("\n");
}

export async function writeBenchmarkReport(
  workbookPath: string,
  groundTruthPath: string,
  outputPrefix: string
): Promise<BenchmarkReport> {
  const raw = JSON.parse(await readFile(groundTruthPath, "utf8")) as {
    cases: BenchmarkCase[];
  };

  const report = await buildBenchmarkReport(workbookPath, raw.cases);
  const markdownPath = outputPrefix + ".md";
  const jsonPath = outputPrefix + ".json";

  await mkdir(dirname(markdownPath), { recursive: true });

  await Promise.all([
    writeFile(markdownPath, renderBenchmarkMarkdown(report), "utf8"),
    writeFile(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8")
  ]);

  return report;
}
