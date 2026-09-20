import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type GroundTruthCase = {
  id: string;
  site: string;
  url: string;
  expectedDisposition: "CAMERA" | "NON_CAMERA_LENS" | "NON_PRODUCT";
  stable: Record<string, unknown>;
  liveReference: {
    sourceStatus: string;
    [key: string]: unknown;
  };
  guards: string[];
};

type GroundTruth = {
  schemaVersion: string;
  benchmarkId: string;
  cases: GroundTruthCase[];
};

function loadGroundTruth(): GroundTruth {
  const file = resolve(process.cwd(), "benchmarks/v3/ground_truth.json");
  return JSON.parse(readFileSync(file, "utf8")) as GroundTruth;
}

describe("Dev6 live benchmark ground-truth contract", () => {
  it("pins exactly 10 unique sentinel URLs with 8 camera and 2 exclusion cases", () => {
    const truth = loadGroundTruth();

    expect(truth.schemaVersion).toBe("1.0.0");
    expect(truth.benchmarkId).toBe("v3-vision-first-sentinel-10");
    expect(truth.cases).toHaveLength(10);

    const urls = truth.cases.map((item) => item.url);
    expect(new Set(urls).size).toBe(10);

    const cameras = truth.cases.filter((item) => item.expectedDisposition === "CAMERA");
    const exclusions = truth.cases.filter((item) => item.expectedDisposition !== "CAMERA");

    expect(cameras).toHaveLength(8);
    expect(exclusions).toHaveLength(2);
  });

  it("requires every case to carry stable assertions, refresh state and contamination guards", () => {
    const truth = loadGroundTruth();

    for (const item of truth.cases) {
      expect(item.id).toMatch(/^S\d{2}$/);
      expect(item.url).toMatch(/^https:\/\//);
      expect(Object.keys(item.stable).length).toBeGreaterThan(0);
      expect(item.liveReference.sourceStatus).toBeTruthy();
      expect(item.guards.length).toBeGreaterThan(0);
    }
  });

  it("keeps the two negative sentinel cases explicit", () => {
    const truth = loadGroundTruth();
    const byId = new Map(truth.cases.map((item) => [item.id, item]));

    expect(byId.get("S05")?.expectedDisposition).toBe("NON_CAMERA_LENS");
    expect(byId.get("S06")?.expectedDisposition).toBe("NON_PRODUCT");
  });

  it("records the current-price vs list-price distinction for the A7 IV sentinel", () => {
    const truth = loadGroundTruth();
    const a7 = truth.cases.find((item) => item.id === "S07");

    expect(a7?.liveReference.salePriceVnd).toBe(47_490_000);
    expect(a7?.liveReference.crossedOutOrListPriceVnd).toBe(53_990_182);
  });
});
