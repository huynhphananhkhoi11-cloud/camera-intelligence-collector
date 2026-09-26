import { describe, expect, it } from "vitest";

import { findGroundTruthFreshnessIssues } from "./groundTruthFreshness.js";

describe("Dev6 ground-truth freshness gate", () => {
  it("blocks camera sentinels that still require browser refresh", () => {
    const issues = findGroundTruthFreshnessIssues({
      cases: [
        {
          id: "S01",
          expectedDisposition: "CAMERA",
          liveReference: {
            sourceStatus: "WEB_REFERENCE_CRAWLED_LAST_MONTH_REFRESH_IN_BROWSER_BEFORE_RUN"
          }
        },
        {
          id: "S05",
          expectedDisposition: "NON_CAMERA_LENS",
          liveReference: {
            sourceStatus: "WEB_REFERENCE_CRAWLED_2_MONTHS_STABLE_DISPOSITION_ONLY"
          }
        }
      ]
    });

    expect(issues).toEqual([
      {
        id: "S01",
        sourceStatus: "WEB_REFERENCE_CRAWLED_LAST_MONTH_REFRESH_IN_BROWSER_BEFORE_RUN"
      }
    ]);
  });

  it("passes timestamped browser-refreshed camera truth", () => {
    const issues = findGroundTruthFreshnessIssues({
      cases: [
        {
          id: "S01",
          expectedDisposition: "CAMERA",
          liveReference: {
            sourceStatus: "BROWSER_REFRESHED_2026-09-20T22:55:00+07:00"
          }
        }
      ]
    });

    expect(issues).toEqual([]);
  });
});
