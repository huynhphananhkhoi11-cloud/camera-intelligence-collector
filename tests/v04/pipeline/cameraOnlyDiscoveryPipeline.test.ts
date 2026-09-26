import { describe, expect, it, vi } from "vitest";

import type {
  CameraRouteDecision,
  SiteReconnaissancePacket
} from "../../../src/v04/contracts/v15PipelineContracts.js";

import {
  orchestrateCameraOnlyDiscovery,
  resolveApprovedCameraRoutes,
  runFreshPageCaptureWithRecovery
} from "../../../src/v04/pipeline/cameraOnlyDiscoveryPipeline.js";

function packet(): SiteReconnaissancePacket {
  return {
    website: "shop.test",
    rootUrl: "https://shop.test/",
    finalUrl: "https://shop.test/",
    candidates: [
      { candidateId: "c1", label: "Cameras", url: "https://shop.test/cameras" },
      { candidateId: "c2", label: "Accessories", url: "https://shop.test/accessories" }
    ],
    shots: []
  };
}

describe("V15 camera-only discovery pipeline", () => {
  it("ignores missing/unknown candidate IDs and de-duplicates approved routes", () => {
    const decision: CameraRouteDecision = {
      approvedCandidateIds: ["c1", "missing", "c1"]
    };

    expect(resolveApprovedCameraRoutes(packet(), decision)).toEqual([
      {
        candidateId: "c1",
        label: "Cameras",
        url: "https://shop.test/cameras"
      }
    ]);
  });

  it("passes only approved routes to discovery then hands product URLs to capture/semantic runtime", async () => {
    const captureReconnaissance = vi.fn(async () => packet());
    const selectRoutes = vi.fn(async (): Promise<CameraRouteDecision> => ({
      approvedCandidateIds: ["c1"]
    }));
    const discoverRoutes = vi.fn(async () => ({
      urls: ["https://shop.test/p1", "https://shop.test/p2"],
      crawledRoutes: ["https://shop.test/cameras"],
      passes: 2
    }));
    const runProducts = vi.fn(async () => ({ token: "capture+semantic" }));

    const result = await orchestrateCameraOnlyDiscovery(
      ["https://shop.test/"],
      {
        captureReconnaissance,
        selectRoutes,
        discoverRoutes,
        runProducts
      }
    );

    expect(discoverRoutes).toHaveBeenCalledWith([
      {
        candidateId: "c1",
        label: "Cameras",
        url: "https://shop.test/cameras"
      }
    ]);
    expect(runProducts).toHaveBeenCalledWith([
      "https://shop.test/p1",
      "https://shop.test/p2"
    ]);
    expect(result.productUrls).toEqual([
      "https://shop.test/p1",
      "https://shop.test/p2"
    ]);
    expect(result.productRuntime).toEqual({ token: "capture+semantic" });
  });

  it("de-duplicates approved routes and discovered product URLs across site roots in first-seen order", async () => {
    const first = packet();
    const second: SiteReconnaissancePacket = {
      ...packet(),
      rootUrl: "https://shop.test/used",
      finalUrl: "https://shop.test/used",
      candidates: [
        { candidateId: "c1b", label: "Cameras", url: "https://shop.test/cameras" },
        { candidateId: "c3", label: "Used cameras", url: "https://shop.test/used-cameras" }
      ]
    };

    let calls = 0;
    const result = await orchestrateCameraOnlyDiscovery(
      [first.rootUrl, second.rootUrl],
      {
        captureReconnaissance: async () => (calls++ === 0 ? first : second),
        selectRoutes: async (value) => ({
          approvedCandidateIds:
            value.rootUrl === first.rootUrl
              ? ["c1"]
              : ["c1b", "c3"]
        }),
        discoverRoutes: async (routes) => ({
          urls: routes.flatMap(route =>
            route.url.endsWith("used-cameras")
              ? ["https://shop.test/p2", "https://shop.test/p3"]
              : ["https://shop.test/p1", "https://shop.test/p2"]
          ),
          crawledRoutes: routes.map(route => route.url),
          passes: routes.length
        }),
        runProducts: async (urls) => urls
      }
    );

    expect(result.approvedRoutes.map(route => route.url)).toEqual([
      "https://shop.test/cameras",
      "https://shop.test/used-cameras"
    ]);
    expect(result.productUrls).toEqual([
      "https://shop.test/p1",
      "https://shop.test/p2",
      "https://shop.test/p3"
    ]);
  });

  it("isolates product captures on fresh pages and retries only recoverable navigation races", async () => {
    const closeFirst = vi.fn(async () => undefined);
    const closeSecond = vi.fn(async () => undefined);
    const pages = [
      { close: closeFirst },
      { close: closeSecond }
    ];
    const createPage = vi.fn(async () => pages.shift() as never);
    const capture = vi
      .fn()
      .mockRejectedValueOnce(
        new Error(
          "page.evaluate: Execution context was destroyed, most likely because of a navigation"
        )
      )
      .mockResolvedValueOnce("captured");

    await expect(
      runFreshPageCaptureWithRecovery(
        createPage,
        capture
      )
    ).resolves.toBe("captured");

    expect(createPage).toHaveBeenCalledTimes(2);
    expect(closeFirst).toHaveBeenCalledTimes(1);
    expect(closeSecond).toHaveBeenCalledTimes(1);

    const unrelatedCreatePage = vi.fn(async () => ({
      close: vi.fn(async () => undefined)
    }) as never);

    await expect(
      runFreshPageCaptureWithRecovery(
        unrelatedCreatePage,
        async () => {
          throw new Error("capture artifact write permission denied");
        }
      )
    ).rejects.toThrow("capture artifact write permission denied");

    expect(unrelatedCreatePage).toHaveBeenCalledTimes(1);
  });

});
