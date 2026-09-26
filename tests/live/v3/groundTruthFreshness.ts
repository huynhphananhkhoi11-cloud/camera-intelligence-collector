import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type GroundTruthFreshnessIssue = {
  id: string;
  sourceStatus: string;
};

export function findGroundTruthFreshnessIssues(
  truth: {
    cases: Array<{
      id: string;
      expectedDisposition: string;
      liveReference: {
        sourceStatus?: string;
      };
    }>;
  }
): GroundTruthFreshnessIssue[] {
  return truth.cases
    .filter((item) => item.expectedDisposition === "CAMERA")
    .map((item) => ({
      id: item.id,
      sourceStatus: item.liveReference.sourceStatus ?? ""
    }))
    .filter(
      (item) =>
        !item.sourceStatus ||
        item.sourceStatus.includes("REFRESH_IN_BROWSER_BEFORE_RUN") ||
        item.sourceStatus.includes("STALE_") ||
        item.sourceStatus.includes("WEB_OPEN_FAILED")
    );
}

export async function assertGroundTruthFresh(
  path = resolve(process.cwd(), "benchmarks/v3/ground_truth.json")
): Promise<void> {
  const truth = JSON.parse(await readFile(path, "utf8")) as {
    cases: Array<{
      id: string;
      expectedDisposition: string;
      liveReference: {
        sourceStatus?: string;
      };
    }>;
  };

  const issues = findGroundTruthFreshnessIssues(truth);

  if (issues.length > 0) {
    throw new Error(
      [
        "Live ground truth is not browser-refreshed for all CAMERA sentinels.",
        ...issues.map(
          (item) => `${item.id}: ${item.sourceStatus || "MISSING_SOURCE_STATUS"}`
        ),
        "Refresh dynamic fields immediately before the benchmark and replace the status with a timestamped BROWSER_REFRESHED marker."
      ].join("\n")
    );
  }
}
