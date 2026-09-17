import {
  parseRentalPrice,
  parseSalePrice,
  parseStructuredPrice
} from "../priceParser.js";

import type {
  PipelineResult
} from "../pipeline/productPipeline.js";


export type ConflictSeverity =
  | "HIGH"
  | "MEDIUM"
  | "INFO";


export interface ConflictRow {
  url: string;

  productName: string;

  field: string;

  severity:
    ConflictSeverity;

  values: string;

  explanation: string;
}


interface ComparableCandidate<T> {
  source: string;
  raw: string;
  value: T;
}


function clean(
  value:
    unknown
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


function normalizeText(
  value:
    unknown
): string {

  return clean(
    value
  )
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
    .replace(
      /Đ/g,
      "D"
    )
    .toLowerCase()
    .replace(
      /[^\p{L}\p{N}]+/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function independentMismatch<T>(
  candidates:
    ComparableCandidate<T>[]
): boolean {

  for (
    let left = 0;
    left < candidates.length;
    left++
  ) {
    for (
      let right =
        left + 1;
      right < candidates.length;
      right++
    ) {
      if (
        candidates[left].source !==
          candidates[right].source &&
        candidates[left].value !==
          candidates[right].value
      ) {
        return true;
      }
    }
  }

  return false;
}


function candidateText<T>(
  candidates:
    ComparableCandidate<T>[]
): string {

  return Array.from(
    new Set(
      candidates.map(
        candidate =>
          `${candidate.source}: ${candidate.raw}`
      )
    )
  ).join(
    " | "
  );
}


function priceCandidates(
  evidence:
    Array<{
      source: string;
      raw: string;
    }>,
  kind:
    "RENTAL" |
    "SALE"
): ComparableCandidate<number>[] {

  const candidates:
    ComparableCandidate<number>[] =
      [];

  for (
    const item
    of evidence
  ) {
    let amount:
      number |
      null;

    if (
      item.source ===
        "JSON_LD"
    ) {
      amount =
        parseStructuredPrice(
          item.raw
        );
    }
    else if (
      kind ===
        "RENTAL"
    ) {
      amount =
        parseRentalPrice(
          item.raw
        );
    }
    else {
      amount =
        parseSalePrice(
          item.raw
        );
    }

    if (
      amount ===
        null
    ) {
      continue;
    }

    candidates.push({
      source:
        item.source,

      raw:
        item.raw,

      value:
        amount
    });
  }

  return candidates;
}


function parseRating(
  raw:
    string
): number | null {

  const text =
    clean(
      raw
    );

  const slash =
    text.match(
      /\b([0-5](?:[.,]\d+)?)\s*\/\s*5\b/
    );

  if (slash) {
    const value =
      Number(
        slash[1].replace(
          ",",
          "."
        )
      );

    return Number.isFinite(
      value
    )
      ? value
      : null;
  }

  if (
    /^[0-5](?:[.,]\d+)?$/
      .test(
        text
      )
  ) {
    const value =
      Number(
        text.replace(
          ",",
          "."
        )
      );

    return Number.isFinite(
      value
    )
      ? value
      : null;
  }

  return null;
}


function ratingCandidates(
  evidence:
    Array<{
      source: string;
      raw: string;
    }>
): ComparableCandidate<number>[] {

  const candidates:
    ComparableCandidate<number>[] =
      [];

  for (
    const item
    of evidence
  ) {
    const value =
      parseRating(
        item.raw
      );

    if (
      value ===
        null
    ) {
      continue;
    }

    candidates.push({
      source:
        item.source,

      raw:
        item.raw,

      value
    });
  }

  return candidates;
}


function parseStock(
  raw:
    string
): string {

  const text =
    normalizeText(
      raw
    );

  if (
    /\b(?:outofstock|out of stock|het hang)\b/
      .test(
        text
      )
  ) {
    return "OUT_OF_STOCK";
  }

  if (
    /\b(?:preorder|pre order|dat truoc)\b/
      .test(
        text
      )
  ) {
    return "PREORDER";
  }

  if (
    /\b(?:instock|in stock|con hang)\b/
      .test(
        text
      )
  ) {
    return "IN_STOCK";
  }

  return "";
}


function stockCandidates(
  evidence:
    Array<{
      source: string;
      raw: string;
    }>
): ComparableCandidate<string>[] {

  const candidates:
    ComparableCandidate<string>[] =
      [];

  for (
    const item
    of evidence
  ) {
    const value =
      parseStock(
        item.raw
      );

    if (!value) {
      continue;
    }

    candidates.push({
      source:
        item.source,

      raw:
        item.raw,

      value
    });
  }

  return candidates;
}


function conditionCandidates(
  result:
    PipelineResult
): ComparableCandidate<string>[] {

  return result.analysis.condition.evidence.map(
    evidence => ({
      source:
        evidence.source,

      raw:
        evidence.text,

      value:
        evidence.condition
    })
  );
}


function structuredProductNames(
  values:
    unknown[]
): ComparableCandidate<string>[] {

  const candidates:
    ComparableCandidate<string>[] =
      [];

  const seen =
    new Set<object>();

  const walk = (
    value:
      unknown
  ): void => {

    if (
      value === null ||
      value === undefined ||
      typeof value !==
        "object"
    ) {
      return;
    }

    if (
      seen.has(
        value
      )
    ) {
      return;
    }

    seen.add(
      value
    );

    if (
      Array.isArray(
        value
      )
    ) {
      for (
        const child
        of value
      ) {
        walk(
          child
        );
      }

      return;
    }

    const object =
      value as Record<
        string,
        unknown
      >;

    const rawType =
      object["@type"];

    const types =
      Array.isArray(
        rawType
      )
        ? rawType
        : [
            rawType
          ];

    const isProduct =
      types.some(
        item => {

          const type =
            clean(
              item
            );

          return (
            type.toLowerCase() ===
              "product" ||
            /(?:^|[\/#:])product$/i
              .test(
                type
              )
          );
        }
      );

    if (isProduct) {
      const name =
        clean(
          object.name
        );

      if (name) {
        candidates.push({
          source:
            "JSON_LD",

          raw:
            name,

          value:
            normalizeText(
              name
            )
        });
      }
    }

    for (
      const child
      of Object.values(
        object
      )
    ) {
      walk(
        child
      );
    }
  };


  for (
    const value
    of values
  ) {
    walk(
      value
    );
  }


  return candidates;
}


function materiallyDifferentName(
  left:
    string,
  right:
    string
): boolean {

  const a =
    normalizeText(
      left
    );

  const b =
    normalizeText(
      right
    );

  if (
    !a ||
    !b ||
    a ===
      b
  ) {
    return false;
  }

  /*
   * A common harmless case:
   * "Canon EOS R50 Body" versus "Canon EOS R50".
   */
  if (
    a.includes(
      b
    ) ||
    b.includes(
      a
    )
  ) {
    return false;
  }

  const aTokens =
    new Set(
      a.split(" ")
        .filter(Boolean)
    );

  const bTokens =
    new Set(
      b.split(" ")
        .filter(Boolean)
    );

  if (
    aTokens.size ===
      0 ||
    bTokens.size ===
      0
  ) {
    return true;
  }

  let overlap =
    0;

  for (
    const token
    of aTokens
  ) {
    if (
      bTokens.has(
        token
      )
    ) {
      overlap++;
    }
  }

  const denominator =
    Math.min(
      aTokens.size,
      bTokens.size
    );

  return (
    overlap /
    denominator
  ) < 0.6;
}


function nameConflictCandidates(
  result:
    PipelineResult
): ComparableCandidate<string>[] {

  const canonical =
    clean(
      result.facts.title
    );

  if (!canonical) {
    return [];
  }

  const structured =
    structuredProductNames(
      result.facts.jsonLd
    );

  const canonicalNormalized =
    normalizeText(
      canonical
    );

  const candidates:
    ComparableCandidate<string>[] = [
      {
        source:
          "CANONICAL",

        raw:
          canonical,

        value:
          canonicalNormalized
      }
    ];


  for (
    const item
    of structured
  ) {
    if (
      materiallyDifferentName(
        canonical,
        item.raw
      )
    ) {
      candidates.push(
        item
      );
    }
  }


  return candidates;
}


function pushConflict(
  rows:
    ConflictRow[],
  result:
    PipelineResult,
  field:
    string,
  severity:
    ConflictSeverity,
  values:
    string,
  explanation:
    string
): void {

  rows.push({
    url:
      result.facts.url,

    productName:
      result.facts.title,

    field,

    severity,

    values,

    explanation
  });
}


export function detectConflicts(
  result:
    PipelineResult
): ConflictRow[] {

  const rows:
    ConflictRow[] = [];


  /*
   * ==========================================
   * HIGH — TRANSACTION PRICE
   * ==========================================
   */

  const rentalPrices =
    priceCandidates(
      result.fields.rentalPrice.evidence,
      "RENTAL"
    );

  if (
    independentMismatch(
      rentalPrices
    )
  ) {
    pushConflict(
      rows,
      result,
      "RENTAL_PRICE",
      "HIGH",
      candidateText(
        rentalPrices
      ),
      "Independent rental price evidence disagrees."
    );
  }


  const salePrices =
    priceCandidates(
      result.fields.salePrice.evidence,
      "SALE"
    );

  if (
    independentMismatch(
      salePrices
    )
  ) {
    pushConflict(
      rows,
      result,
      "SALE_PRICE",
      "HIGH",
      candidateText(
        salePrices
      ),
      "Independent sale price evidence disagrees."
    );
  }


  /*
   * ==========================================
   * HIGH — CONDITION
   * ==========================================
   */

  const conditions =
    conditionCandidates(
      result
    );

  if (
    independentMismatch(
      conditions
    )
  ) {
    pushConflict(
      rows,
      result,
      "CONDITION",
      "HIGH",
      candidateText(
        conditions
      ),
      "Independent product-condition evidence disagrees."
    );
  }


  /*
   * ==========================================
   * HIGH — STOCK
   * ==========================================
   */

  const stock =
    stockCandidates(
      result.fields.stock.evidence
    );

  if (
    independentMismatch(
      stock
    )
  ) {
    pushConflict(
      rows,
      result,
      "STOCK",
      "HIGH",
      candidateText(
        stock
      ),
      "Independent stock evidence disagrees."
    );
  }


  /*
   * ==========================================
   * MEDIUM — RATING
   * ==========================================
   */

  const ratings =
    ratingCandidates(
      result.fields.rating.evidence
    );

  if (
    independentMismatch(
      ratings
    )
  ) {
    pushConflict(
      rows,
      result,
      "RATING",
      "MEDIUM",
      candidateText(
        ratings
      ),
      "Independent rating evidence disagrees."
    );
  }


  /*
   * ==========================================
   * MEDIUM — PRODUCT NAME
   * ==========================================
   *
   * Canonical title remains selected by Phase 8.
   * Phase 9 only reports a material disagreement
   * with independent structured Product.name.
   */

  const names =
    nameConflictCandidates(
      result
    );

  if (
    independentMismatch(
      names
    )
  ) {
    pushConflict(
      rows,
      result,
      "PRODUCT_NAME",
      "MEDIUM",
      candidateText(
        names
      ),
      "Canonical product name materially disagrees with structured Product.name."
    );
  }


  return rows;
}


export function detectAllConflicts(
  results:
    PipelineResult[]
): ConflictRow[] {

  return results.flatMap(
    result =>
      detectConflicts(
        result
      )
  );
}