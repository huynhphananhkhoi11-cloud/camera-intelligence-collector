import * as cheerio from "cheerio";

import type {
  NetworkObserverSnapshot
} from "../network/networkObserver.js";


export type RootProbeEvidenceKind =
  | "API_ACTIVITY"
  | "JSON_LD_LIST"
  | "REPEATED_CARDS"
  | "PRICE_IMAGE_GRID"
  | "CTA"
  | "PAGINATION";


export interface RootProbeEvidence {
  kind:
    RootProbeEvidenceKind;

  weight:
    number;

  detail:
    string;
}


export interface CommercialRootProbeResult {
  url:
    string;

  score:
    number;

  repeatedCardCount:
    number;

  priceNodeCount:
    number;

  linkedImageCount:
    number;

  ctaCount:
    number;

  paginationCount:
    number;

  jsonLdProductCount:
    number;

  jsonLdItemListCount:
    number;

  apiCandidateCount:
    number;

  evidence:
    RootProbeEvidence[];
}


function clean(
  value: unknown
): string {

  return String(
    value ??
    ""
  )
    .replace(
      /\u00a0/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function jsonLdTypes(
  value: unknown,
  result:
    string[],
  depth = 0
): void {

  if (
    depth >
    8 ||
    value ===
      null ||
    value ===
      undefined
  ) {
    return;
  }


  if (
    Array.isArray(
      value
    )
  ) {

    for (
      const child
      of value
    ) {

      jsonLdTypes(
        child,
        result,
        depth + 1
      );
    }

    return;
  }


  if (
    typeof value !==
    "object"
  ) {
    return;
  }


  const record =
    value as Record<
      string,
      unknown
    >;


  const rawType =
    record["@type"];


  if (
    typeof rawType ===
    "string"
  ) {

    result.push(
      rawType
    );
  }
  else if (
    Array.isArray(
      rawType
    )
  ) {

    for (
      const item
      of rawType
    ) {

      if (
        typeof item ===
        "string"
      ) {
        result.push(
          item
        );
      }
    }
  }


  for (
    const child
    of Object.values(
      record
    )
  ) {

    if (
      typeof child ===
        "object" &&
      child !==
        null
    ) {

      jsonLdTypes(
        child,
        result,
        depth + 1
      );
    }
  }
}


export function probeCommercialRootHtml(
  html: string,
  url: string,
  network?:
    NetworkObserverSnapshot
): CommercialRootProbeResult {

  const $ =
    cheerio.load(
      html
    );


  const evidence:
    RootProbeEvidence[] = [];

  let score =
    0;


  const repeatedCardCount =
    $(
      [
        "article:has(a[href])",
        ".product:has(a[href])",
        ".product-item:has(a[href])",
        ".product-card:has(a[href])",
        "[data-product-id]:has(a[href])",
        '[itemtype*="Product"]:has(a[href])'
      ].join(",")
    ).length;


  const priceNodeCount =
    $(
      [
        ".price",
        "[data-price]",
        '[class*="price"]',
        '[itemprop="price"]'
      ].join(",")
    ).length;


  const linkedImageCount =
    $("a[href] img")
      .length;


  const ctaText =
    $(
      [
        "a",
        "button",
        '[role="button"]'
      ].join(",")
    )
      .map(
        (
          _,
          element
        ) =>
          clean(
            $(element)
              .text()
          )
      )
      .get()
      .filter(
        text =>
          /\b(?:buy now|add to cart|mua ngay|them vao gio|dat thue|thue ngay|rent now|book now|xem chi tiet|view details)\b/i
            .test(
              text
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
                )
            )
      );


  const ctaCount =
    ctaText.length;


  const paginationCount =
    $(
      [
        'a[rel="next"]',
        'a[href*="?page="]',
        'a[href*="&page="]',
        'a[href*="/page/"]',
        ".pagination a",
        ".pager a"
      ].join(",")
    ).length;


  const types:
    string[] = [];


  $(
    'script[type="application/ld+json"]'
  ).each(
    (
      _,
      element
    ) => {

      try {

        const parsed =
          JSON.parse(
            $(element)
              .text()
          );

        jsonLdTypes(
          parsed,
          types
        );
      }
      catch {
        // Malformed JSON-LD is diagnostic noise.
      }
    }
  );


  const jsonLdProductCount =
    types.filter(
      type =>
        /product/i.test(
          type
        )
    ).length;


  const jsonLdItemListCount =
    types.filter(
      type =>
        /itemlist/i.test(
          type
        )
    ).length;


  const apiCandidateCount =
    network
      ?.apiCandidates
      .length ??
    0;


  if (
    apiCandidateCount >
    0
  ) {

    const weight =
      Math.min(
        40,
        30 +
        apiCandidateCount * 5
      );

    score +=
      weight;

    evidence.push({
      kind:
        "API_ACTIVITY",

      weight,

      detail:
        `apiCandidates=${apiCandidateCount}`
    });
  }


  if (
    jsonLdItemListCount >
    0
  ) {

    score +=
      35;

    evidence.push({
      kind:
        "JSON_LD_LIST",

      weight:
        35,

      detail:
        `ItemList=${jsonLdItemListCount}`
    });
  }
  else if (
    jsonLdProductCount >=
    2
  ) {

    score +=
      30;

    evidence.push({
      kind:
        "JSON_LD_LIST",

      weight:
        30,

      detail:
        `Product=${jsonLdProductCount}`
    });
  }


  if (
    repeatedCardCount >=
    3
  ) {

    score +=
      30;

    evidence.push({
      kind:
        "REPEATED_CARDS",

      weight:
        30,

      detail:
        `cards=${repeatedCardCount}`
    });
  }


  if (
    priceNodeCount >=
      2 &&
    linkedImageCount >=
      2
  ) {

    score +=
      20;

    evidence.push({
      kind:
        "PRICE_IMAGE_GRID",

      weight:
        20,

      detail:
        `prices=${priceNodeCount}; linkedImages=${linkedImageCount}`
    });
  }


  if (
    ctaCount >=
    2
  ) {

    score +=
      10;

    evidence.push({
      kind:
        "CTA",

      weight:
        10,

      detail:
        `cta=${ctaCount}`
    });
  }


  if (
    paginationCount >
    0
  ) {

    score +=
      10;

    evidence.push({
      kind:
        "PAGINATION",

      weight:
        10,

      detail:
        `pagination=${paginationCount}`
    });
  }


  return {
    url,

    score:
      Math.min(
        score,
        100
      ),

    repeatedCardCount,

    priceNodeCount,

    linkedImageCount,

    ctaCount,

    paginationCount,

    jsonLdProductCount,

    jsonLdItemListCount,

    apiCandidateCount,

    evidence
  };
}