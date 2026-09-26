import { describe, expect, it } from "vitest";

import {
  REQUIRED_LANE_COVERAGE,
  expectedSemanticOrder,
  validateNumberedPacketSnapshot,
  validateRetentionSnapshot
} from "./v15NumberedPacketGuards.mjs";

describe("V15 numbered packet / retention acceptance contract", () => {
  it("anchors semantic screenshot 1 to the final authoritative hero and keeps contiguous top-to-bottom order", () => {
    const shots = [
      { sequence: 1, shotId: "01-hero-final", pageZone: "HERO", scrollY: 0, isAuthoritativeHero: true },
      { sequence: 2, shotId: "02-upper", pageZone: "UPPER", scrollY: 620, isAuthoritativeHero: false },
      { sequence: 3, shotId: "03-middle", pageZone: "MIDDLE", scrollY: 1240, isAuthoritativeHero: false },
      { sequence: 4, shotId: "04-lower", pageZone: "LOWER", scrollY: 1860, isAuthoritativeHero: false }
    ];

    expect(validateNumberedPacketSnapshot(shots)).toEqual([]);
    expect(expectedSemanticOrder(shots)).toEqual([
      "01-hero-final",
      "02-upper",
      "03-middle",
      "04-lower"
    ]);
  });

  it("rejects stale hero first, sequence gaps and lower-page order regressions", () => {
    expect(
      validateNumberedPacketSnapshot([
        { sequence: 1, shotId: "01-hero-initial", pageZone: "HERO", scrollY: 0, isAuthoritativeHero: false },
        { sequence: 3, shotId: "03-middle", pageZone: "MIDDLE", scrollY: 800, isAuthoritativeHero: false },
        { sequence: 2, shotId: "02-upper", pageZone: "UPPER", scrollY: 400, isAuthoritativeHero: false }
      ])
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/01-hero-final/i),
        expect.stringMatching(/contiguous/i),
        expect.stringMatching(/top-to-bottom/i)
      ])
    );
  });

  it("keeps all evidence in AUDIT_KEEP_ALL", () => {
    expect(
      validateRetentionSnapshot({
        policy: "AUDIT_KEEP_ALL",
        semanticDecisionPersisted: true,
        structuralValidationPersisted: true,
        durableResultPersisted: true,
        status: "VALIDATED",
        workspaceDeleted: false
      })
    ).toEqual([]);
  });

  it("allows LEAN_DELETE_SUCCESS only after all durable success preconditions", () => {
    expect(
      validateRetentionSnapshot({
        policy: "LEAN_DELETE_SUCCESS",
        semanticDecisionPersisted: true,
        structuralValidationPersisted: true,
        durableResultPersisted: true,
        status: "VALIDATED",
        workspaceDeleted: true
      })
    ).toEqual([]);

    expect(
      validateRetentionSnapshot({
        policy: "LEAN_DELETE_SUCCESS",
        semanticDecisionPersisted: true,
        structuralValidationPersisted: true,
        durableResultPersisted: true,
        status: "SKIPPED_NON_CAMERA",
        workspaceDeleted: true
      })
    ).toEqual([]);

    expect(
      validateRetentionSnapshot({
        policy: "LEAN_DELETE_SUCCESS",
        semanticDecisionPersisted: true,
        structuralValidationPersisted: false,
        durableResultPersisted: true,
        status: "VALIDATED",
        workspaceDeleted: true
      })
    ).toEqual(expect.arrayContaining([expect.stringMatching(/validation/i)]));
  });

  it.each(["REVIEW", "ERROR", "INCOMPLETE", "AI_IN_FLIGHT"])(
    "retains evidence for %s",
    (status) => {
      expect(
        validateRetentionSnapshot({
          policy: "LEAN_DELETE_SUCCESS",
          semanticDecisionPersisted: status !== "AI_IN_FLIGHT",
          structuralValidationPersisted: false,
          durableResultPersisted: false,
          status,
          workspaceDeleted: true
        })
      ).toEqual(expect.arrayContaining([expect.stringMatching(/retain evidence/i)]));
    }
  );

  it("locks cross-lane coverage for separation, overlap, one call, isolation and contamination guards", () => {
    const paths = REQUIRED_LANE_COVERAGE.map((item) => item.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        "tests/v04/vision/productCapturePacket.test.ts",
        "tests/v04/runtime/pipelinedProductRuntime.test.ts",
        "tests/v04/ai/productCameraSemanticPrompt.test.ts"
      ])
    );
  });
});
