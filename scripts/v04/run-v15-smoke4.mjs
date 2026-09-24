import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  readFile,
  readdir,
  stat,
  writeFile
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const CAMERA_DATA_HEADERS = Object.freeze([
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

export const SMOKE4_IDS = Object.freeze(["S01", "S07", "S08", "S10"]);

export const EXPECTED_SMOKE4_SUMMARY = Object.freeze({
  total: 4,
  validated: 4,
  review: 0,
  skippedNonCamera: 0,
  errors: 0
});

export const PUBLISH_CHECKLIST = Object.freeze([
  "full V04 TypeScript + Vitest + diff gate passes",
  "Smoke4 passes before Sentinel10",
  "Sentinel10 passes with 8 camera + 2 NON_CAMERA skips",
  "workbook has the exact 13 frozen headers",
  "NON_CAMERA items do not become workbook rows",
  "workbook row order follows deterministic input sequence",
  "canonical CLI uses the V15 reconnaissance -> route selection -> approved discovery -> pipelined runtime path",
  "final user-facing workbook exists in Downloads",
  "architecture hardcode scan is clean",
  "benchmark comparator drift is diagnosed from fresh captures; refresh benchmark rather than semantics when live state changed",
  "secret scan is clean"
]);

export const REQUIRED_V15_TEST_COVERAGE = Object.freeze([
  {
    path: "tests/v04/contracts/v15PipelineContracts.test.ts",
    markers: [
      { pattern: /CameraRouteDecision/i, example: "CameraRouteDecision" },
      { pattern: /FrozenProductVisualPacket/i, example: "FrozenProductVisualPacket" },
      { pattern: /readonly/i, example: "readonly" }
    ]
  },
  {
    path: "tests/v04/recon/siteReconnaissance.test.ts",
    markers: [
      { pattern: /landing/i, example: "landing" },
      { pattern: /navigation|menu|dropdown|hover/i, example: "navigation-reveal" },
      { pattern: /candidateId/i, example: "candidateId" }
    ]
  },
  {
    path: "tests/v04/ai/cameraRouteSelector.test.ts",
    markers: [
      { pattern: /candidateId/i, example: "candidateId" },
      { pattern: /unknown|invent|observed/i, example: "unknown candidate cannot be invented" },
      { pattern: /accessor|voucher|service|non.?camera/i, example: "non-camera accessories rejected" }
    ]
  },
  {
    path: "tests/v04/discovery/approvedRouteDiscovery.test.ts",
    markers: [
      { pattern: /approved/i, example: "approved route only" },
      { pattern: /dedup|duplicate|first.?seen/i, example: "dedupe first-seen" }
    ]
  },
  {
    path: "tests/v04/vision/productCapturePacket.test.ts",
    markers: [
      { pattern: /final.?hero|hero.?refresh|return.*top|scrollY/i, example: "final hero refresh return top scrollY" },
      { pattern: /frozen|immutable|detach/i, example: "frozen immutable detached packet" }
    ]
  },
  {
    path: "tests/v04/runtime/pipelinedProductRuntime.test.ts",
    markers: [
      { pattern: /capture/i, example: "capture P2" },
      { pattern: /semantic|Gemini/i, example: "semantic P1" },
      { pattern: /queue|capacity|bounded/i, example: "queueCapacity bounded" },
      { pattern: /sequence|order/i, example: "sequence order" },
      { pattern: /resume|checkpoint|persist/i, example: "resume checkpoint persisted" }
    ]
  },
  {
    path: "tests/v04/ai/productCameraSemanticPrompt.test.ts",
    markers: [
      { pattern: /CAMERA_PRODUCT/, example: "CAMERA_PRODUCT" },
      { pattern: /NON_CAMERA/, example: "NON_CAMERA" }
    ]
  },
  {
    path: "tests/v04/export/camera13Workbook.test.ts",
    markers: [
      { pattern: /Website/, example: "Website" },
      { pattern: /Tên sản phẩm/, example: "Tên sản phẩm" },
      { pattern: /URL/, example: "URL" }
    ]
  },
  {
    path: "tests/v04/vision/screenshotReliability.real.test.ts",
    markers: [
      { pattern: /playwright|chromium|browser|page\.screenshot/i, example: "real Playwright screenshot" },
      { pattern: /stalled|never[-_\s]?ending|document\.fonts|font/i, example: "stalled never-ending font" },
      { pattern: /fallback|timeout|deadline/i, example: "fallback timeout" }
    ]
  },
  {
    path: "tests/v04/pipeline/cameraOnlyDiscoveryPipeline.test.ts",
    markers: [
      { pattern: /missing|unknown/i, example: "missing candidate ignored" },
      { pattern: /approved/i, example: "approved routes" },
      { pattern: /capture/i, example: "capture" },
      { pattern: /semantic|Gemini/i, example: "semantic" }
    ]
  }
]);

const STALE_SOURCE_MARKERS = Object.freeze([
  "REFRESH_IN_BROWSER_BEFORE_RUN",
  "STALE_",
  "WEB_OPEN_FAILED"
]);

const ARCHITECTURE_SCAN_ROOTS = Object.freeze([
  "src/v04/recon",
  "src/v04/discovery",
  "src/v04/vision",
  "src/v04/runtime",
  "src/v04/pipeline"
]);

const FORBIDDEN_LOCAL_SEMANTIC_MARKERS = /selected[-_\s]?offer|field[-_\s]?by[-_\s]?field|rawText|evidence\s*(?:array|map|record)/iu;

function repoRootFromScript() {
  return fileURLToPath(new URL("../../", import.meta.url));
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function collectSourceFiles(root) {
  if (!(await pathExists(root))) return [];

  const out = [];
  for (const entry of await readdir(root)) {
    const path = join(root, entry);
    const info = await stat(path);
    if (info.isDirectory()) {
      out.push(...(await collectSourceFiles(path)));
    } else if (/\.(?:ts|tsx|js|mjs|cjs)$/i.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

function collectLargeBenchmarkNumbers(value, out = new Set()) {
  if (typeof value === "number" && Number.isFinite(value) && Math.abs(value) >= 100000) {
    out.add(String(value));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectLargeBenchmarkNumbers(item, out);
    return out;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectLargeBenchmarkNumbers(item, out);
  }
  return out;
}

export function buildMinimalBatchCommand({
  inputPath,
  outputPath,
  captureRoot,
  runId = null,
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
    captureRoot,
    "--retention",
    "AUDIT_KEEP_ALL"
  ];

  if (runId) {
    args.push("--run-id", runId);
  }

  args.push("--headless");

  return {
    command: platform === "win32" ? "npm.cmd" : "npm",
    args
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
      problems.push(`${field}: expected ${expected[field]}, got ${summary?.[field]}`);
    }
  }
  if ((mismatches?.length ?? 0) !== 0) {
    problems.push(`comparator mismatches: expected 0, got ${mismatches.length}`);
  }
  return { pass: problems.length === 0, problems };
}

export function assessComparatorRelease({
  summary,
  expected,
  mismatches = [],
  staleCases = [],
  captureRoot,
  outputPath,
  reportPath,
  auditPath
}) {
  const evaluation = evaluateAcceptance({ summary, expected, mismatches });
  const staleIds = new Set(staleCases.map((item) => item.id));
  const staleMismatchCaseIds = [
    ...new Set(mismatches.map((item) => item.id).filter((id) => staleIds.has(id)))
  ];
  const allMismatchesAreStale =
    mismatches.length > 0 && mismatches.every((item) => staleIds.has(item.id));
  const nonComparatorProblems = evaluation.problems.filter(
    (problem) => !problem.startsWith("comparator mismatches:")
  );

  let releaseBlocker = null;
  if (!evaluation.pass) {
    releaseBlocker =
      allMismatchesAreStale && nonComparatorProblems.length === 0
        ? "BENCHMARK_REFRESH_REQUIRED"
        : "ACCEPTANCE_FAILED";
  }

  return {
    ...evaluation,
    releaseBlocker,
    staleBenchmarkCaseIds: staleCases.map((item) => item.id),
    staleMismatchCaseIds,
    diagnosisRequired: releaseBlocker === "BENCHMARK_REFRESH_REQUIRED",
    auditPaths: {
      captureRoot,
      workbook: outputPath,
      acceptanceReport: reportPath,
      benchmarkAudit: auditPath
    }
  };
}

export function extractSummaryFromText(text) {
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
      ) {
        return summary;
      }
    } catch {
      // Ignore non-JSON log lines.
    }
  }
  return null;
}

export async function inspectRequiredCoverage(root) {
  const findings = [];
  for (const requirement of REQUIRED_V15_TEST_COVERAGE) {
    const path = join(root, requirement.path);
    if (!(await pathExists(path))) {
      findings.push(`missing required V15 test: ${requirement.path}`);
      continue;
    }
    const source = await readFile(path, "utf8");
    for (const marker of requirement.markers) {
      if (!marker.pattern.test(source)) {
        findings.push(
          `${requirement.path}: missing coverage marker /${marker.pattern.source}/`
        );
      }
    }
  }
  return findings;
}

export async function scanProductionArchitecture(root) {
  const findings = [];
  const groundTruthPath = join(root, "benchmarks/v3/ground_truth.json");
  if (!(await pathExists(groundTruthPath))) {
    return ["missing benchmarks/v3/ground_truth.json for architecture hardcode scan"];
  }

  const groundTruth = JSON.parse(await readFile(groundTruthPath, "utf8"));
  const retailerHosts = new Set();
  for (const item of groundTruth.cases ?? []) {
    try {
      retailerHosts.add(new URL(item.url).hostname.toLowerCase());
    } catch {
      // Invalid benchmark URL is handled by benchmark tooling elsewhere.
    }
  }
  const benchmarkNumbers = collectLargeBenchmarkNumbers(
    (groundTruth.cases ?? []).map((item) => item.liveReference ?? {})
  );

  for (const relativeRoot of ARCHITECTURE_SCAN_ROOTS) {
    const absoluteRoot = join(root, relativeRoot);
    if (!(await pathExists(absoluteRoot))) {
      findings.push(`missing V15 architecture root: ${relativeRoot}`);
      continue;
    }

    for (const path of await collectSourceFiles(absoluteRoot)) {
      const relative = path.slice(root.length + 1).replaceAll("\\", "/");
      const source = await readFile(path, "utf8");
      const lower = source.toLowerCase();

      for (const host of retailerHosts) {
        if (lower.includes(host)) {
          findings.push(`${relative}: retailer-specific host hardcode ${host}`);
        }
      }

      for (const number of benchmarkNumbers) {
        if (new RegExp(`(^|\\D)${number}(\\D|$)`).test(source)) {
          findings.push(`${relative}: benchmark numeric hardcode ${number}`);
        }
      }

      if (FORBIDDEN_LOCAL_SEMANTIC_MARKERS.test(source)) {
        findings.push(`${relative}: forbidden local semantic repair/evidence marker`);
      }
    }
  }

  return findings;
}

export function buildPortableCommandInvocation(
  command,
  args,
  {
    platform = process.platform,
    comspec = process.env.ComSpec ?? process.env.COMSPEC ?? "cmd.exe"
  } = {}
) {
  if (platform === "win32" && /\.(?:cmd|bat)$/i.test(command)) {
    return {
      command: comspec,
      args: ["/d", "/s", "/c", command, ...args]
    };
  }

  return { command, args: [...args] };
}

function runCommandResult(command, args, { cwd }) {
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
  return result;
}

function runCommand(command, args, { cwd, label }) {
  const result = runCommandResult(command, args, { cwd });
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`);
  }
  return result;
}

export async function runGitDiffCheckWhenAvailable(
  root,
  runner = runCommand
) {
  if (!(await pathExists(join(root, ".git")))) {
    process.stdout.write(
      "V15_DIFF_WHITESPACE_GATE=SKIPPED_ARCHIVE_NO_GIT\n"
    );
    return false;
  }

  runner("git", ["diff", "--check"], {
    cwd: root,
    label: "git diff --check"
  });
  return true;
}

export async function runV15CodeGate(root = repoRootFromScript()) {
  const coverageFindings = await inspectRequiredCoverage(root);
  if (coverageFindings.length) {
    throw new Error(`V15 coverage gate failed:\n${coverageFindings.join("\n")}`);
  }

  const architectureFindings = await scanProductionArchitecture(root);
  if (architectureFindings.length) {
    throw new Error(`V15 architecture gate failed:\n${architectureFindings.join("\n")}`);
  }

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";

  runCommand(npm, ["run", "check"], { cwd: root, label: "npm run check" });
  runCommand(npx, ["vitest", "run", "tests/v04"], {
    cwd: root,
    label: "V04 Vitest suite"
  });
  await runGitDiffCheckWhenAvailable(root);
}

const MAX_CAPTURE_RESUME_PASSES = 2;

export function isRecoverableAcceptanceCaptureError(itemError) {
  if (!itemError || itemError.phase !== "CAPTURE") return false;

  const message = String(itemError.message ?? "").toLowerCase();
  return (
    (message.includes("execution context was destroyed") && message.includes("navigation")) ||
    (message.includes("page.goto") && message.includes("timeout")) ||
    message.includes("frame was detached") ||
    message.includes("net::err_aborted") ||
    message.includes("target page, context or browser has been closed")
  );
}

export function shouldResumeCaptureOnly(runReport) {
  const errors = Array.isArray(runReport?.itemErrors)
    ? runReport.itemErrors
    : [];

  return (
    errors.length > 0 &&
    errors.every(isRecoverableAcceptanceCaptureError)
  );
}

async function readDurableLiveRunReport(outputPath) {
  const path = `${outputPath}.run-report.json`;
  if (!(await pathExists(path))) return null;
  return JSON.parse(await readFile(path, "utf8"));
}

export async function runLiveCliWithCaptureResume({
  root,
  suite,
  inputPath,
  outputPath,
  captureRoot,
  stdoutPath,
  stderrPath
}) {
  let runId = null;
  let stdoutLog = "";
  let stderrLog = "";

  for (let pass = 0; pass <= MAX_CAPTURE_RESUME_PASSES; pass += 1) {
    const command = buildMinimalBatchCommand({
      inputPath,
      outputPath,
      captureRoot,
      runId
    });
    const result = runCommandResult(command.command, command.args, { cwd: root });

    stdoutLog += `\n===== ${suite.toUpperCase()} CLI PASS ${pass + 1} =====\n${result.stdout ?? ""}`;
    stderrLog += `\n===== ${suite.toUpperCase()} CLI PASS ${pass + 1} =====\n${result.stderr ?? ""}`;
    await writeFile(stdoutPath, stdoutLog, "utf8");
    await writeFile(stderrPath, stderrLog, "utf8");

    const report = await readDurableLiveRunReport(outputPath);
    if (report?.itemErrors?.length) {
      process.stdout.write(
        `V15_${suite.toUpperCase()}_ITEM_ERRORS=${JSON.stringify(report.itemErrors, null, 2)}\n`
      );
    }

    if (result.status === 0) {
      return { result, report, passes: pass + 1 };
    }

    if (
      pass >= MAX_CAPTURE_RESUME_PASSES ||
      !report ||
      !shouldResumeCaptureOnly(report) ||
      !report.runId
    ) {
      throw new Error(
        `${suite} live CLI failed with exit code ${result.status}; ` +
        `durable itemErrors=${JSON.stringify(report?.itemErrors ?? [], null, 2)}`
      );
    }

    runId = report.runId;
    process.stdout.write(
      `V15_CAPTURE_RESUME suite=${suite} runId=${runId} pass=${pass + 2} ` +
      `errors=${report.itemErrors.length}\n`
    );
  }

  throw new Error(`${suite} capture-resume loop exhausted unexpectedly`);
}


async function loadGroundTruth(root) {
  return JSON.parse(
    await readFile(join(root, "benchmarks/v3/ground_truth.json"), "utf8")
  );
}

async function loadSummary(outputPath, stdout) {
  const fromStdout = extractSummaryFromText(stdout);
  if (fromStdout) return fromStdout;

  for (const suffix of [".run-report.json", ".run-summary.json"]) {
    const candidate = `${outputPath}${suffix}`;
    if (!(await pathExists(candidate))) continue;
    const parsed = JSON.parse(await readFile(candidate, "utf8"));
    const summary = parsed?.summary ?? parsed;
    if (summary) return summary;
  }

  throw new Error(
    "BatchSummary not observable. Expected final JSON stdout or <output>.run-report.json/.run-summary.json"
  );
}

async function compareWorkbook(root, selectedCases, outputPath) {
  const moduleUrl = pathToFileURL(
    join(root, "tests/live/v3/workbookComparator.ts")
  ).href;
  const comparator = await import(moduleUrl);
  const rows = await comparator.readCameraWorkbook(outputPath);
  const mismatches = comparator.compareRows(selectedCases, rows);
  return { rows, mismatches };
}

async function runLiveSuite({ suite, ids, expected, requireSmoke4 = false }) {
  const root = repoRootFromScript();
  await runV15CodeGate(root);

  const groundTruth = await loadGroundTruth(root);
  const selectedCases = selectCasesById(groundTruth.cases ?? [], ids);
  const stale = findUnrefreshedCameraCases(selectedCases);

  const runDir = resolve(root, ".camintel", "acceptance", "v15", suite);
  const inputPath = join(runDir, `${suite}.txt`);
  const outputPath = join(runDir, `${suite}.xlsx`);
  const captureRoot = join(runDir, "captures");
  const reportPath = join(runDir, "acceptance.json");
  const auditPath = join(runDir, "benchmark-audit.json");
  const stdoutPath = join(runDir, "live-cli.stdout.log");
  const stderrPath = join(runDir, "live-cli.stderr.log");
  await mkdir(captureRoot, { recursive: true });
  await writeFile(inputPath, `${selectedCases.map((item) => item.url).join("\n")}\n`, "utf8");

  const live = await runLiveCliWithCaptureResume({
    root,
    suite,
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
    expected,
    mismatches,
    staleCases: stale,
    captureRoot,
    outputPath,
    reportPath,
    auditPath
  });

  const audit = {
    suite,
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
    suite,
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
    requireSmoke4,
    problems: evaluation.problems
  };
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  if (!evaluation.pass) {
    if (evaluation.releaseBlocker === "BENCHMARK_REFRESH_REQUIRED") {
      throw new Error(
        `${suite} release blocked: BENCHMARK_REFRESH_REQUIRED. ` +
          `Inspect fresh captures at ${captureRoot} and audit ${auditPath}; ` +
          "refresh benchmark reference only if the live capture confirms changed site state."
      );
    }
    throw new Error(
      `${suite} acceptance failed:\n${evaluation.problems.join("\n")}\n` +
        `COMPARATOR_MISMATCHES=${JSON.stringify(mismatches, null, 2)}`
    );
  }

  process.stdout.write(
    `${suite} acceptance PASS; report=${reportPath}; workbook=${outputPath}\n`
  );
  return report;
}

export async function runSmoke4() {
  return runLiveSuite({
    suite: "smoke4",
    ids: SMOKE4_IDS,
    expected: EXPECTED_SMOKE4_SUMMARY
  });
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
}

if (isMainModule()) {
  runSmoke4().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : error);
    process.exitCode = 1;
  });
}
