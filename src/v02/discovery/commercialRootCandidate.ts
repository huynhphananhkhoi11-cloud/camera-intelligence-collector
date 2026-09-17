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


function descendantCount(
  candidateUrl: string,
  sitemapUrls:
    readonly string[]
): number {

  const candidate =
    new URL(
      candidateUrl
    );

  if (
    candidate.pathname ===
    "/"
  ) {
    return 0;
  }

  const prefix =
    candidate.pathname
      .replace(
        /\/+$/,
        ""
      ) +
    "/";

  let count =
    0;

  for (
    const raw
    of sitemapUrls
  ) {

    try {

      const item =
        new URL(
          raw
        );

      if (
        item.origin ===
          candidate.origin &&
        item.pathname.startsWith(
          prefix
        )
      ) {

        count +=
          1;
      }
    }
    catch {
      // Ignore malformed sitemap URL.
    }
  }

  return count;
}


export function buildRootCandidates(
  bootstrap:
    SiteBootstrapResult
): RootCandidate[] {

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


  const candidates:
    RootCandidate[] = [];


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


    const evidence:
      RootEvidence[] = [];

    let score =
      0;


    for (
      const source
      of seed.sources
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


    const descendants =
      descendantCount(
        canonical,
        bootstrap.sitemaps.pageUrls
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

      sources:
        [...seed.sources],

      evidence
    });
  }


  return candidates
    .sort(
      (a, b) => {

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