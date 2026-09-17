import {
  classifyEntity,
  type EntityResult
} from "./entityClassifier.js";

import {
  classifyOffers,
  type OfferInput,
  type OfferResult
} from "./offerClassifier.js";

import {
  classifyCondition,
  type ConditionResult
} from "./conditionClassifier.js";

import {
  getSectionContent,
  getSectionEvidenceText
} from "./sectionizer.js";

import type {
  RawProductFacts
} from "./rawProductExtractor.js";


export type RecordDecision =
  | "ACCEPT"
  | "REVIEW"
  | "EXCLUDE";

export type FinalForm =
  | "RENTAL"
  | "NEW"
  | "SECOND_HAND"
  | "REFURBISHED";


export interface ProductAnalysis {
  entity:
    EntityResult;

  offer:
    OfferResult;

  condition:
    ConditionResult;

  forms:
    FinalForm[];

  decision:
    RecordDecision;

  reasons:
    string[];
}


function valueToString(
  value: unknown
): string[] {

  if (
    typeof value ===
    "string"
  ) {
    return [value];
  }

  if (
    typeof value ===
    "number"
  ) {
    return [
      String(value)
    ];
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {

    const object =
      value as Record<
        string,
        unknown
      >;

    const candidateKeys = [
      "@id",
      "id",
      "url",
      "name",
      "value"
    ];

    const values:
      string[] = [];

    for (
      const key
      of candidateKeys
    ) {

      const candidate =
        object[key];

      if (
        typeof candidate ===
        "string"
      ) {
        values.push(
          candidate
        );
      }
    }

    return values;
  }

  return [];
}


function collectPropertyValues(
  input: unknown,
  property:
    string
): string[] {

  const output:
    string[] = [];

  const walk = (
    value: unknown
  ): void => {

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

    if (
      !value ||
      typeof value !==
        "object"
    ) {
      return;
    }

    const object =
      value as Record<
        string,
        unknown
      >;

    if (
      property in object
    ) {

      const propertyValue =
        object[property];

      if (
        Array.isArray(
          propertyValue
        )
      ) {

        for (
          const entry
          of propertyValue
        ) {
          output.push(
            ...valueToString(
              entry
            )
          );
        }
      }
      else {

        output.push(
          ...valueToString(
            propertyValue
          )
        );
      }
    }

    for (
      const child
      of Object.values(
        object
      )
    ) {
      walk(child);
    }
  };

  walk(input);

  return Array.from(
    new Set(
      output.filter(Boolean)
    )
  );
}


function collectCorrelatedNetworkPropertyValues(
  facts:
    RawProductFacts,
  property:
    string
): string[] {
  const output:
    string[] = [];

  for (
    const fact
    of facts.networkFacts
  ) {
    /*
     * NetworkFactExtractor intentionally keeps unrelated
     * candidates for traceability. Product Intelligence
     * must consume only product-correlated samples.
     *
     * SAMPLE_URL_MATCH and PRODUCT_ID_MATCH are strong
     * product-identity evidence. Slug-only and response-
     * URL-only candidates remain stored but are not allowed
     * to determine product truth.
     */
    const stronglyCorrelated =
      fact.correlation.reasons
        .includes(
          "SAMPLE_URL_MATCH"
        ) ||
      fact.correlation.reasons
        .includes(
          "PRODUCT_ID_MATCH"
        );

    if (
      !stronglyCorrelated ||
      !fact.sample
    ) {
      continue;
    }

    output.push(
      ...collectPropertyValues(
        fact.sample,
        property
      )
    );
  }

  return Array.from(
    new Set(
      output.filter(Boolean)
    )
  );
}


export function analyzeRawProduct(
  facts: RawProductFacts,
  siteMode:
    OfferInput["siteMode"] =
      "UNKNOWN"
): ProductAnalysis {

  /*
   * ==========================================
   * ENTITY
   * ==========================================
   *
   * Use scoped spec evidence.
   * Do NOT feed the entire page into entity
   * classification because related products
   * can contaminate evidence.
   */

  const specs =
    getSectionContent(
      facts.sections,
      "SPECS"
    );

  const entity =
    classifyEntity({
      title:
        facts.title,

      category:
        facts.listingCategory,

      specs
    });


  /*
   * ==========================================
   * OFFER
   * ==========================================
   */

  const businessFunctions =
    collectPropertyValues(
      facts.jsonLd,
      "businessFunction"
    );

  const networkBusinessFunctions =
    collectCorrelatedNetworkPropertyValues(
      facts,
      "businessFunction"
    );

  const offerSectionText =
    getSectionEvidenceText(
      facts.sections,
      [
        "RENTAL_CONDITIONS",
        "RENTAL_TIME",
        "PAYMENT",
        "DOCUMENTS",
        "DELIVERY"
      ]
    );

  const offer =
    classifyOffers({
      title:
        facts.title,

      category:
        facts.listingCategory,

      visiblePriceTexts:
        facts.visiblePriceTexts,

      buttons:
        facts.buttons,

      /*
       * Prefer scoped transaction sections.
       * Page-global text is deliberately not
       * used here.
       */
      pageText:
        offerSectionText,

      jsonLdBusinessFunctions:
        businessFunctions,

      networkBusinessFunctions,

      siteMode
    });


  /*
   * ==========================================
   * CONDITION
   * ==========================================
   *
   * Only relevant for SALE.
   */

  let condition:
    ConditionResult;

  if (
    offer.sale
  ) {

    const itemConditions =
      collectPropertyValues(
        facts.jsonLd,
        "itemCondition"
      );

    const networkItemConditions =
      collectCorrelatedNetworkPropertyValues(
        facts,
        "itemCondition"
      );

    const conditionText =
      getSectionContent(
        facts.sections,
        "CONDITION"
      );

    condition =
      classifyCondition({
        title:
          facts.title,

        category:
          facts.listingCategory,

        breadcrumbs:
          facts.breadcrumbs,

        /*
         * Important:
         * conditionClassifier calls this
         * pageText, but here we pass only
         * the scoped condition section.
         */
        pageText:
          conditionText,

        jsonLdItemConditions:
          itemConditions,

        networkItemConditions
      });

  }
  else {

    condition = {
      condition:
        "UNKNOWN",

      confidence:
        "LOW",

      newScore:
        0,

      usedScore:
        0,

      refurbishedScore:
        0,

      damagedScore:
        0,

      conflict:
        false,

      evidence:
        []
    };
  }


  /*
   * ==========================================
   * DERIVED HÌNH THỨC
   * ==========================================
   */

  const forms:
    FinalForm[] = [];

  if (
    offer.rental
  ) {
    forms.push(
      "RENTAL"
    );
  }

  if (
    offer.sale &&
    condition.condition ===
      "NEW"
  ) {
    forms.push(
      "NEW"
    );
  }

  if (
    offer.sale &&
    condition.condition ===
      "USED"
  ) {
    forms.push(
      "SECOND_HAND"
    );
  }

  if (
    offer.sale &&
    condition.condition ===
      "REFURBISHED"
  ) {
    forms.push(
      "REFURBISHED"
    );
  }


  /*
   * ==========================================
   * FINAL DECISION
   * ==========================================
   */

  const reasons:
    string[] = [];

  let decision:
    RecordDecision;


  if (
    entity.type !==
      "CAMERA" &&
    entity.type !==
      "UNCERTAIN"
  ) {

    decision =
      "EXCLUDE";

    reasons.push(
      `entity=${entity.type}`
    );

  }
  else if (
    entity.type ===
      "UNCERTAIN"
  ) {

    decision =
      "REVIEW";

    reasons.push(
      "camera entity uncertain"
    );

  }
  else if (
    !offer.rental &&
    !offer.sale
  ) {

    decision =
      "REVIEW";

    reasons.push(
      "no proven transaction offer"
    );

  }
  else if (
    offer.sale &&
    condition.condition ===
      "UNKNOWN"
  ) {

    decision =
      "REVIEW";

    reasons.push(
      condition.conflict
        ? "sale condition conflict"
        : "sale condition unknown"
    );

  }
  else if (
    offer.sale &&
    condition.condition ===
      "DAMAGED"
  ) {

    decision =
      "REVIEW";

    reasons.push(
      "damaged sale item requires review"
    );

  }
  else {

    decision =
      "ACCEPT";

    reasons.push(
      "camera and transaction evidence proven"
    );
  }


  return {
    entity,
    offer,
    condition,
    forms,
    decision,
    reasons
  };
}
