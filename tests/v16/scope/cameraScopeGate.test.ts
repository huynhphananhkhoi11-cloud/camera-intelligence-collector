import { describe, expect, it } from "vitest";

import {
  proveCameraScope,
  type Dev3CollectionEvidence,
  type NetworkEvidenceBundleAdapter,
  type PageEvidenceBundleAdapter
} from "../../../src/v16/scope/cameraScopeGate.js";

function pageBundle(
  collections: readonly Dev3CollectionEvidence[]
): PageEvidenceBundleAdapter {
  return {
    rootUrl: "https://shop.example/",
    collections
  };
}

function networkBundle(
  collections: readonly Dev3CollectionEvidence[]
): NetworkEvidenceBundleAdapter {
  return {
    pageUrl: "https://shop.example/",
    collections
  };
}

describe("DEV3 V16 positive camera-scope gate", () => {
  it("A: only the proven Camera collection continues beside Lens and News collections", () => {
    const result = proveCameraScope({
      pageEvidence: pageBundle([
        {
          evidenceId: "nav-camera",
          collectionRef: "collection-camera",
          sourceKind: "PAGE_TAXONOMY",
          label: "Camera",
          taxonomyPath: ["Photography", "Camera"],
          collectionUrl: "https://shop.example/camera"
        },
        {
          evidenceId: "nav-lens",
          collectionRef: "collection-lens",
          sourceKind: "PAGE_TAXONOMY",
          label: "Lens",
          taxonomyPath: ["Photography", "Lens"],
          collectionUrl: "https://shop.example/lens"
        },
        {
          evidenceId: "nav-news",
          collectionRef: "collection-news",
          sourceKind: "PAGE_TAXONOMY",
          label: "News",
          taxonomyPath: ["News"],
          collectionUrl: "https://shop.example/news"
        }
      ]),
      networkEvidence: networkBundle([])
    });

    expect(result.status).toBe("PROVEN_CAMERA_SCOPE");
    if (result.status !== "PROVEN_CAMERA_SCOPE") {
      throw new Error("expected proven camera scope");
    }

    expect(result.scope.collections.map(item => item.collectionRef)).toEqual([
      "collection-camera"
    ]);
    expect(result.scope.collections[0]?.proof.terminalLabel).toBe("Camera");
  });

  it("B: ambiguous Imaging without positive camera-primary proof requires legacy scope fallback", () => {
    const result = proveCameraScope({
      pageEvidence: pageBundle([
        {
          evidenceId: "nav-imaging",
          collectionRef: "collection-imaging",
          sourceKind: "PAGE_TAXONOMY",
          label: "Imaging",
          taxonomyPath: ["Imaging"],
          collectionUrl: "https://shop.example/imaging"
        }
      ]),
      networkEvidence: networkBundle([])
    });

    expect(result).toEqual({
      status: "NEEDS_LEGACY_SCOPE_FALLBACK",
      reason: "NO_PROVEN_CAMERA_COLLECTION"
    });
  });

  it("proves scope from the terminal taxonomy node even when the evidence label is only a parent grouping", () => {
    const result = proveCameraScope({
      pageEvidence: pageBundle([
        {
          evidenceId: "parent-photography",
          collectionRef: "taxonomy-camera-child",
          sourceKind: "PAGE_TAXONOMY",
          label: "Photography",
          taxonomyPath: ["Photography", "Cameras"],
          collectionUrl: "https://shop.example/photography/cameras"
        },
        {
          evidenceId: "parent-imaging",
          collectionRef: "taxonomy-body-child",
          sourceKind: "PAGE_TAXONOMY",
          label: "Imaging",
          taxonomyPath: ["Imaging", "Camera Bodies"],
          collectionUrl: "https://shop.example/imaging/bodies"
        }
      ]),
      networkEvidence: networkBundle([])
    });

    expect(result.status).toBe("PROVEN_CAMERA_SCOPE");
    if (result.status !== "PROVEN_CAMERA_SCOPE") {
      throw new Error("expected proven camera scope");
    }
    expect(result.scope.collections.map(item => item.collectionRef)).toEqual([
      "taxonomy-camera-child",
      "taxonomy-body-child"
    ]);
  });

  it("treats Compact as camera scope only when positive camera ancestry proves the collection", () => {
    const result = proveCameraScope({
      pageEvidence: pageBundle([
        {
          evidenceId: "compact-under-cameras",
          collectionRef: "compact-camera",
          sourceKind: "PAGE_LISTING",
          label: "Compact",
          taxonomyPath: ["Cameras", "Compact"],
          collectionUrl: "https://shop.example/cameras/compact"
        },
        {
          evidenceId: "compact-under-imaging",
          collectionRef: "compact-ambiguous",
          sourceKind: "PAGE_LISTING",
          label: "Compact",
          taxonomyPath: ["Imaging", "Compact"],
          collectionUrl: "https://shop.example/imaging/compact"
        }
      ]),
      networkEvidence: networkBundle([])
    });

    expect(result.status).toBe("PROVEN_CAMERA_SCOPE");
    if (result.status !== "PROVEN_CAMERA_SCOPE") {
      throw new Error("expected proven camera scope");
    }
    expect(result.scope.collections.map(item => item.collectionRef)).toEqual([
      "compact-camera"
    ]);
  });

  it("accepts camera-primary terminal labels across multilingual/hierarchical evidence without hostname rules", () => {
    const result = proveCameraScope({
      pageEvidence: pageBundle([
        {
          evidenceId: "vn-camera",
          collectionRef: "vn-camera",
          sourceKind: "PAGE_LISTING",
          label: "Máy ảnh",
          taxonomyPath: ["Hình ảnh", "Máy ảnh"],
          collectionUrl: "https://example.test/may-anh"
        },
        {
          evidenceId: "camera-bodies",
          collectionRef: "camera-bodies",
          sourceKind: "PAGE_TAXONOMY",
          label: "Camera Bodies",
          taxonomyPath: ["Imaging", "Camera Bodies"],
          collectionUrl: "https://another.example/bodies"
        },
        {
          evidenceId: "mirrorless",
          collectionRef: "mirrorless",
          sourceKind: "PAGE_LISTING",
          label: "Mirrorless",
          taxonomyPath: ["Photography", "Cameras", "Mirrorless"],
          collectionUrl: "https://another.example/mirrorless"
        }
      ]),
      networkEvidence: networkBundle([])
    });

    expect(result.status).toBe("PROVEN_CAMERA_SCOPE");
    if (result.status !== "PROVEN_CAMERA_SCOPE") {
      throw new Error("expected proven camera scope");
    }
    expect(result.scope.collections.map(item => item.collectionRef)).toEqual([
      "vn-camera",
      "camera-bodies",
      "mirrorless"
    ]);
  });
});
