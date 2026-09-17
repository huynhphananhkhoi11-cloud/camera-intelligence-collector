import type {
  SiteBootstrapResult
} from "./siteBootstrapper.js";

import {
  canonicalizeUrl
} from "./urlPolicy.js";


export type RootEvidenceKind =
  | "SEED_SOURCE"
  | "COMMERCIAL_PATH"
  | "MENU_TEXT"
  | "SITEMAP_CLUSTER"
  | "PROBE";


export interface RootEvidence {
  kind:
    RootEvidenceKind;

  weight:
    number;

  detail:
    string;
}


export interface RootCandidate {
  url:
    string;

  score:
    number;

  sources:
    string[];

  evidence:
    RootEvidence[];
}


function normalizeText(
  value: string
): string {

  return value
    .toLowerCase()
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /đ/g,
      "d"
    );
}


function normalizePath(
  pathname: string
): string {

  if (
    pathname ===
    "/"
  ) {
    return "/";
  }


  const normalized =
    pathname.replace(
      /\/+$/,
      ""
    );


  return (
    normalized ||
    "/"
  );
}


export function isHardExcludedRootUrl(
  rawUrl: string
): boolean {

  try {

    const url =
      new URL(
        rawUrl
      );


    return /\/(?:cart|gio-hang|checkout|login|dang-nhap|register|account|search|tim-kiem|contact|lien-he)(?:\/|$)/i
      .test(
        url.pathname
      );
  }
  catch {
    return true;
  }
}


function hasCommercialPathSignal(
  pathname: string
): boolean {

  const normalized =
    normalizeText(
      pathname
    );


  return /\/(?:products?|san-pham|shop|store|catalog|categories?|category|danh-muc|equipment|equipments|thiet-bi|rental|rent|thue|collections?)(?:\/|$)/i
    .test(
      normalized
    );
}


function hasCommercialMenuSignal(
  text: string
): boolean {

  const normalized =
    normalizeText(
      text
    );


  return /\b(?:san pham|products?|shop|store|catalog|danh muc|category|categories|equipment|thiet bi|cho thue|thue|rental|collections?)\b/i
    .test(
      normalized
    );
}


/**
 * Build descendant counts in ONE pass over
 * sitemap URLs.
 *
 * Example:
 *
 * /categories/4
 *
 * contributes one descendant to:
 *
 * /categories
 *
 *
 * /shop/cameras/canon-r50
 *
 * contributes one descendant to:
 *
 * /shop
 * /shop/cameras
 *
 *
 * This avoids rescanning the entire sitemap
 * for every bootstrap seed.
 */
function buildSitemapClusterIndex(
  canonicalOrigin: string,
  sitemapUrls:
    readonly string[]
): Map<string, number> {

  const counts =
    new Map<
      string,
      number
    >();


  const origin =
    new URL(
      canonicalOrigin
    ).origin;


  /*
   * Avoid duplicate sitemap URLs inflating
   * cluster evidence.
   */
  const uniqueUrls =
    new Set<string>();


  for (
    const raw
    of sitemapUrls
  ) {

    const canonical =
      canonicalizeUrl(
        raw,
        canonicalOrigin
      );


    if (!canonical) {
      continue;
    }


    if (
      uniqueUrls.has(
        canonical
      )
    ) {
      continue;
    }


    uniqueUrls.add(
      canonical
    );


    let parsed:
      URL;


    try {

      parsed =
        new URL(
          canonical
        );
    }
    catch {
      continue;
    }


    if (
      parsed.origin !==
      origin
    ) {
      continue;
    }


    const segments =
      parsed.pathname
        .split(
          "/"
        )
        .filter(
          Boolean
        );


    /*
     * The full URL is not its own descendant.
     *
     * Therefore stop before segments.length.
     */
    for (
      let depth = 1;
      depth <
        segments.length;
      depth += 1
    ) {

      const prefix =
        "/" +
        segments
          .slice(
            0,
            depth
          )
          .join(
            "/"
          );


      counts.set(
        prefix,
        (
          counts.get(
            prefix
          ) ??
          0
        ) +
        1
      );
    }
  }


  return counts;
}


function clusterCountForUrl(
  rawUrl: string,
  clusterIndex:
    ReadonlyMap<string, number>
): number {

  try {

    const url =
      new URL(
        rawUrl
      );


    const path =
      normalizePath(
        url.pathname
      );


    if (
      path ===
      "/"
    ) {
      return 0;
    }


    return (
      clusterIndex.get(
        path
      ) ??
      0
    );
  }
  catch {
    return 0;
  }
}


export function buildRootCandidates(
  bootstrap:
    SiteBootstrapResult
): RootCandidate[] {

  /*
   * ======================================
   * PRECOMPUTE ONCE
   * ======================================
   */

  const clusterIndex =
    buildSitemapClusterIndex(
      bootstrap.canonicalOrigin,
      bootstrap.sitemaps.pageUrls
    );


  const menuText =
    new Map<
      string,
      string
    >();


  for (
    const menuSeed
    of bootstrap.menuSeeds
  ) {

    const canonical =
      canonicalizeUrl(
        menuSeed.url,
        bootstrap.canonicalOrigin
      );


    if (
      canonical
    ) {

      menuText.set(
        canonical,
        menuSeed.text
      );
    }
  }


  /*
   * Deduplicate bootstrap seed URLs while
   * preserving all source provenance.
   */
  const seedMap =
    new Map<
      string,
      Set<string>
    >();


  for (
    const seed
    of bootstrap.seeds
  ) {

    const canonical =
      canonicalizeUrl(
        seed.url,
        bootstrap.canonicalOrigin
      );


    if (
      !canonical ||
      isHardExcludedRootUrl(
        canonical
      )
    ) {
      continue;
    }


    let sources =
      seedMap.get(
        canonical
      );


    if (!sources) {

      sources =
        new Set<string>();

      seedMap.set(
        canonical,
        sources
      );
    }


    for (
      const source
      of seed.sources
    ) {

      sources.add(
        source
      );
    }
  }


  /*
   * ======================================
   * SCORE EACH UNIQUE SEED
   * ======================================
   */

  const candidates:
    RootCandidate[] = [];


  for (
    const [
      canonical,
      sourceSet
    ]
    of seedMap
  ) {

    const evidence:
      RootEvidence[] = [];


    let score =
      0;


    const sources =
      Array.from(
        sourceSet
      );


    for (
      const source
      of sources
    ) {

      let weight =
        0;


      switch (
        source
      ) {

        case "MENU":
          weight =
            15;
          break;

        case "SITEMAP":
          weight =
            5;
          break;

        case "HOMEPAGE":
          weight =
            5;
          break;

        case "ENTRY":
          weight =
            5;
          break;
      }


      if (
        weight >
        0
      ) {

        score +=
          weight;


        evidence.push({
          kind:
            "SEED_SOURCE",

          weight,

          detail:
            source
        });
      }
    }


    const parsed =
      new URL(
        canonical
      );


    if (
      hasCommercialPathSignal(
        parsed.pathname
      )
    ) {

      score +=
        20;


      evidence.push({
        kind:
          "COMMERCIAL_PATH",

        weight:
          20,

        detail:
          parsed.pathname
      });
    }


    const text =
      menuText.get(
        canonical
      ) ??
      "";


    if (
      text &&
      hasCommercialMenuSignal(
        text
      )
    ) {

      score +=
        15;


      evidence.push({
        kind:
          "MENU_TEXT",

        weight:
          15,

        detail:
          text.slice(
            0,
            180
          )
      });
    }


    /*
     * O(1) lookup instead of full sitemap scan.
     */
    const descendants =
      clusterCountForUrl(
        canonical,
        clusterIndex
      );


    if (
      descendants >=
      10
    ) {

      score +=
        25;


      evidence.push({
        kind:
          "SITEMAP_CLUSTER",

        weight:
          25,

        detail:
          `descendants=${descendants}`
      });
    }
    else if (
      descendants >=
      2
    ) {

      score +=
        15;


      evidence.push({
        kind:
          "SITEMAP_CLUSTER",

        weight:
          15,

        detail:
          `descendants=${descendants}`
      });
    }


    candidates.push({
      url:
        canonical,

      score:
        Math.min(
          score,
          100
        ),

      sources,

      evidence
    });
  }


  return candidates
    .sort(
      (
        a,
        b
      ) => {

        const scoreDifference =
          b.score -
          a.score;


        if (
          scoreDifference !==
          0
        ) {
          return scoreDifference;
        }


        return (
          a.url.length -
          b.url.length
        );
      }
    );
}