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
  canonicalizeUrl,
  isUrlInScope
} from "./urlPolicy.js";


export type BootstrapSeedSource =
  | "HOMEPAGE"
  | "ENTRY"
  | "SITEMAP";


export interface SiteBootstrapSeed {
  url: string;
  sources: BootstrapSeedSource[];
}


export interface SiteBootstrapDiagnostics {
  redirectCount: number;
  robotsAvailable: boolean;
  sitemapCount: number;
  sitemapPageCount: number;
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


interface SeedBuildResult {
  seeds: SiteBootstrapSeed[];
  excludedByRobots: number;
  excludedOutOfScope: number;
}


function buildSeedPool(
  canonicalOrigin: string,
  finalUrl: string,
  sitemapUrls: readonly string[],
  robots: RobotsPolicy,
  allowedOrigins:
    readonly string[],
  userAgent: string
): SeedBuildResult {

  const seeds =
    new Map<
      string,
      Set<BootstrapSeedSource>
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
      BootstrapSeedSource
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


    /*
     * robots.txt retrieved from the primary
     * canonical origin applies to that origin.
     *
     * Explicit alias origins are not evaluated
     * against another host's robots policy.
     */
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


    let sources =
      seeds.get(
        canonical
      );

    if (!sources) {

      sources =
        new Set<
          BootstrapSeedSource
        >();

      seeds.set(
        canonical,
        sources
      );
    }

    sources.add(
      source
    );
  };


  /*
   * Homepage is always a useful generic
   * discovery seed.
   */
  add(
    canonicalOrigin,
    "HOMEPAGE"
  );


  /*
   * Preserve the final redirected entry path.
   * A user may intentionally supply a useful
   * catalog or storefront URL.
   */
  add(
    finalUrl,
    "ENTRY"
  );


  for (
    const url
    of sitemapUrls
  ) {

    add(
      url,
      "SITEMAP"
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
              sources
            ]
          ) => ({
            url,
            sources:
              Array.from(
                sources
              )
          })
        ),

    excludedByRobots,

    excludedOutOfScope
  };
}


/**
 * Generic site bootstrap.
 *
 * Input:
 *   one root/site URL
 *
 * Output:
 *   canonical origin
 *   redirect diagnostics
 *   robots policy
 *   sitemap inventory
 *   generic crawl seed pool
 *
 * Camera/product classification intentionally
 * happens later in the pipeline.
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


  /*
   * 1. Resolve real site entry.
   */
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


  /*
   * 2. Fetch robots.txt from final origin.
   */
  const robots =
    await fetchRobotsPolicy(
      redirect.canonicalOrigin,
      {
        timeoutMs,

        fetchFn:
          options.fetchFn
      }
    );


  /*
   * 3. Discover declared/fallback sitemaps.
   */
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


  /*
   * 4. Build generic seed pool.
   */
  const seedBuild =
    buildSeedPool(
      redirect.canonicalOrigin,
      redirect.finalUrl,
      sitemaps.pageUrls,
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

      seedCount:
        seedBuild.seeds.length,

      excludedByRobots:
        seedBuild.excludedByRobots,

      excludedOutOfScope:
        seedBuild.excludedOutOfScope
    }
  };
}