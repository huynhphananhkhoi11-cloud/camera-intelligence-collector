import {
  describe,
  expect,
  test
} from "vitest";

import type {
  ApprovedCameraRoute
} from "../../../src/v04/contracts/v15PipelineContracts.js";

import {
  RenderedListingDiscovery,
  type ListingDiscoveryResult,
  type RenderedListingPageSession,
  type RenderedListingRuntime,
  type RenderedListingSnapshot
} from "../../../src/v04/discovery/renderedListingDiscovery.js";

interface ProductUrlQueueResult {
  readonly urls: readonly string[];
  readonly crawledRoutes: readonly string[];
  readonly passes: number;
}

interface ListingDiscovererLike {
  discover(
    rootUrl: string,
    signal?: AbortSignal
  ): Promise<ListingDiscoveryResult>;
}

type DiscoverApprovedCameraRoutes = (
  routes: readonly ApprovedCameraRoute[],
  discoverer?: ListingDiscovererLike,
  signal?: AbortSignal
) => Promise<ProductUrlQueueResult>;

async function loadDiscoverApprovedCameraRoutes(): Promise<
  DiscoverApprovedCameraRoutes | undefined
> {
  const modulePath =
    "../../../src/v04/discovery/approvedRouteDiscovery.js";

  try {
    const loaded = await import(modulePath) as {
      readonly discoverApprovedCameraRoutes?:
        DiscoverApprovedCameraRoutes;
    };

    return loaded.discoverApprovedCameraRoutes;
  }
  catch {
    return undefined;
  }
}

class FakeDiscoverer implements ListingDiscovererLike {
  public readonly calls: string[] = [];

  constructor(
    private readonly results: ReadonlyMap<
      string,
      ListingDiscoveryResult
    >
  ) {}

  async discover(
    rootUrl: string
  ): Promise<ListingDiscoveryResult> {
    this.calls.push(rootUrl);

    const result = this.results.get(rootUrl);
    if (result === undefined) {
      throw new Error(`Unexpected route: ${rootUrl}`);
    }

    return result;
  }
}

class ScriptedPage implements RenderedListingPageSession {
  private index = 0;

  constructor(
    private readonly states: readonly RenderedListingSnapshot[]
  ) {}

  async snapshot(): Promise<RenderedListingSnapshot> {
    const state = this.states[
      Math.min(this.index, this.states.length - 1)
    ];

    if (state === undefined) {
      throw new Error("Missing scripted listing state.");
    }

    this.index += 1;
    return state;
  }

  async scrollNearBottom(): Promise<void> {}
  async waitForSettle(): Promise<void> {}
  async close(): Promise<void> {}
}

class ScriptedRuntime implements RenderedListingRuntime {
  public readonly opened: string[] = [];

  constructor(
    private readonly pages: ReadonlyMap<
      string,
      RenderedListingPageSession
    >
  ) {}

  async open(
    url: string
  ): Promise<RenderedListingPageSession> {
    this.opened.push(url);

    const page = this.pages.get(url);
    if (page === undefined) {
      throw new Error(`Unexpected listing page: ${url}`);
    }

    return page;
  }
}

function state(
  documentHeight: number,
  links: ReadonlyArray<{
    readonly url: string;
    readonly rel?: string | null;
  }>
): RenderedListingSnapshot {
  return {
    documentHeight,
    links: links.map(item => ({
      url: item.url,
      rel: item.rel ?? null
    }))
  };
}

function approvedRoute(
  candidateId: string,
  label: string,
  url: string
): ApprovedCameraRoute {
  return {
    candidateId,
    label,
    url
  };
}

describe(
  "V15 approved-route discovery",
  () => {
    test(
      "crawls only resolved approved routes in approved order",
      async () => {
        const discoverApprovedCameraRoutes =
          await loadDiscoverApprovedCameraRoutes();

        expect(discoverApprovedCameraRoutes).toBeDefined();
        if (discoverApprovedCameraRoutes === undefined) {
          return;
        }

        const cameras = "https://shop.test/cameras";
        const used = "https://shop.test/used-cameras";
        const discoverer = new FakeDiscoverer(
          new Map([
            [cameras, { urls: ["https://shop.test/p1"], passes: 3 }],
            [used, { urls: ["https://shop.test/p2"], passes: 2 }]
          ])
        );

        const result = await discoverApprovedCameraRoutes(
          [
            approvedRoute("route-1", "Cameras", cameras),
            approvedRoute("route-2", "Used", used)
          ],
          discoverer
        );

        expect(discoverer.calls).toEqual([cameras, used]);
        expect(result.crawledRoutes).toEqual([cameras, used]);
        expect(result.urls).toEqual([
          "https://shop.test/p1",
          "https://shop.test/p2"
        ]);
        expect(result.passes).toBe(5);
      }
    );

    test(
      "returns an empty queue when DEV0 resolves no approved routes",
      async () => {
        const discoverApprovedCameraRoutes =
          await loadDiscoverApprovedCameraRoutes();

        expect(discoverApprovedCameraRoutes).toBeDefined();
        if (discoverApprovedCameraRoutes === undefined) {
          return;
        }

        const discoverer = new FakeDiscoverer(new Map());
        const result = await discoverApprovedCameraRoutes(
          [],
          discoverer
        );

        expect(discoverer.calls).toEqual([]);
        expect(result).toEqual({
          urls: [],
          crawledRoutes: [],
          passes: 0
        });
      }
    );

    test(
      "deduplicates exact product URLs across approved routes while preserving first-seen order",
      async () => {
        const discoverApprovedCameraRoutes =
          await loadDiscoverApprovedCameraRoutes();

        expect(discoverApprovedCameraRoutes).toBeDefined();
        if (discoverApprovedCameraRoutes === undefined) {
          return;
        }

        const first = "https://shop.test/cameras";
        const second = "https://shop.test/mirrorless";
        const discoverer = new FakeDiscoverer(
          new Map([
            [
              first,
              {
                urls: [
                  "https://shop.test/p1",
                  "https://shop.test/shared"
                ],
                passes: 3
              }
            ],
            [
              second,
              {
                urls: [
                  "https://shop.test/shared",
                  "https://shop.test/p2"
                ],
                passes: 3
              }
            ]
          ])
        );

        const result = await discoverApprovedCameraRoutes(
          [
            approvedRoute("route-a", "First", first),
            approvedRoute("route-b", "Second", second)
          ],
          discoverer
        );

        expect(result.urls).toEqual([
          "https://shop.test/p1",
          "https://shop.test/shared",
          "https://shop.test/p2"
        ]);
      }
    );

    test(
      "forwards every discovered URL without local product-semantic filtering",
      async () => {
        const discoverApprovedCameraRoutes =
          await loadDiscoverApprovedCameraRoutes();

        expect(discoverApprovedCameraRoutes).toBeDefined();
        if (discoverApprovedCameraRoutes === undefined) {
          return;
        }

        const route = "https://shop.test/cameras";
        const urls = [
          "https://shop.test/accessories-looking-url",
          "https://shop.test/voucher-looking-url",
          "https://shop.test/not-camera-looking-url"
        ];

        const discoverer = new FakeDiscoverer(
          new Map([[route, { urls, passes: 3 }]])
        );

        const result = await discoverApprovedCameraRoutes(
          [approvedRoute("route-1", "Approved", route)],
          discoverer
        );

        expect(result.urls).toEqual(urls);
      }
    );


    test(
      "keeps numbered product-packet concerns outside the route-discovery boundary",
      async () => {
        const discoverApprovedCameraRoutes =
          await loadDiscoverApprovedCameraRoutes();

        expect(discoverApprovedCameraRoutes).toBeDefined();
        if (discoverApprovedCameraRoutes === undefined) {
          return;
        }

        const routeUrl = "https://shop.test/cameras";
        const propertyReads: PropertyKey[] = [];
        const route = new Proxy(
          approvedRoute(
            "route-numbered-packet-regression",
            "Approved camera route",
            routeUrl
          ),
          {
            get(target, property, receiver) {
              propertyReads.push(property);
              return Reflect.get(target, property, receiver);
            }
          }
        );

        const discoverer = new FakeDiscoverer(
          new Map([
            [
              routeUrl,
              {
                urls: [
                  "https://shop.test/p1",
                  "https://shop.test/p2"
                ],
                passes: 3
              }
            ]
          ])
        );

        const result = await discoverApprovedCameraRoutes(
          [route],
          discoverer
        );

        expect(discoverer.calls).toEqual([routeUrl]);
        expect(result.urls).toEqual([
          "https://shop.test/p1",
          "https://shop.test/p2"
        ]);
        expect(
          Array.from(new Set(propertyReads))
        ).toEqual(["url"]);
      }
    );

    test(
      "keeps accepted infinite-scroll and rel-next traversal inside each approved route",
      async () => {
        const discoverApprovedCameraRoutes =
          await loadDiscoverApprovedCameraRoutes();

        expect(discoverApprovedCameraRoutes).toBeDefined();
        if (discoverApprovedCameraRoutes === undefined) {
          return;
        }

        const route = "https://shop.test/cameras";
        const page2 = "https://shop.test/cameras?page=2";

        const runtime = new ScriptedRuntime(
          new Map([
            [
              route,
              new ScriptedPage([
                state(1000, [
                  { url: "https://shop.test/p1" },
                  { url: page2, rel: "next" }
                ]),
                state(1800, [
                  { url: "https://shop.test/p1" },
                  { url: "https://shop.test/p2" },
                  { url: page2, rel: "next" }
                ]),
                state(1800, [
                  { url: "https://shop.test/p1" },
                  { url: "https://shop.test/p2" },
                  { url: page2, rel: "next" }
                ]),
                state(1800, [
                  { url: "https://shop.test/p1" },
                  { url: "https://shop.test/p2" },
                  { url: page2, rel: "next" }
                ])
              ])
            ],
            [
              page2,
              new ScriptedPage([
                state(1200, [
                  { url: "https://shop.test/p3" }
                ]),
                state(1200, [
                  { url: "https://shop.test/p3" }
                ]),
                state(1200, [
                  { url: "https://shop.test/p3" }
                ])
              ])
            ]
          ])
        );

        const result = await discoverApprovedCameraRoutes(
          [approvedRoute("route-1", "Approved", route)],
          new RenderedListingDiscovery(runtime)
        );

        expect(runtime.opened).toEqual([route, page2]);
        expect(result.urls).toEqual([
          "https://shop.test/p1",
          "https://shop.test/p2",
          "https://shop.test/p3"
        ]);
      }
    );
  }
);
