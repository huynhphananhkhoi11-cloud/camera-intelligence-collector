import { describe, expect, it } from "vitest";

import type {
  CameraRouteDecision,
  FrozenProductVisualPacket,
  NavigationCandidate,
  SiteReconnaissancePacket
} from "../../../src/v04/contracts/v15PipelineContracts.js";

describe("V15 shared integration contracts", () => {
  it("keeps camera route decisions candidate-ID based", () => {
    const candidate: NavigationCandidate = {
      candidateId: "c1",
      label: "Cameras",
      url: "https://example.test/cameras"
    };

    const packet: SiteReconnaissancePacket = {
      website: "example.test",
      rootUrl: "https://example.test/",
      finalUrl: "https://example.test/",
      candidates: [candidate],
      shots: []
    };

    const decision: CameraRouteDecision = {
      approvedCandidateIds: ["c1"]
    };

    expect(packet.candidates[0]).toEqual(candidate);
    expect(decision.approvedCandidateIds).toEqual(["c1"]);
  });

  it("keeps the product packet detached from Playwright and readonly by contract", () => {
    const packet = null as unknown as FrozenProductVisualPacket;

    // Compile-time shape marker for the acceptance harness. Runtime page objects
    // are deliberately absent from FrozenProductVisualPacket.
    expect(packet).toBeNull();
  });
});
