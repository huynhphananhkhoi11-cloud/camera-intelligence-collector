import type {
  ApprovedCameraRoute
} from "../contracts/v15PipelineContracts.js";

import {
  RenderedListingDiscovery,
  type ListingDiscoveryResult
} from "./renderedListingDiscovery.js";

export interface ListingDiscoverer {
  discover(
    rootUrl: string,
    signal?: AbortSignal
  ): Promise<ListingDiscoveryResult>;
}

export interface ProductUrlQueueResult {
  readonly urls: readonly string[];
  readonly crawledRoutes: readonly string[];
  readonly passes: number;
}

export async function discoverApprovedCameraRoutes(
  routes: readonly ApprovedCameraRoute[],
  discoverer: ListingDiscoverer =
    new RenderedListingDiscovery(),
  signal?: AbortSignal
): Promise<ProductUrlQueueResult> {
  const urls: string[] = [];
  const seenUrls = new Set<string>();
  const crawledRoutes: string[] = [];
  const seenRoutes = new Set<string>();
  let passes = 0;

  for (const route of routes) {
    if (seenRoutes.has(route.url)) {
      continue;
    }

    seenRoutes.add(route.url);
    crawledRoutes.push(route.url);

    const result = await discoverer.discover(
      route.url,
      signal
    );

    passes += result.passes;

    for (const url of result.urls) {
      if (seenUrls.has(url)) {
        continue;
      }

      seenUrls.add(url);
      urls.push(url);
    }
  }

  return {
    urls,
    crawledRoutes,
    passes
  };
}
