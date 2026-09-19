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
  confidence: number;
}


export interface ResolvedPrice {
  amount: number | null;
  contact: boolean;
  evidence: FieldEvidence[];
  conflict: boolean;
  confidence: number;
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
    | "SECTION"
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


function normalizeMoneyContext(
  value: unknown
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
    .toLowerCase();
}


function saleVisiblePriority(
  raw:
    string
): number {
  const text =
    normalizeMoneyContext(
      raw
    );

  /*
   * These strings describe auxiliary money, not the product's
   * own sale price. Keep them available as raw page evidence,
   * but never let them win primary-price selection.
   */
  if (
    /\b(?:qua tang|gift)\b.*\b(?:tri gia|worth|value)\b/
      .test(
        text
      )
  ) {
    return -300;
  }

  if (
    /^(?:giam|tiet kiem|save|discount)\b/
      .test(
        text
      )
  ) {
    return -250;
  }

  if (
    /^\s*[+-]/
      .test(
        raw
      ) ||
    /^(?:body only|lens|ong kinh|kit)\b.*[+-]\s*\d/
      .test(
        text
      )
  ) {
    return -200;
  }


  let score =
    0;


  /*
   * Explicit sale labels are strongest. They remain ahead of
   * plain currency values such as gifts, deposits or accessories.
   */
  if (
    /\b(?:gia ban|gia hien tai|gia khuyen mai|sale price|current price)\b/
      .test(
        text
      )
  ) {
    score +=
      120;
  }


  /*
   * A current-price + list-price + discount group is a common
   * storefront representation. parseSalePrice() already returns
   * the first amount, so this semantic shape is stronger than a
   * nearby standalone currency value.
   */
  const currencyAmounts =
    raw.match(
      /\d[\d.,\s]*\s*(?:đ|₫|vnd)/giu
    ) ??
    [];


  if (
    currencyAmounts.length >=
      2 &&
    /(?:giam|tiet kiem|save|discount)/
      .test(
        text
      )
  ) {
    score +=
      80;
  }


  return score;
}


function selectPrimaryVisibleCandidate(
  candidates:
    PriceCandidate[],
  kind:
    "RENTAL" |
    "SALE"
): PriceCandidate | null {
  if (
    candidates.length ===
      0
  ) {
    return null;
  }

  if (
    kind ===
      "RENTAL"
  ) {
    return candidates[0] ??
      null;
  }


  let selected =
    candidates[0] ??
    null;

  let selectedScore =
    selected
      ? saleVisiblePriority(
          selected.raw
        )
      : Number.NEGATIVE_INFINITY;


  for (
    let index = 1;
    index <
      candidates.length;
    index++
  ) {
    const candidate =
      candidates[index];

    if (!candidate) {
      continue;
    }

    const score =
      saleVisiblePriority(
        candidate.raw
      );

    if (
      score >
        selectedScore
    ) {
      selected =
        candidate;

      selectedScore =
        score;
    }
  }


  return selected;
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


function sectionCandidates(
  facts:
    RawProductFacts,
  kind:
    "RENTAL" |
    "SALE"
): PriceCandidate[] {

  if (
    kind !==
      "RENTAL"
  ) {
    return [];
  }

  const raw =
    getSectionEvidenceText(
      facts.sections,
      [
        "OTHER",
        "RENTAL_CONDITIONS",
        "RENTAL_TIME",
        "PAYMENT",
        "DOCUMENTS",
        "DELIVERY"
      ]
    );

  const amount =
    parseRentalPrice(
      raw
    );

  if (
    amount ===
      null
  ) {
    return [];
  }

  return [{
    amount,
    raw,
    source:
      "SECTION",
    kind
  }];
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


function resolutionConfidence(
  hasEvidence: boolean,
  conflict: boolean
): number {

  if (!hasEvidence) {
    return 0;
  }

  return conflict
    ? 0.5
    : 1;
}


function emptyResolvedPrice():
  ResolvedPrice {

  return {
    amount:
      null,

    contact:
      false,

    evidence:
      [],

    conflict:
      false,

    confidence:
      0
  };
}


function emptyStringField():
  ResolvedField<string> {

  return {
    value:
      "",

    evidence:
      [],

    conflict:
      false,

    confidence:
      0
  };
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

  const section =
    sectionCandidates(
      facts,
      kind
    );


  const explicit =
    [
      ...visible,
      ...section
    ];


  const structured =
    structuredComparableForKind(
      structuredCandidates(
        facts
      ),
      kind,
      analysis,
      explicit
    );

  const listing =
    listingCandidate(
      facts,
      kind
    );

  const allComparable =
    [
      ...visible,
      ...section,
      ...structured,
      ...(
        listing
          ? [listing]
          : []
      )
    ];

  /*
   * Final value priority:
   * visible detail > bounded semantic section >
   * structured Offer > listing.
   */
  const primaryVisible =
    selectPrimaryVisibleCandidate(
      visible,
      kind
    );


  const selected =
    primaryVisible ??
    section[0] ??
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

  const contact =
    detectContactPrice(
      facts
    );

  const conflict =
    amounts.length >
      1;

  return {
    amount:
      selected?.amount ??
      null,

    contact,

    evidence,

    conflict,

    confidence:
      resolutionConfidence(
        selected !== null ||
          contact,
        conflict
      )
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

  const evidence:
    FieldEvidence[] =
      value
        ? [{
            source:
              "SECTION",

            raw:
              value
          }]
        : [];

  return {
    value,

    evidence,

    conflict:
      false,

    confidence:
      resolutionConfidence(
        evidence.length >
          0,
        false
      )
  };
}


function resolveSpecs(
  facts:
    RawProductFacts
): ResolvedField<string> {

  /*
   * Visible semantic section has first priority.
   */
  const section =
    sectionField(
      facts,
      "SPECS"
    );

  if (
    section.value
  ) {
    return section;
  }


  /*
   * Structured fallback is deliberately scoped
   * to Product.additionalProperty.
   *
   * Do not scan body/pageText for arbitrary
   * label/value pairs.
   */
  const lines:
    string[] = [];

  const evidence:
    FieldEvidence[] = [];


  for (
    const product
    of objectsByType(
      facts.jsonLd,
      /product/i
    )
  ) {
    const rawAdditional =
      product.additionalProperty;

    const properties =
      Array.isArray(
        rawAdditional
      )
        ? rawAdditional
        : (
            rawAdditional &&
            typeof rawAdditional ===
              "object"
          )
          ? [
              rawAdditional
            ]
          : [];


    for (
      const rawProperty
      of properties
    ) {
      if (
        !rawProperty ||
        typeof rawProperty !==
          "object" ||
        Array.isArray(
          rawProperty
        )
      ) {
        continue;
      }

      const property =
        rawProperty as Record<
          string,
          unknown
        >;

      const name =
        clean(
          property.name
        );

      const rawValue =
        property.value;

      if (
        !name ||
        (
          typeof rawValue !==
            "string" &&
          typeof rawValue !==
            "number" &&
          typeof rawValue !==
            "boolean"
        )
      ) {
        continue;
      }

      const value =
        clean(
          rawValue
        );

      if (!value) {
        continue;
      }

      const line =
        `${name}: ${value}`;

      lines.push(
        line
      );

      evidence.push({
        source:
          "JSON_LD",

        raw:
          JSON.stringify(
            rawProperty
          )
      });
    }
  }


  const uniqueLines =
    uniqueBy(
      lines,
      value =>
        value
    );

  const uniqueEvidence =
    uniqueBy(
      evidence,
      item =>
        `${item.source}|${item.raw}`
    );


  if (
    uniqueLines.length ===
      0
  ) {
    return emptyStringField();
  }


  return {
    value:
      uniqueLines.join(
        "\n"
      ),

    evidence:
      uniqueEvidence,

    conflict:
      false,

    confidence:
      1
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
          1,

      confidence:
        resolutionConfidence(
          ratingCandidates.length >
            0,
          ratingValues.length >
            1
        )
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
          1,

      confidence:
        resolutionConfidence(
          reviewCandidates.length >
            0,
          reviewValues.length >
            1
        )
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

    if (
      /(?:^|[^\p{L}\p{N}_])(?:pre[\s-]?order|dat truoc|\u0111\u1eb7t tr\u01b0\u1edbc)(?![\p{L}\p{N}_])/iu
        .test(raw)
    ) {
      visibleValue =
        "PREORDER";
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


  const selected =
    structuredValue ||
    visibleValue;

  const resolvedEvidence =
    uniqueBy(
      evidence,
      item =>
        `${item.source}|${item.raw}`
    );

  const conflict =
    values.length >
      1;

  return {
    value:
      selected,

    evidence:
      resolvedEvidence,

    conflict,

    confidence:
      resolutionConfidence(
        Boolean(selected) &&
          resolvedEvidence.length >
            0,
        conflict
      )
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


  /*
   * ==========================================
   * TRANSACTION-SCOPED FIELDS
   * ==========================================
   *
   * Resolver does not infer transaction type.
   *
   * Phase 7 owns RENTAL / SALE truth.
   * Phase 8 may only resolve transaction-specific
   * fields after that truth is proven.
   */
  const rentalPrice =
    analysis.offer.rental
      ? resolvePrice(
          facts,
          analysis,
          "RENTAL"
        )
      : emptyResolvedPrice();

  const salePrice =
    analysis.offer.sale
      ? resolvePrice(
          facts,
          analysis,
          "SALE"
        )
      : emptyResolvedPrice();


  const rentalConditions =
    analysis.offer.rental
      ? getSectionEvidenceText(
          facts.sections,
          [
            "RENTAL_CONDITIONS",
            "RENTAL_TIME",
            "DOCUMENTS",
            "DELIVERY",
            "PAYMENT"
          ]
        )
      : "";

  const rentalConditionField =
    rentalConditions
      ? {
          value:
            rentalConditions,

          evidence: [{
            source:
              "SECTION" as const,

            raw:
              rentalConditions
          }],

          conflict:
            false,

          confidence:
            1
        }
      : emptyStringField();


  return {
    specs:
      resolveSpecs(
        facts
      ),

    rentalPrice,

    salePrice,

    rentalConditions:
      rentalConditionField,

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
