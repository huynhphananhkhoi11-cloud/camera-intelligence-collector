import {
  resolveSiteEntry,
  type RedirectResolution,
  type SiteFetch
} from "./redirectResolver.js";

import {
  fetchRobotsPolicy,
  isUrlAllowedByRobots,
  type RobotsPolicy
} from "./robotsPolicy.js";

import {
  discoverSitemaps,
  type SitemapDiscoveryResult
} from "./sitemapDiscovery.js";

import {
  discoverMenuSeeds,
  type MenuSeedCandidate
} from "./menuSeedDiscovery.js";

import {
  canonicalizeUrl,
  isUrlInScope
} from "./urlPolicy.js";


export type BootstrapSeedSource =
  | "HOMEPAGE"
  | "ENTRY"
  | "SITEMAP"
  | "MENU";


export interface SiteBootstrapSeed {
  url: string;

  sources:
    BootstrapSeedSource[];

  /*
   * Confidence describes reliability as
   * a useful discovery seed.
   *
   * It is NOT camera/product classification.
   */
  confidence: number;
}


export interface SiteBootstrapDiagnostics {
  redirectCount: number;

  robotsAvailable: boolean;

  sitemapCount: number;

  sitemapPageCount: number;

  menuSeedCount: number;

  seedCount: number;

  excludedByRobots: number;

  excludedOutOfScope: number;
}


export interface SiteBootstrapResult {
  inputUrl: string;

  normalizedUrl: string;

  finalUrl: string;

  canonicalOrigin: string;

  redirect:
    RedirectResolution;

  robots:
    RobotsPolicy;

  sitemaps:
    SitemapDiscoveryResult;

  menuSeeds:
    MenuSeedCandidate[];

  seeds:
    SiteBootstrapSeed[];

  diagnostics:
    SiteBootstrapDiagnostics;
}


export interface SiteBootstrapOptions {
  timeoutMs?: number;

  maxRedirects?: number;

  maxSitemaps?: number;

  fetchFn?: SiteFetch;

  allowedOrigins?:
    readonly string[];

  userAgent?: string;
}


interface SeedState {
  sources:
    Set<BootstrapSeedSource>;

  confidence: number;
}


interface SeedBuildResult {
  seeds:
    SiteBootstrapSeed[];

  excludedByRobots:
    number;

  excludedOutOfScope:
    number;
}


function buildSeedPool(
  canonicalOrigin: string,
  finalUrl: string,
  sitemapUrls:
    readonly string[],
  menuSeeds:
    readonly MenuSeedCandidate[],
  robots:
    RobotsPolicy,
  allowedOrigins:
    readonly string[],
  userAgent: string
): SeedBuildResult {

  const seeds =
    new Map<
      string,
      SeedState
    >();

  let excludedByRobots =
    0;

  let excludedOutOfScope =
    0;


  const primaryOrigin =
    new URL(
      canonicalOrigin
    ).origin;


  const add = (
    raw: string,
    source:
      BootstrapSeedSource,
    confidence: number
  ): void => {

    const canonical =
      canonicalizeUrl(
        raw,
        canonicalOrigin
      );

    if (!canonical) {
      return;
    }


    if (
      !isUrlInScope(
        canonical,
        canonicalOrigin,
        allowedOrigins
      )
    ) {

      excludedOutOfScope +=
        1;

      return;
    }


    const candidateOrigin =
      new URL(
        canonical
      ).origin;


    if (
      candidateOrigin ===
        primaryOrigin &&
      !isUrlAllowedByRobots(
        canonical,
        robots,
        userAgent
      )
    ) {

      excludedByRobots +=
        1;

      return;
    }


    const existing =
      seeds.get(
        canonical
      );


    if (existing) {

      existing.sources.add(
        source
      );

      existing.confidence =
        Math.max(
          existing.confidence,
          confidence
        );

      return;
    }


    seeds.set(
      canonical,
      {
        sources:
          new Set([
            source
          ]),

        confidence
      }
    );
  };


  add(
    canonicalOrigin,
    "HOMEPAGE",
    1
  );


  add(
    finalUrl,
    "ENTRY",
    1
  );


  for (
    const url
    of sitemapUrls
  ) {

    add(
      url,
      "SITEMAP",
      0.80
    );
  }


  for (
    const menuSeed
    of menuSeeds
  ) {

    add(
      menuSeed.url,
      "MENU",
      menuSeed.confidence
    );
  }


  return {
    seeds:
      Array.from(
        seeds.entries()
      )
        .map(
          (
            [
              url,
              state
            ]
          ) => ({
            url,

            sources:
              Array.from(
                state.sources
              ),

            confidence:
              state.confidence
          })
        )
        .sort(
          (a, b) =>
            b.confidence -
            a.confidence
        ),

    excludedByRobots,

    excludedOutOfScope
  };
}


/**
 * Generic site bootstrap.
 *
 * No camera keyword filtering or
 * product classification happens here.
 */
export async function bootstrapSite(
  inputUrl: string,
  options:
    SiteBootstrapOptions = {}
): Promise<SiteBootstrapResult> {

  const timeoutMs =
    options.timeoutMs ??
    15000;

  const allowedOrigins =
    options.allowedOrigins ??
    [];

  const userAgent =
    options.userAgent ??
    "CameraIntelligenceCollector";


  const redirect =
    await resolveSiteEntry(
      inputUrl,
      {
        timeoutMs,

        maxRedirects:
          options.maxRedirects,

        fetchFn:
          options.fetchFn
      }
    );


  const robots =
    await fetchRobotsPolicy(
      redirect.canonicalOrigin,
      {
        timeoutMs,

        fetchFn:
          options.fetchFn
      }
    );


  const sitemaps =
    await discoverSitemaps(
      redirect.canonicalOrigin,
      robots.sitemapUrls,
      {
        timeoutMs,

        maxSitemaps:
          options.maxSitemaps,

        fetchFn:
          options.fetchFn,

        allowedOrigins
      }
    );


  const menuSeeds =
    await discoverMenuSeeds(
      redirect.finalUrl,
      {
        timeoutMs,

        fetchFn:
          options.fetchFn,

        allowedOrigins
      }
    );


  const seedBuild =
    buildSeedPool(
      redirect.canonicalOrigin,
      redirect.finalUrl,
      sitemaps.pageUrls,
      menuSeeds,
      robots,
      allowedOrigins,
      userAgent
    );


  return {
    inputUrl,

    normalizedUrl:
      redirect.normalizedUrl,

    finalUrl:
      redirect.finalUrl,

    canonicalOrigin:
      redirect.canonicalOrigin,

    redirect,

    robots,

    sitemaps,

    menuSeeds,

    seeds:
      seedBuild.seeds,

    diagnostics: {
      redirectCount:
        redirect.redirects.length,

      robotsAvailable:
        robots.available,

      sitemapCount:
        sitemaps.sitemapUrls.length,

      sitemapPageCount:
        sitemaps.pageUrls.length,

      menuSeedCount:
        menuSeeds.length,

      seedCount:
        seedBuild.seeds.length,

      excludedByRobots:
        seedBuild.excludedByRobots,

      excludedOutOfScope:
        seedBuild.excludedOutOfScope
    }
  };
}