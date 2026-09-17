import type {
  ProductUrlNode
} from "./productUrlGraph.js";


export type ProductTailKind =
  | "NUMERIC"
  | "SLUG"
  | "OTHER";


export interface ProductUrlPattern {
  prefix:
    string;

  segmentCount:
    number;

  tailKind:
    ProductTailKind;

  evidenceCount:
    number;

  strongEvidenceCount:
    number;

  mediumEvidenceCount:
    number;

  score:
    number;
}


export interface SitemapPatternCandidate {
  url:
    string;

  score:
    number;

  pattern:
    ProductUrlPattern;
}


type PatternSeedStrength =
  | "STRONG"
  | "MEDIUM";


function tailKind(
  value: string
): ProductTailKind {

  if (
    /^\d+$/.test(
      value
    )
  ) {
    return "NUMERIC";
  }


  if (
    /^[a-z0-9][a-z0-9-]{2,}$/i
      .test(
        value
      )
  ) {
    return "SLUG";
  }


  return "OTHER";
}


/**
 * Strong seeds are sources that directly look
 * like product-detail discovery.
 *
 * IMAGE_LINK / PRICE_LINK are weaker, but a
 * repeated structural cluster of them can still
 * reveal a generic URL pattern.
 *
 * CTA_LINK is intentionally excluded because a
 * site-wide booking/cart CTA can contaminate the
 * graph.
 */
function patternSeedStrength(
  node:
    ProductUrlNode
): PatternSeedStrength | null {

  const sources =
    new Set(
      node.evidence.map(
        evidence =>
          evidence.source
      )
    );


  const hasStrong =
    [
      "JSON_LD_PRODUCT",
      "JSON_LD_ITEM_LIST",
      "API_ITEM",
      "REPEATED_CARD"
    ].some(
      source =>
        sources.has(
          source as
            | "JSON_LD_PRODUCT"
            | "JSON_LD_ITEM_LIST"
            | "API_ITEM"
            | "REPEATED_CARD"
        )
    );


  if (
    hasStrong
  ) {
    return "STRONG";
  }


  if (
    sources.has(
      "IMAGE_LINK"
    ) ||
    sources.has(
      "PRICE_LINK"
    )
  ) {
    return "MEDIUM";
  }


  return null;
}


interface PatternGroup {
  prefix:
    string;

  segmentCount:
    number;

  tailKind:
    ProductTailKind;

  count:
    number;

  strongCount:
    number;

  mediumCount:
    number;
}


export function inferProductUrlPatterns(
  nodes:
    readonly ProductUrlNode[]
): ProductUrlPattern[] {

  const groups =
    new Map<
      string,
      PatternGroup
    >();


  for (
    const node
    of nodes
  ) {

    const strength =
      patternSeedStrength(
        node
      );


    if (!strength) {
      continue;
    }


    const url =
      new URL(
        node.url
      );


    const segments =
      url.pathname
        .split("/")
        .filter(Boolean);


    if (
      segments.length ===
      0
    ) {
      continue;
    }


    const tail =
      segments[
        segments.length -
        1
      ]!;


    const prefix =
      segments.length ===
        1
        ? "/"
        : "/" +
          segments
            .slice(
              0,
              -1
            )
            .join("/") +
          "/";


    const kind =
      tailKind(
        tail
      );


    const key =
      [
        prefix,
        segments.length,
        kind
      ].join("|");


    let group =
      groups.get(
        key
      );


    if (!group) {

      group = {
        prefix,

        segmentCount:
          segments.length,

        tailKind:
          kind,

        count:
          0,

        strongCount:
          0,

        mediumCount:
          0
      };


      groups.set(
        key,
        group
      );
    }


    group.count +=
      1;


    if (
      strength ===
      "STRONG"
    ) {

      group.strongCount +=
        1;
    }
    else {

      group.mediumCount +=
        1;
    }
  }


  return Array.from(
    groups.values()
  )
    .filter(
      group => {

        /*
         * Two strong independent seeds are
         * sufficient.
         *
         * Weak structural signals need at least
         * three matching URLs before a pattern
         * exists.
         */
        return (
          group.strongCount >=
            2 ||
          group.mediumCount >=
            3
        );
      }
    )
    .map(
      group => {

        const broadRoot =
          group.prefix ===
            "/" &&
          group.tailKind ===
            "SLUG";


        let score:
          number;


        if (
          broadRoot
        ) {

          /*
           * Root-level slug patterns can match
           * news/categories as well as products.
           *
           * Keep them intentionally weak.
           */
          score =
            group.strongCount >=
              2
              ? 15
              : 10;
        }
        else if (
          group.strongCount >=
          2
        ) {

          score =
            Math.min(
              40,
              20 +
              group.count *
              5
            );
        }
        else {

          /*
           * Repeated medium structural evidence.
           */
          score =
            Math.min(
              25,
              10 +
              group.count *
              2
            );
        }


        return {
          prefix:
            group.prefix,

          segmentCount:
            group.segmentCount,

          tailKind:
            group.tailKind,

          evidenceCount:
            group.count,

          strongEvidenceCount:
            group.strongCount,

          mediumEvidenceCount:
            group.mediumCount,

          score
        };
      }
    )
    .sort(
      (
        a,
        b
      ) => {

        if (
          b.score !==
          a.score
        ) {
          return (
            b.score -
            a.score
          );
        }


        return (
          b.evidenceCount -
          a.evidenceCount
        );
      }
    );
}


function matchesPattern(
  url:
    URL,
  pattern:
    ProductUrlPattern
): boolean {

  const segments =
    url.pathname
      .split("/")
      .filter(Boolean);


  if (
    segments.length !==
    pattern.segmentCount
  ) {
    return false;
  }


  if (
    !url.pathname.startsWith(
      pattern.prefix
    )
  ) {
    return false;
  }


  const tail =
    segments[
      segments.length -
      1
    ];


  if (!tail) {
    return false;
  }


  return (
    tailKind(
      tail
    ) ===
    pattern.tailKind
  );
}


export function scoreSitemapProductCandidates(
  sitemapUrls:
    readonly string[],
  patterns:
    readonly ProductUrlPattern[],
  canonicalOrigin:
    string
): SitemapPatternCandidate[] {

  const origin =
    new URL(
      canonicalOrigin
    ).origin;


  const results:
    SitemapPatternCandidate[] = [];


  const seen =
    new Set<string>();


  for (
    const raw
    of sitemapUrls
  ) {

    let url:
      URL;


    try {

      url =
        new URL(
          raw,
          canonicalOrigin
        );
    }
    catch {
      continue;
    }


    if (
      url.origin !==
      origin
    ) {
      continue;
    }


    /*
     * Avoid duplicate sitemap entries before
     * pattern scoring.
     */
    const canonical =
      url.toString();


    if (
      seen.has(
        canonical
      )
    ) {
      continue;
    }


    seen.add(
      canonical
    );


    const matches =
      patterns
        .filter(
          pattern =>
            matchesPattern(
              url,
              pattern
            )
        )
        .sort(
          (
            a,
            b
          ) =>
            b.score -
            a.score
        );


    const best =
      matches[0];


    if (!best) {
      continue;
    }


    results.push({
      url:
        canonical,

      score:
        best.score,

      pattern:
        best
    });
  }


  return results;
}