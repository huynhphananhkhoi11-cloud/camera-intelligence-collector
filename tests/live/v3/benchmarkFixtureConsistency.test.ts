import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function lines(path: string): string[] {
  return readFileSync(resolve(process.cwd(), path), "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

describe("Dev6 benchmark fixture consistency", () => {
  it("keeps sentinel URL text file and ground truth in exactly the same order", () => {
    const sentinelUrls = lines("benchmarks/v3/sentinel_10_urls.txt");
    const truth = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "benchmarks/v3/ground_truth.json"),
        "utf8"
      )
    ) as {
      cases: Array<{ url: string }>;
    };

    expect(sentinelUrls).toEqual(truth.cases.map((item) => item.url));
  });

  it("keeps the three smoke sites fixed at cap 15", () => {
    const config = JSON.parse(
      readFileSync(
        resolve(process.cwd(), "benchmarks/v3/crawl_smoke.json"),
        "utf8"
      )
    ) as {
      capPerSite: number;
      sites: Array<{ site: string; seeds: string[] }>;
    };

    expect(config.capPerSite).toBe(15);
    expect(config.sites.map((item) => item.site)).toEqual([
      "zshop.vn",
      "vjshop.vn",
      "mayanhtop1.com"
    ]);

    for (const site of config.sites) {
      expect(site.seeds.length).toBeGreaterThan(0);
      expect(site.seeds.every((url) => url.startsWith("https://"))).toBe(true);
    }
  });
});
