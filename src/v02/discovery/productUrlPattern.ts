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


function isStrongSeed(
  node:
    ProductUrlNode
): boolean {

  return node.evidence.some(
    evidence =>
      [
        "JSON_LD_PRODUCT",
        "JSON_LD_ITEM_LIST",
        "API_ITEM",
        "REPEATED_CARD"
      ].includes(
        evidence.source
      )
  );
}


export function inferProductUrlPatterns(
  nodes:
    readonly ProductUrlNode[]
): ProductUrlPattern[] {

  const groups =
    new Map<
      string,
      {
        prefix:
          string;

        segmentCount:
          number;

        tailKind:
          ProductTailKind;

        count:
          number;
      }
    >();


  for (
    const node
    of nodes
  ) {

    if (
      !isStrongSeed(
        node
      )
    ) {
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


    const existing =
      groups.get(
        key
      );


    if (
      existing
    ) {

      existing.count +=
        1;
    }
    else {

      groups.set(
        key,
        {
          prefix,
          segmentCount:
            segments.length,
          tailKind:
            kind,
          count:
            1
        }
      );
    }
  }


  return Array.from(
    groups.values()
  )
    .filter(
      group =>
        group.count >=
        2
    )
    .map(
      group => {

        /*
         * Root-level slug patterns are very broad.
         * Keep them weak.
         */
        const broadRoot =
          group.prefix ===
          "/" &&
          group.tailKind ===
          "SLUG";


        const score =
          broadRoot
            ? 15
            : Math.min(
                40,
                20 +
                group.count *
                5
              );


        return {
          prefix:
            group.prefix,

          segmentCount:
            group.segmentCount,

          tailKind:
            group.tailKind,

          evidenceCount:
            group.count,

          score
        };
      }
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
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
          (a, b) =>
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
        url.toString(),

      score:
        best.score,

      pattern:
        best
    });
  }


  return results;
}