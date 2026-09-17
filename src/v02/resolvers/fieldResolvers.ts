import {
  parseRentalPrice,
  parseSalePrice,
  parseStructuredPrice
} from "../priceParser.js";

import {
  getSectionContent,
  getSectionEvidenceText
} from "../sectionizer.js";

import type {
  ProductAnalysis
} from "../evidenceEngine.js";

import type {
  RawProductFacts
} from "../rawProductExtractor.js";


export interface FieldEvidence {
  source:
    | "VISIBLE"
    | "JSON_LD"
    | "SECTION"
    | "LISTING"
    | "PAGE";

  raw: string;
}


export interface ResolvedField<T> {
  value: T;
  evidence: FieldEvidence[];
  conflict: boolean;
}


export interface ResolvedPrice {
  amount: number | null;
  contact: boolean;
  evidence: FieldEvidence[];
  conflict: boolean;
}


export interface ResolvedProductFields {
  specs:
    ResolvedField<string>;

  rentalPrice:
    ResolvedPrice;

  salePrice:
    ResolvedPrice;

  rentalConditions:
    ResolvedField<string>;

  accessories:
    ResolvedField<string>;

  combo:
    ResolvedField<string>;

  rating:
    ResolvedField<number | null>;

  reviewCount:
    ResolvedField<number | null>;

  stock:
    ResolvedField<string>;
}


interface PriceCandidate {
  amount: number;
  raw: string;
  source:
    | "VISIBLE"
    | "JSON_LD"
    | "LISTING";

  kind:
    | "RENTAL"
    | "SALE"
    | "UNKNOWN";
}


function clean(
  value: unknown
): string {

  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function uniqueBy<T>(
  values: T[],
  key:
    (value: T) => string
): T[] {

  const output:
    T[] = [];

  const seen =
    new Set<string>();

  for (
    const value
    of values
  ) {

    const id =
      key(value);

    if (
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);
    output.push(value);
  }

  return output;
}


function typesOf(
  object:
    Record<string, unknown>
): string[] {

  const raw =
    object["@type"];

  if (
    Array.isArray(raw)
  ) {
    return raw.map(clean);
  }

  const value =
    clean(raw);

  return value
    ? [value]
    : [];
}


function walkObjects(
  roots:
    unknown[]
): Array<Record<string, unknown>> {

  const output:
    Array<Record<string, unknown>> =
      [];

  const seen =
    new Set<unknown>();

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
      seen.has(value)
    ) {
      return;
    }

    seen.add(value);

    if (
      Array.isArray(value)
    ) {

      for (
        const child
        of value
      ) {
        walk(child);
      }

      return;
    }

    const object =
      value as Record<
        string,
        unknown
      >;

    output.push(
      object
    );

    for (
      const child
      of Object.values(
        object
      )
    ) {
      walk(child);
    }
  };

  for (
    const root
    of roots
  ) {
    walk(root);
  }

  return output;
}


function objectsByType(
  roots:
    unknown[],
  pattern:
    RegExp
): Array<Record<string, unknown>> {

  return walkObjects(
    roots
  ).filter(
    object =>
      typesOf(object)
        .some(
          type => {

            pattern.lastIndex = 0;

            return pattern.test(
              type
            );
          }
        )
  );
}


function inferBusinessKind(
  value:
    unknown
):
  | "RENTAL"
  | "SALE"
  | "UNKNOWN" {

  const text =
    clean(
      typeof value === "object" &&
      value !== null
        ? JSON.stringify(value)
        : value
    ).toLowerCase();

  if (
    /leaseout|lease|rental|rent/
      .test(text)
  ) {
    return "RENTAL";
  }

  if (
    /(?:#|\/|\b)sell\b/
      .test(text)
  ) {
    return "SALE";
  }

  return "UNKNOWN";
}


function visibleCandidates(
  facts:
    RawProductFacts,
  kind:
    "RENTAL" |
    "SALE"
): PriceCandidate[] {

  const output:
    PriceCandidate[] = [];

  for (
    const raw
    of facts.visiblePriceTexts
  ) {

    const amount =
      kind === "RENTAL"
        ? parseRentalPrice(
            raw
          )
        : parseSalePrice(
            raw
          );

    if (
      amount === null
    ) {
      continue;
    }

    output.push({
      amount,
      raw,
      source:
        "VISIBLE",
      kind
    });
  }

  return uniqueBy(
    output,
    item =>
      `${item.amount}|${item.raw}`
  );
}


function structuredCandidates(
  facts:
    RawProductFacts
): PriceCandidate[] {

  const output:
    PriceCandidate[] = [];

  const offers =
    objectsByType(
      facts.jsonLd,
      /offer/i
    );

  for (
    const offer
    of offers
  ) {

    const businessKind =
      inferBusinessKind(
        offer.businessFunction
      );

    const rawValues = [
      offer.price,
      offer.lowPrice
    ];

    for (
      const rawValue
      of rawValues
    ) {

      const amount =
        parseStructuredPrice(
          rawValue
        );

      if (
        amount === null
      ) {
        continue;
      }

      output.push({
        amount,
        raw:
          clean(
            rawValue
          ),

        source:
          "JSON_LD",

        kind:
          businessKind
      });
    }
  }

  return uniqueBy(
    output,
    item =>
      `${item.amount}|${item.raw}|${item.kind}`
  );
}


function listingCandidate(
  facts:
    RawProductFacts,
  kind:
    "RENTAL" |
    "SALE"
): PriceCandidate | null {

  const raw =
    facts.listingPriceText;

  if (!raw) {
    return null;
  }

  const amount =
    kind === "RENTAL"
      ? parseRentalPrice(raw)
      : parseSalePrice(raw);

  if (
    amount === null
  ) {
    return null;
  }

  return {
    amount,
    raw,
    source:
      "LISTING",
    kind
  };
}


function structuredComparableForKind(
  candidates:
    PriceCandidate[],
  kind:
    "RENTAL" |
    "SALE",
  analysis:
    ProductAnalysis,
  visible:
    PriceCandidate[]
): PriceCandidate[] {

  const explicit =
    candidates.filter(
      candidate =>
        candidate.kind ===
        kind
    );

  const unknown =
    candidates.filter(
      candidate =>
        candidate.kind ===
        "UNKNOWN"
    );

  if (
    explicit.length >
    0
  ) {
    return [
      ...explicit,
      ...unknown
    ];
  }

  /*
   * Unknown structured Offer price can be used
   * for this transaction only when context makes
   * the mapping unambiguous enough:
   *
   * - this kind is proven and the opposite one is not, OR
   * - we already have an explicit visible price for this kind.
   */
  const kindProven =
    kind === "RENTAL"
      ? analysis.offer.rental
      : analysis.offer.sale;

  const oppositeProven =
    kind === "RENTAL"
      ? analysis.offer.sale
      : analysis.offer.rental;

  if (
    (
      kindProven &&
      !oppositeProven
    ) ||
    visible.length >
      0
  ) {
    return unknown;
  }

  return [];
}


function detectContactPrice(
  facts:
    RawProductFacts
): boolean {

  const text = [
    ...facts.visiblePriceTexts,
    ...facts.buttons
  ].join(" ");

  return /\b(?:lien he|liên hệ|contact|call for price)(?![\p{L}\p{N}_])/iu
    .test(text);
}


function resolvePrice(
  facts:
    RawProductFacts,
  analysis:
    ProductAnalysis,
  kind:
    "RENTAL" |
    "SALE"
): ResolvedPrice {

  const visible =
    visibleCandidates(
      facts,
      kind
    );

  const structured =
    structuredComparableForKind(
      structuredCandidates(
        facts
      ),
      kind,
      analysis,
      visible
    );

  const listing =
    listingCandidate(
      facts,
      kind
    );

  const allComparable =
    [
      ...visible,
      ...structured,
      ...(
        listing
          ? [listing]
          : []
      )
    ];

  /*
   * Final value priority:
   * visible detail > structured Offer > listing.
   */
  const selected =
    visible[0] ??
    structured[0] ??
    listing ??
    null;

  /*
   * Evidence is deliberately ALL comparable sources,
   * not only the source chosen for the final value.
   * This gives both traceability and conflict audit.
   */
  const evidence:
    FieldEvidence[] =
      uniqueBy(
        allComparable.map(
          candidate => ({
            source:
              candidate.source,

            raw:
              candidate.raw
          })
        ),
        item =>
          `${item.source}|${item.raw}`
      );

  const amounts =
    Array.from(
      new Set(
        allComparable.map(
          candidate =>
            candidate.amount
        )
      )
    );

  return {
    amount:
      selected?.amount ??
      null,

    contact:
      detectContactPrice(
        facts
      ),

    evidence,

    conflict:
      amounts.length >
        1
  };
}


function sectionField(
  facts:
    RawProductFacts,
  key:
    Parameters<
      typeof getSectionContent
    >[1]
): ResolvedField<string> {

  const value =
    getSectionContent(
      facts.sections,
      key
    );

  return {
    value,

    evidence:
      value
        ? [{
            source:
              "SECTION",

            raw:
              value
          }]
        : [],

    conflict:
      false
  };
}


function parseReviewCount(
  value:
    string
): number | null {

  const match =
    value.match(
      /\b(\d[\d.,\s]*)\s*(?:(?:luot|lượt)\s+)?(?:danh gia|đánh giá|reviews?|ratings?)(?![\p{L}\p{N}_])/iu
    );

  if (!match) {
    return null;
  }

  const parsed =
    Number(
      match[1]
        .replace(
          /[.,\s]/g,
          ""
        )
    );

  return Number.isFinite(
    parsed
  )
    ? parsed
    : null;
}


function resolveRating(
  facts:
    RawProductFacts
): {
  rating:
    ResolvedField<
      number | null
    >;

  reviewCount:
    ResolvedField<
      number | null
    >;
} {

  const ratingCandidates:
    Array<{
      value: number;
      evidence: FieldEvidence;
    }> = [];

  const reviewCandidates:
    Array<{
      value: number;
      evidence: FieldEvidence;
    }> = [];


  const products =
    objectsByType(
      facts.jsonLd,
      /product/i
    );


  for (
    const product
    of products
  ) {

    const rawAggregate =
      product.aggregateRating;

    if (
      !rawAggregate ||
      typeof rawAggregate !==
        "object"
    ) {
      continue;
    }

    const aggregate =
      rawAggregate as Record<
        string,
        unknown
      >;


    const ratingValue =
      Number(
        aggregate.ratingValue
      );

    if (
      Number.isFinite(
        ratingValue
      ) &&
      ratingValue >= 0 &&
      ratingValue <= 5
    ) {

      ratingCandidates.push({
        value:
          ratingValue,

        evidence: {
          source:
            "JSON_LD",

          raw:
            clean(
              aggregate.ratingValue
            )
        }
      });
    }


    const countValue =
      Number(
        aggregate.reviewCount ??
        aggregate.ratingCount
      );

    if (
      Number.isFinite(
        countValue
      ) &&
      countValue >= 0
    ) {

      reviewCandidates.push({
        value:
          countValue,

        evidence: {
          source:
            "JSON_LD",

          raw:
            clean(
              aggregate.reviewCount ??
              aggregate.ratingCount
            )
        }
      });
    }
  }


  for (
    const raw
    of facts.ratingTexts
  ) {

    const ratingMatch =
      raw.match(
        /\b([0-5](?:[.,]\d+)?)\s*\/\s*5\b/
      );

    if (
      ratingMatch
    ) {

      const value =
        Number(
          ratingMatch[1]
            .replace(
              ",",
              "."
            )
        );

      if (
        Number.isFinite(
          value
        ) &&
        value >= 0 &&
        value <= 5
      ) {

        ratingCandidates.push({
          value,

          evidence: {
            source:
              "VISIBLE",

            raw
          }
        });
      }
    }


    const reviewCount =
      parseReviewCount(
        raw
      );

    if (
      reviewCount !==
      null
    ) {

      reviewCandidates.push({
        value:
          reviewCount,

        evidence: {
          source:
            "VISIBLE",

          raw
        }
      });
    }
  }


  const ratingValues =
    Array.from(
      new Set(
        ratingCandidates.map(
          candidate =>
            candidate.value
        )
      )
    );

  const reviewValues =
    Array.from(
      new Set(
        reviewCandidates.map(
          candidate =>
            candidate.value
        )
      )
    );


  return {
    rating: {
      value:
        ratingCandidates[0]?.value ??
        null,

      evidence:
        uniqueBy(
          ratingCandidates.map(
            candidate =>
              candidate.evidence
          ),
          item =>
            `${item.source}|${item.raw}`
        ),

      conflict:
        ratingValues.length >
          1
    },

    reviewCount: {
      value:
        reviewCandidates[0]?.value ??
        null,

      evidence:
        uniqueBy(
          reviewCandidates.map(
            candidate =>
              candidate.evidence
          ),
          item =>
            `${item.source}|${item.raw}`
        ),

      conflict:
        reviewValues.length >
          1
    }
  };
}


function resolveStock(
  facts:
    RawProductFacts
): ResolvedField<string> {

  const evidence:
    FieldEvidence[] = [];

  let structuredValue =
    "";

  for (
    const offer
    of objectsByType(
      facts.jsonLd,
      /offer/i
    )
  ) {

    const raw =
      clean(
        offer.availability
      );

    if (!raw) {
      continue;
    }

    evidence.push({
      source:
        "JSON_LD",

      raw
    });

    if (
      /outofstock/i.test(
        raw
      )
    ) {
      structuredValue =
        "OUT_OF_STOCK";
      break;
    }

    if (
      /instock/i.test(
        raw
      )
    ) {
      structuredValue =
        "IN_STOCK";
    }

    if (
      /preorder/i.test(
        raw
      )
    ) {
      structuredValue =
        "PREORDER";
    }
  }


  let visibleValue =
    "";

  for (
    const raw
    of facts.stockTexts
  ) {

    evidence.push({
      source:
        "VISIBLE",

      raw
    });

    if (
      /\b(?:het hang|hết hàng|out of stock)(?![\p{L}\p{N}_])/iu
        .test(raw)
    ) {
      visibleValue =
        "OUT_OF_STOCK";
      break;
    }

    if (
      /\b(?:con hang|còn hàng|in stock)(?![\p{L}\p{N}_])/iu
        .test(raw)
    ) {
      visibleValue =
        "IN_STOCK";
    }
  }


  const values =
    Array.from(
      new Set(
        [
          structuredValue,
          visibleValue
        ].filter(Boolean)
      )
    );


  return {
    value:
      structuredValue ||
      visibleValue,

    evidence:
      uniqueBy(
        evidence,
        item =>
          `${item.source}|${item.raw}`
      ),

    conflict:
      values.length >
        1
  };
}


export function resolveProductFields(
  facts:
    RawProductFacts,
  analysis:
    ProductAnalysis
): ResolvedProductFields {

  const rating =
    resolveRating(
      facts
    );


  const rentalConditions =
    getSectionEvidenceText(
      facts.sections,
      [
        "RENTAL_CONDITIONS",
        "RENTAL_TIME",
        "DOCUMENTS",
        "DELIVERY",
        "PAYMENT"
      ]
    );


  return {
    specs:
      sectionField(
        facts,
        "SPECS"
      ),

    rentalPrice:
      resolvePrice(
        facts,
        analysis,
        "RENTAL"
      ),

    salePrice:
      resolvePrice(
        facts,
        analysis,
        "SALE"
      ),

    rentalConditions: {
      value:
        rentalConditions,

      evidence:
        rentalConditions
          ? [{
              source:
                "SECTION",

              raw:
                rentalConditions
            }]
          : [],

      conflict:
        false
    },

    accessories:
      sectionField(
        facts,
        "ACCESSORIES"
      ),

    combo:
      sectionField(
        facts,
        "COMBO"
      ),

    rating:
      rating.rating,

    reviewCount:
      rating.reviewCount,

    stock:
      resolveStock(
        facts
      )
  };
}
