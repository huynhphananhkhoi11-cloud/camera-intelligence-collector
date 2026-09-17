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
  specs: ResolvedField<string>;

  rentalPrice: ResolvedPrice;

  salePrice: ResolvedPrice;

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


function clean(
  value: unknown
): string {

  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function uniqueNumbers(
  values: number[]
): number[] {

  return Array.from(
    new Set(
      values.filter(
        value =>
          Number.isFinite(value) &&
          value > 0
      )
    )
  );
}


function getTypes(
  object: Record<string, unknown>
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


function collectObjectsByType(
  roots: unknown[],
  typePattern: RegExp
): Array<Record<string, unknown>> {

  const output:
    Array<Record<string, unknown>> =
      [];

  const seen =
    new Set<unknown>();

  const walk = (
    value: unknown
  ): void => {

    if (
      value === null ||
      value === undefined ||
      typeof value !== "object"
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

    if (
      getTypes(object)
        .some(
          type =>
            typePattern.test(type)
        )
    ) {
      output.push(object);
    }

    for (
      const child
      of Object.values(object)
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


function collectOfferObjects(
  roots: unknown[]
): Array<Record<string, unknown>> {

  return collectObjectsByType(
    roots,
    /offer/i
  );
}


function collectProductObjects(
  roots: unknown[]
): Array<Record<string, unknown>> {

  return collectObjectsByType(
    roots,
    /product/i
  );
}


function structuredPrices(
  facts: RawProductFacts
): Array<{
  amount: number;
  raw: string;
}> {

  const output:
    Array<{
      amount: number;
      raw: string;
    }> = [];

  for (
    const offer
    of collectOfferObjects(
      facts.jsonLd
    )
  ) {

    const candidates = [
      offer.price,
      offer.lowPrice
    ];

    for (
      const value
      of candidates
    ) {

      const parsed =
        parseStructuredPrice(
          value
        );

      if (
        parsed !== null
      ) {

        output.push({
          amount: parsed,
          raw: clean(value)
        });
      }
    }
  }

  return output;
}


function detectContactPrice(
  facts: RawProductFacts
): boolean {

  const text = [
    ...facts.visiblePriceTexts,
    ...facts.buttons
  ].join(" ");

  return /\b(?:lien he|liên hệ|contact|call for price)\b/iu
    .test(text);
}


function resolvePrice(
  facts: RawProductFacts,
  analysis: ProductAnalysis,
  kind:
    | "RENTAL"
    | "SALE"
): ResolvedPrice {

  const visible:
    Array<{
      amount: number;
      raw: string;
    }> = [];

  for (
    const text
    of facts.visiblePriceTexts
  ) {

    const parsed =
      kind === "RENTAL"
        ? parseRentalPrice(text)
        : parseSalePrice(text);

    if (
      parsed !== null
    ) {

      visible.push({
        amount: parsed,
        raw: text
      });
    }
  }


  const structured =
    structuredPrices(
      facts
    );


  const listingParsed =
    kind === "RENTAL"
      ? parseRentalPrice(
          facts.listingPriceText
        )
      : parseSalePrice(
          facts.listingPriceText
        );


  const evidence:
    FieldEvidence[] = [];

  let selected:
    number | null =
      null;


  /*
   * Priority:
   * detail-visible > JSON-LD > listing
   */
  if (
    visible.length > 0
  ) {

    selected =
      visible[0].amount;

    evidence.push(
      ...visible.map(
        item => ({
          source:
            "VISIBLE" as const,

          raw:
            item.raw
        })
      )
    );

  }
  else if (
    (
      kind === "RENTAL" &&
      analysis.offer.rental
    ) ||
    (
      kind === "SALE" &&
      analysis.offer.sale
    )
  ) {

    if (
      structured.length > 0
    ) {

      selected =
        structured[0].amount;

      evidence.push(
        ...structured.map(
          item => ({
            source:
              "JSON_LD" as const,

            raw:
              item.raw
          })
        )
      );
    }
  }


  if (
    selected === null &&
    listingParsed !== null
  ) {

    selected =
      listingParsed;

    evidence.push({
      source:
        "LISTING",

      raw:
        facts.listingPriceText
    });
  }


  const comparableAmounts =
    uniqueNumbers([
      ...visible.map(
        item =>
          item.amount
      ),

      ...(
        (
          kind === "RENTAL" &&
          analysis.offer.rental
        ) ||
        (
          kind === "SALE" &&
          analysis.offer.sale
        )
          ? structured.map(
              item =>
                item.amount
            )
          : []
      ),

      ...(
        listingParsed !== null
          ? [listingParsed]
          : []
      )
    ]);


  return {
    amount:
      selected,

    contact:
      detectContactPrice(
        facts
      ),

    evidence,

    conflict:
      comparableAmounts.length >
        1
  };
}


function sectionField(
  facts: RawProductFacts,
  key: Parameters<
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
  value: string
): number | null {

  /*
   * Do not use \b after Vietnamese accented words.
   *
   * Supported examples:
   *   127 đánh giá
   *   127 danh gia
   *   127 lượt đánh giá
   *   127 luot danh gia
   *   127 reviews
   *   127 ratings
   */
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
  facts: RawProductFacts
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

  const ratingEvidence:
    FieldEvidence[] = [];

  const reviewEvidence:
    FieldEvidence[] = [];

  let rating:
    number | null =
      null;

  let reviewCount:
    number | null =
      null;


  /*
   * Prefer JSON-LD aggregateRating.
   */
  for (
    const product
    of collectProductObjects(
      facts.jsonLd
    )
  ) {

    const raw =
      product.aggregateRating;

    if (
      !raw ||
      typeof raw !== "object"
    ) {
      continue;
    }

    const aggregate =
      raw as Record<
        string,
        unknown
      >;


    if (
      rating === null
    ) {

      const value =
        Number(
          aggregate.ratingValue
        );

      if (
        Number.isFinite(value) &&
        value >= 0 &&
        value <= 5
      ) {

        rating =
          value;

        ratingEvidence.push({
          source:
            "JSON_LD",

          raw:
            clean(
              aggregate.ratingValue
            )
        });
      }
    }


    if (
      reviewCount === null
    ) {

      const value =
        Number(
          aggregate.reviewCount ??
          aggregate.ratingCount
        );

      if (
        Number.isFinite(value) &&
        value >= 0
      ) {

        reviewCount =
          value;

        reviewEvidence.push({
          source:
            "JSON_LD",

          raw:
            clean(
              aggregate.reviewCount ??
              aggregate.ratingCount
            )
        });
      }
    }
  }


  /*
   * Visible fallback.
   */
  for (
    const text
    of facts.ratingTexts
  ) {

    if (
      rating === null
    ) {

      const match =
        text.match(
          /\b([0-5](?:[.,]\d+)?)\s*\/\s*5\b/
        );

      if (match) {

        const value =
          Number(
            match[1]
              .replace(
                ",",
                "."
              )
          );

        if (
          Number.isFinite(value) &&
          value >= 0 &&
          value <= 5
        ) {

          rating =
            value;

          ratingEvidence.push({
            source:
              "VISIBLE",

            raw:
              text
          });
        }
      }
    }


    if (
      reviewCount === null
    ) {

      const value =
        parseReviewCount(
          text
        );

      if (
        value !== null
      ) {

        reviewCount =
          value;

        reviewEvidence.push({
          source:
            "VISIBLE",

          raw:
            text
        });
      }
    }
  }


  return {
    rating: {
      value:
        rating,

      evidence:
        ratingEvidence,

      conflict:
        false
    },

    reviewCount: {
      value:
        reviewCount,

      evidence:
        reviewEvidence,

      conflict:
        false
    }
  };
}


function resolveStock(
  facts: RawProductFacts
): ResolvedField<string> {

  const evidence:
    FieldEvidence[] = [];


  for (
    const offer
    of collectOfferObjects(
      facts.jsonLd
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
      /instock/i.test(raw)
    ) {
      return {
        value:
          "IN_STOCK",

        evidence,

        conflict:
          false
      };
    }

    if (
      /outofstock/i.test(raw)
    ) {
      return {
        value:
          "OUT_OF_STOCK",

        evidence,

        conflict:
          false
      };
    }

    if (
      /preorder/i.test(raw)
    ) {
      return {
        value:
          "PREORDER",

        evidence,

        conflict:
          false
      };
    }
  }


  for (
    const text
    of facts.stockTexts
  ) {

    evidence.push({
      source:
        "VISIBLE",

      raw:
        text
    });

    if (
      /\b(?:con hang|còn hàng|in stock)\b/iu
        .test(text)
    ) {

      return {
        value:
          "IN_STOCK",

        evidence,

        conflict:
          false
      };
    }

    if (
      /\b(?:het hang|hết hàng|out of stock)\b/iu
        .test(text)
    ) {

      return {
        value:
          "OUT_OF_STOCK",

        evidence,

        conflict:
          false
      };
    }
  }


  return {
    value: "",
    evidence,
    conflict: false
  };
}


export function resolveProductFields(
  facts: RawProductFacts,
  analysis: ProductAnalysis
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

