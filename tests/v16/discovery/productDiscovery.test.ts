import { describe, expect, it } from "vitest";

import {
  discoverCameraProducts,
  scopeAndDiscoverCameraProducts,
  type CollectionBatch,
  type CollectionBatchReader,
  type ContinuationEvidence,
  type ProductRecordEvidence
} from "../../../src/v16/discovery/productDiscovery.js";
import type {
  CameraScope,
  Dev3CollectionEvidence,
  NetworkEvidenceBundleAdapter,
  PageEvidenceBundleAdapter
} from "../../../src/v16/scope/cameraScopeGate.js";

function scope(
  collectionRef = "camera-listing",
  sourceKind: Dev3CollectionEvidence["sourceKind"] = "PAGE_LISTING"
): CameraScope {
  return {
    collections: [
      {
        collectionRef,
        sourceKind,
        collectionUrl: "https://shop.example/cameras",
        proof: {
          evidenceId: `proof-${collectionRef}`,
          terminalLabel: "Cameras",
          taxonomyPath: ["Photography", "Cameras"]
        }
      }
    ]
  };
}

function product(
  evidenceId: string,
  primaryUrl: string,
  overrides: Partial<ProductRecordEvidence> = {}
): ProductRecordEvidence {
  return {
    evidenceId,
    sourceKind: "PAGE_PRODUCT_CARD",
    primaryUrl,
    ...overrides
  };
}

class ScriptedReader implements CollectionBatchReader {
  readonly initialCalls: string[] = [];
  readonly continuationCalls: string[] = [];

  constructor(
    private readonly initialByRef: Readonly<Record<string, CollectionBatch | null>>,
    private readonly nextByKey: Readonly<Record<string, CollectionBatch | null>> = {}
  ) {}

  async readInitial(collectionRef: string): Promise<CollectionBatch | null> {
    this.initialCalls.push(collectionRef);
    return this.initialByRef[collectionRef] ?? null;
  }

  async readContinuation(
    collectionRef: string,
    continuation: ContinuationEvidence
  ): Promise<CollectionBatch | null> {
    this.continuationCalls.push(`${collectionRef}:${continuation.key}`);
    return this.nextByKey[continuation.key] ?? null;
  }
}

describe("DEV3 V16 camera product discovery", () => {
  it("C: enqueues only product-card identities and ignores ambient footer/policy/article links", async () => {
    const reader = new ScriptedReader({
      "camera-listing": {
        collectionRef: "camera-listing",
        products: [
          product("card-1", "https://shop.example/p/cam-1"),
          product("card-2", "https://shop.example/p/cam-2")
        ],
        ambientLinks: [
          "https://shop.example/footer",
          "https://shop.example/policy",
          "https://shop.example/article/launch"
        ],
        continuation: null
      }
    });

    const result = await discoverCameraProducts(scope(), reader);

    expect(result.products.map(item => item.url)).toEqual([
      "https://shop.example/p/cam-1",
      "https://shop.example/p/cam-2"
    ]);
    expect(result.products).toHaveLength(2);
  });

  it("D: collapses multiple tab/view URLs to one product identity without hardcoding the query key", async () => {
    const reader = new ScriptedReader({
      "camera-listing": {
        collectionRef: "camera-listing",
        products: [
          product("card-tab-1", "https://shop.example/product?a=tab1", {
            stableProductId: "product-42"
          }),
          product("card-tab-2", "https://shop.example/product?a=tab2", {
            stableProductId: "product-42"
          }),
          product("card-tab-3", "https://shop.example/product?a=tab3", {
            stableProductId: "product-42"
          })
        ],
        continuation: null
      }
    });

    const result = await discoverCameraProducts(scope(), reader);

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.identity).toContain("product-42");
    expect(result.products[0]?.alternateUrls).toEqual([
      "https://shop.example/product?a=tab1",
      "https://shop.example/product?a=tab2",
      "https://shop.example/product?a=tab3"
    ]);
  });

  it("E: discovers products directly from a proven camera network collection without homepage crawling", async () => {
    const pageEvidence: PageEvidenceBundleAdapter = {
      rootUrl: "https://shop.example/",
      collections: []
    };
    const networkEvidence: NetworkEvidenceBundleAdapter = {
      pageUrl: "https://shop.example/",
      collections: [
        {
          evidenceId: "xhr-camera-collection",
          collectionRef: "api-camera-collection",
          sourceKind: "NETWORK_COLLECTION",
          label: "Cameras",
          taxonomyPath: ["Photography", "Cameras"],
          collectionUrl: "https://shop.example/api/catalog"
        }
      ]
    };
    const reader = new ScriptedReader({
      "api-camera-collection": {
        collectionRef: "api-camera-collection",
        products: [
          product("api-product-1", "https://shop.example/p/api-camera-1", {
            sourceKind: "NETWORK_PRODUCT",
            stableProductId: "api-1"
          })
        ],
        continuation: null
      }
    });

    const result = await scopeAndDiscoverCameraProducts(
      { pageEvidence, networkEvidence },
      reader
    );

    expect(result.status).toBe("DISCOVERED");
    if (result.status !== "DISCOVERED") {
      throw new Error("expected direct network discovery");
    }
    expect(result.products.map(item => item.url)).toEqual([
      "https://shop.example/p/api-camera-1"
    ]);
    expect(reader.initialCalls).toEqual(["api-camera-collection"]);
  });

  it("F: stops pagination when a batch yields no new unique products", async () => {
    const reader = new ScriptedReader(
      {
        "camera-listing": {
          collectionRef: "camera-listing",
          products: [
            product("p1-a", "https://shop.example/p/a", { stableProductId: "a" })
          ],
          continuation: { kind: "PAGE", key: "page-2" }
        }
      },
      {
        "page-2": {
          collectionRef: "camera-listing",
          products: [
            product("p2-b", "https://shop.example/p/b", { stableProductId: "b" })
          ],
          continuation: { kind: "PAGE", key: "page-3" }
        },
        "page-3": {
          collectionRef: "camera-listing",
          products: [
            product("p3-a", "https://shop.example/p/a?view=again", { stableProductId: "a" }),
            product("p3-b", "https://shop.example/p/b?view=again", { stableProductId: "b" })
          ],
          continuation: { kind: "PAGE", key: "page-4" }
        },
        "page-4": {
          collectionRef: "camera-listing",
          products: [
            product("p4-c", "https://shop.example/p/c", { stableProductId: "c" })
          ],
          continuation: null
        }
      }
    );

    const result = await discoverCameraProducts(scope(), reader);

    expect(result.products.map(item => item.identity)).toHaveLength(2);
    expect(reader.continuationCalls).toEqual([
      "camera-listing:page-2",
      "camera-listing:page-3"
    ]);
  });

  it("supports opaque PAGE/CURSOR/INFINITE continuations without inventing retailer parameters and respects a hard batch cap", async () => {
    for (const kind of ["PAGE", "CURSOR", "INFINITE"] as const) {
      const reader = new ScriptedReader(
        {
          "camera-listing": {
            collectionRef: "camera-listing",
            products: [
              product(`${kind}-0`, `https://shop.example/p/${kind.toLowerCase()}-0`)
            ],
            continuation: { kind, key: `${kind}-1` }
          }
        },
        {
          [`${kind}-1`]: {
            collectionRef: "camera-listing",
            products: [
              product(`${kind}-1`, `https://shop.example/p/${kind.toLowerCase()}-1`)
            ],
            continuation: { kind, key: `${kind}-2` }
          },
          [`${kind}-2`]: {
            collectionRef: "camera-listing",
            products: [
              product(`${kind}-2`, `https://shop.example/p/${kind.toLowerCase()}-2`)
            ],
            continuation: null
          }
        }
      );

      const result = await discoverCameraProducts(scope(), reader, {
        maxBatchesPerCollection: 2
      });

      expect(result.products).toHaveLength(2);
      expect(reader.continuationCalls).toEqual([
        `camera-listing:${kind}-1`
      ]);
    }
  });

  it("G: no proven camera scope never broadens to whole-site discovery", async () => {
    const pageEvidence: PageEvidenceBundleAdapter = {
      rootUrl: "https://shop.example/",
      collections: [
        {
          evidenceId: "ambiguous-imaging",
          collectionRef: "imaging",
          sourceKind: "PAGE_TAXONOMY",
          label: "Imaging",
          taxonomyPath: ["Imaging"],
          collectionUrl: "https://shop.example/imaging"
        }
      ]
    };
    const networkEvidence: NetworkEvidenceBundleAdapter = {
      pageUrl: "https://shop.example/",
      collections: []
    };
    const reader = new ScriptedReader({
      imaging: {
        collectionRef: "imaging",
        products: [product("irrelevant", "https://shop.example/anything")],
        continuation: null
      }
    });

    const result = await scopeAndDiscoverCameraProducts(
      { pageEvidence, networkEvidence },
      reader
    );

    expect(result).toEqual({
      status: "NEEDS_LEGACY_SCOPE_FALLBACK",
      reason: "NO_PROVEN_CAMERA_COLLECTION"
    });
    expect(reader.initialCalls).toEqual([]);
    expect(reader.continuationCalls).toEqual([]);
  });
});
