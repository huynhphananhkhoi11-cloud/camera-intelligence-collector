import { describe, expect, it } from "vitest";

import { buildCrawlInput } from "./crawlInputBuilder.js";

describe("Dev6 crawl smoke input builder", () => {
  it("preserves distinct variation queries, filters host and removes exact duplicates", () => {
    const result = buildCrawlInput(
      "zshop.vn",
      [
        "https://zshop.vn/canon-eos-r50-vi.html?variation_id=65130",
        "https://zshop.vn/canon-eos-r50-vi.html?variation_id=70768",
        "https://zshop.vn/canon-eos-r50-vi.html?variation_id=70768",
        "https://vjshop.vn/may-anh-mirrorless/canon-eos-r50-body",
        "not-a-url"
      ],
      15
    );

    expect(result.selected).toEqual([
      "https://zshop.vn/canon-eos-r50-vi.html?variation_id=65130",
      "https://zshop.vn/canon-eos-r50-vi.html?variation_id=70768"
    ]);

    expect(result.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ reason: "DUPLICATE" }),
        expect.objectContaining({ reason: "WRONG_HOST" }),
        expect.objectContaining({ reason: "INVALID_URL" })
      ])
    );
  });

  it("caps selected URLs without collapsing distinct query-state variants", () => {
    const values = Array.from(
      { length: 20 },
      (_, index) =>
        `https://zshop.vn/camera-${index}.html?variation_id=${index}`
    );

    const result = buildCrawlInput("zshop.vn", values, 15);

    expect(result.selected).toHaveLength(15);
    expect(result.selected[0]).toContain("variation_id=0");
    expect(result.selected[14]).toContain("variation_id=14");
  });
});
