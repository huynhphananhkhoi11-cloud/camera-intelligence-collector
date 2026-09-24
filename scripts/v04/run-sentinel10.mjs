import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildMinimalBatchCommand,
  runAcceptance
} from "./run-smoke4.mjs";

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

export function buildSentinel10Command(options) {
  return buildMinimalBatchCommand(options);
}

function repoRoot() {
  return fileURLToPath(new URL("../../", import.meta.url));
}

function isDirectExecution() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isDirectExecution()) {
  const root = repoRoot();
  const artifactRoot = join(root, ".camintel", "acceptance", "v04");

  try {
    await runAcceptance({
      label: "Sentinel10",
      ids: SENTINEL10_IDS,
      expectedSummary: EXPECTED_SENTINEL10_SUMMARY,
      inputPath: join(artifactRoot, "sentinel10-urls.txt"),
      outputPath: join(artifactRoot, "sentinel10.xlsx"),
      captureRoot: join(artifactRoot, "captures", "sentinel10"),
      runId:
        process.env.V04_SENTINEL10_RUN_ID?.trim() ||
        "v04-sentinel10"
    });
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  }
}
