import {
  load
} from "cheerio";

import {
  preserveUniqueObservations
} from "../contracts/observationContract.js";

import type {
  ObservationContextKind,
  ObservationSemanticRole
} from "../contracts/observationContract.js";

import {
  extractRawProductFactsFromHtml
} from "../../v02/rawProductExtractor.js";

import {
  extractDetailIdentitySignals
} from "../identity/detailIdentityExtractor.js";

import {
  createProductIdentityRecord,
  resolveProductIdentities
} from "../identity/identityClusterer.js";

import type {
  ProductIdentityRecord
} from "../identity/productIdentityTypes.js";

import type {
  ProductObservation,
  ObservationCollectionResult,
  ObservationField
} from "./observationTypes.js";


type JsonObject =
  Record<
    string,
    unknown
  >;


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


function isObject(
  value:
    unknown
): value is
  JsonObject {

  return (
    value !==
      null &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    )
  );
}


function typesOf(
  value:
    JsonObject
): string[] {

  const raw =
    value["@type"];


  if (
    Array.isArray(
      raw
    )
  ) {
    return raw
      .map(
        item =>
          clean(
            item
          )
      )
      .filter(
        Boolean
      );
  }


  const single =
    clean(
      raw
    );


  return single
    ? [
        single
      ]
    : [];
}


function isType(
  value:
    JsonObject,
  name:
    string
): boolean {

  return typesOf(
    value
  ).some(
    type =>
      type ===
        name ||
      type.endsWith(
        "/" +
        name
      )
  );
}


function walkObjects(
  roots:
    readonly unknown[]
): JsonObject[] {

  const output:
    JsonObject[] =
      [];


  const seen =
    new Set<
      unknown
    >();


  const walk =
    (
      value:
        unknown
    ): void => {

      if (
        value ===
          null ||
        value ===
          undefined ||
        typeof value !==
          "object" ||
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
        value as
          JsonObject;


      output.push(
        object
      );


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
    const root
    of roots
  ) {
    walk(
      root
    );
  }


  return output;
}


function normalizeUrl(
  value:
    string,
  baseUrl:
    string
): string |
  null {

  try {

    const url =
      new URL(
        value,
        baseUrl
      );


    if (
      url.protocol !==
        "http:" &&
      url.protocol !==
        "https:"
    ) {
      return null;
    }


    url.hash = "";


    if (
      url.pathname !==
        "/" &&
      url.pathname.endsWith(
        "/"
      )
    ) {
      url.pathname =
        url.pathname.slice(
          0,
          -1
        );
    }


    return url.toString();
  }
  catch {
    return null;
  }
}


function primaryProductObject(
  roots:
    readonly unknown[],
  identity:
    ProductIdentityRecord
): JsonObject |
  null {

  const products =
    walkObjects(
      roots
    ).filter(
      object =>
        isType(
          object,
          "Product"
        )
    );


  if (
    products.length ===
      0
  ) {
    return null;
  }


  const targets =
    new Set(
      [
        identity.signals.requestedUrl,
        identity.signals.finalUrl,
        identity.signals.canonicalUrl,
        identity.signals.structuredProductUrl
      ].filter(
        (
          value
        ): value is
          string =>
            value !==
            null
      )
    );


  const matches =
    products.filter(
      product => {

        const rawUrl =
          clean(
            product.url
          );


        const rawId =
          clean(
            product["@id"]
          );


        const candidates =
          [
            rawUrl,
            rawId
          ]
            .filter(
              Boolean
            )
            .map(
              value =>
                normalizeUrl(
                  value,
                  identity.signals.finalUrl
                )
            )
            .filter(
              (
                value
              ): value is
                string =>
                  value !==
                  null
            );


        return candidates.some(
          value =>
            targets.has(
              value
            )
        );
      }
    );


  if (
    matches.length >
      0
  ) {
    return (
      matches[0] ??
      null
    );
  }


  return products.length ===
    1
    ? (
        products[0] ??
        null
      )
    : null;
}


function pushObservation(
  output:
    ProductObservation[],
  productIdentity:
    string,
  field:
    ObservationField,
  rawValue:
    unknown,
  sourceKind:
    ProductObservation[
      "sourceKind"
    ],
  sourceUrl:
    string,
  locator:
    string,
  context?:
    string
): void {

  const cleaned =
    clean(
      rawValue
    );


  if (
    !cleaned
  ) {
    return;
  }


  output.push({
    productIdentity,
    field,
    rawValue:
      cleaned,
    sourceKind,
    sourceUrl,
    locator,
    context:
      context ??
      null
  });
}


function primitiveValues(
  value:
    unknown
): string[] {

  if (
    Array.isArray(
      value
    )
  ) {
    return value.flatMap(
      item =>
        primitiveValues(
          item
        )
    );
  }


  if (
    typeof value ===
      "string" ||
    typeof value ===
      "number" ||
    typeof value ===
      "boolean"
  ) {

    const cleaned =
      clean(
        value
      );


    return cleaned
      ? [
          cleaned
        ]
      : [];
  }


  return [];
}


function brandValues(
  value:
    unknown
): string[] {

  if (
    typeof value ===
      "string"
  ) {
    return primitiveValues(
      value
    );
  }


  if (
    isObject(
      value
    )
  ) {
    return primitiveValues(
      value.name
    );
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return value.flatMap(
      item =>
        brandValues(
          item
        )
    );
  }


  return [];
}


function inventoryLevelValues(
  value:
    unknown
): string[] {

  if (
    isObject(
      value
    )
  ) {
    return primitiveValues(
      value.value
    );
  }


  return primitiveValues(
    value
  );
}


function offerObjects(
  product:
    JsonObject
): JsonObject[] {

  const raw =
    product.offers;


  if (
    Array.isArray(
      raw
    )
  ) {
    return raw.filter(
      isObject
    );
  }


  if (
    isObject(
      raw
    )
  ) {
    return [
      raw
    ];
  }


  return [];
}


function normalizedSemanticText(
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
      /đ/giu,
      "d"
    )
    .toLowerCase();
}


function priceSemanticRole(
  observation:
    ProductObservation
): ObservationSemanticRole {

  const text =
    normalizedSemanticText(
      [
        observation.rawValue,
        observation.context,
        observation.locator
      ]
        .filter(
          Boolean
        )
        .join(
          " "
        )
    );


  if (
    /(?:qua\s*tang|tang\s*kem|gift|tri\s*gia)/iu
      .test(
        text
      )
  ) {
    return "GIFT_VALUE";
  }


  if (
    /(?:tra\s*gop|installment|\/\s*thang|moi\s*thang|per\s*month)/iu
      .test(
        text
      )
  ) {
    return "INSTALLMENT_AMOUNT";
  }


  if (
    /(?:gia\s*cu|gia\s*niem\s*yet|gia\s*goc|list\s*price|old\s*price|was\s*:)/iu
      .test(
        text
      )
  ) {
    return "OLD_PRICE";
  }


  if (
    /(?:tiet\s*kiem|saving|save\s+|giam\s*gia|discount)/iu
      .test(
        text
      )
  ) {
    return "SAVING_VALUE";
  }


  if (
    /(?:lowprice|highprice|variant|option)/iu
      .test(
        text
      )
  ) {
    return "VARIANT_PRICE";
  }


  return "CURRENT_PRODUCT_PRICE";
}


function priceContextKind(
  role:
    ObservationSemanticRole
): ObservationContextKind {

  if (
    role ===
      "GIFT_VALUE"
  ) {
    return "GIFT";
  }


  if (
    role ===
      "INSTALLMENT_AMOUNT"
  ) {
    return "INSTALLMENT";
  }


  if (
    role ===
      "OLD_PRICE" ||
    role ===
      "DISCOUNT_VALUE" ||
    role ===
      "SAVING_VALUE"
  ) {
    return "PROMOTION";
  }


  return "SALE";
}


function annotateObservationSemantics(
  observations:
    ProductObservation[]
): void {

  for (
    const observation
    of observations
  ) {

    if (
      observation.field ===
        "PRICE"
    ) {

      const role =
        priceSemanticRole(
          observation
        );


      observation.semanticRole ??=
        role;

      observation.ownership ??=
        role ===
          "GIFT_VALUE" ||
        role ===
          "ACCESSORY_PRICE"
          ? "RELATED"
          : "PRIMARY_PRODUCT";

      observation.contextKind ??=
        priceContextKind(
          role
        );

      continue;
    }


    if (
      observation.field ===
        "AVAILABILITY" ||
      observation.field ===
        "INVENTORY_LEVEL"
    ) {
      observation.ownership ??=
        "PRIMARY_PRODUCT";

      observation.contextKind ??=
        "AVAILABILITY";

      continue;
    }


    if (
      observation.field ===
        "SPECS"
    ) {
      observation.ownership ??=
        "PRIMARY_PRODUCT";

      observation.contextKind ??=
        "SPECIFICATION";

      continue;
    }


    if (
      observation.field ===
        "RATING" ||
      observation.field ===
        "REVIEW_COUNT" ||
      observation.field ===
        "RATING_REVIEW_TEXT"
    ) {
      observation.ownership ??=
        "PRIMARY_PRODUCT";

      observation.contextKind ??=
        "REVIEW";

      continue;
    }


    if (
      observation.field ===
        "CONDITION"
    ) {
      observation.ownership ??=
        "PRIMARY_PRODUCT";
    }
  }
}


function collectVisibleSemanticDetails(
  $:
    ReturnType<
      typeof load
    >,
  output:
    ProductObservation[],
  productIdentity:
    string,
  sourceUrl:
    string
): void {

  const scope =
    $("main").first().length >
      0
      ? $("main").first()
      : $("body").first();


  const isConditionText =
    (
      value:
        string
    ): boolean => {

      const normalized =
        normalizedSemanticText(
          value
        );


      return /(?:\bhang\s+(?:moi|cu)\b|\blike\s*new\b|\blikenew\b|\bused\b|\bsecond[\s-]?hand\b|\brefurbished\b|\bda\s+qua\s+su\s+dung\b|\bnew\s*100%\b)/iu
        .test(
          normalized
        );
    };


  scope.find(
    "select"
  )
    .each(
      (
        selectIndex,
        element
      ) => {

        const select =
          $(element);


        const descriptor =
          [
            select.attr(
              "name"
            ),
            select.attr(
              "id"
            ),
            select.attr(
              "class"
            ),
            select.prev(
              "label"
            ).text(),
            select.closest(
              "label"
            ).text()
          ]
            .filter(
              Boolean
            )
            .join(
              " "
            );


        select.find(
          "option"
        )
          .each(
            (
              optionIndex,
              optionElement
            ) => {

              const value =
                clean(
                  $(optionElement)
                    .text()
                );


              if (
                !value ||
                !isConditionText(
                  value
                )
              ) {
                return;
              }


              pushObservation(
                output,
                productIdentity,
                "CONDITION",
                value,
                "VISIBLE_TEXT",
                sourceUrl,
                "condition-select[" +
                selectIndex +
                "].option[" +
                optionIndex +
                "]",
                descriptor
              );
            }
          );
      }
    );


  scope.find(
    'input[type="radio"]'
  )
    .each(
      (
        index,
        element
      ) => {

        const input =
          $(element);


        const id =
          clean(
            input.attr(
              "id"
            )
          );


        const labelText =
          clean(
            [
              id
                ? scope.find(
                    'label[for="' +
                    id.replace(
                      /"/g,
                      '\\"'
                    ) +
                    '"]'
                  ).first().text()
                : "",
              input.closest(
                "label"
              ).text(),
              input.next(
                "label"
              ).text(),
              input.attr(
                "value"
              )
            ]
              .filter(
                Boolean
              )
              .join(
                " "
              )
          );


        if (
          !isConditionText(
            labelText
          )
        ) {
          return;
        }


        pushObservation(
          output,
          productIdentity,
          "CONDITION",
          labelText,
          "VISIBLE_TEXT",
          sourceUrl,
          "condition-radio[" +
          index +
          "]"
        );
      }
    );


  scope.find(
    "table tr"
  )
    .each(
      (
        index,
        element
      ) => {

        const row =
          $(element);


        const cells =
          row.find(
            "th,td"
          );


        if (
          cells.length <
            2
        ) {
          return;
        }


        const key =
          clean(
            cells.eq(
              0
            ).text()
          );


        const value =
          clean(
            cells.eq(
              1
            ).text()
          );


        if (
          !key ||
          !value ||
          key.length >
            100
        ) {
          return;
        }


        pushObservation(
          output,
          productIdentity,
          "SPECS",
          key +
          ": " +
          value,
          "VISIBLE_TEXT",
          sourceUrl,
          "spec-table[" +
          index +
          "]"
        );
      }
    );


  scope.find(
    "dl"
  )
    .each(
      (
        listIndex,
        element
      ) => {

        const list =
          $(element);


        list.find(
          "dt"
        )
          .each(
            (
              termIndex,
              termElement
            ) => {

              const term =
                $(termElement);


              const key =
                clean(
                  term.text()
                );


              const value =
                clean(
                  term.next(
                    "dd"
                  ).first().text()
                );


              if (
                !key ||
                !value ||
                key.length >
                  100
              ) {
                return;
              }


              pushObservation(
                output,
                productIdentity,
                "SPECS",
                key +
                ": " +
                value,
                "VISIBLE_TEXT",
                sourceUrl,
                "spec-dl[" +
                listIndex +
                "].term[" +
                termIndex +
                "]"
              );
            }
          );
      }
    );


  const ratingNodes =
    scope.find(
      '[itemprop="ratingValue"],[data-rating],[class*="rating"],[aria-label*="rating" i]'
    );


  ratingNodes.each(
    (
      index,
      element
    ) => {

      const node =
        $(element);


      const rawCandidates =
        [
          node.attr(
            "content"
          ),
          node.attr(
            "data-rating"
          ),
          node.attr(
            "aria-label"
          ),
          node.text()
        ]
          .map(
            clean
          )
          .filter(
            Boolean
          );


      for (
        const raw
        of rawCandidates
      ) {

        const explicit =
          raw.match(
            /(?:^|[^0-9])([0-5](?:[.,]\d+)?)\s*(?:\/\s*5|out\s+of\s+5|tren\s*5|trên\s*5|sao\b)/iu
          );


        const direct =
          !explicit &&
          /^(?:[0-5](?:[.,]\d+)?)$/u
            .test(
              raw
            )
            ? raw
            : null;


        const value =
          explicit?.[1] ??
          direct;


        if (
          !value
        ) {
          continue;
        }


        pushObservation(
          output,
          productIdentity,
          "RATING",
          value.replace(
            ",",
            "."
          ),
          "VISIBLE_TEXT",
          sourceUrl,
          "visible-rating[" +
          index +
          "]"
        );


        break;
      }
    }
  );


  const reviewNodes =
    scope.find(
      '[itemprop="reviewCount"],[class*="review-count"],[class*="review_count"],[class*="reviews"]'
    );


  reviewNodes.each(
    (
      index,
      element
    ) => {

      const node =
        $(element);


      const raw =
        clean(
          node.attr(
            "content"
          ) ??
          node.text()
        );


      const explicit =
        raw.match(
          /(\d[\d.,]*)\s*(?:danh\s*gia|đánh\s*giá|reviews?|ratings?)/iu
        );


      const direct =
        !explicit &&
        node.attr(
          "itemprop"
        ) ===
          "reviewCount" &&
        /^\d[\d.,]*$/u.test(
          raw
        )
          ? raw
          : null;


      const value =
        explicit?.[1] ??
        direct;


      if (
        !value
      ) {
        return;
      }


      const digits =
        value.replace(
          /\D/g,
          ""
        );


      if (
        !digits
      ) {
        return;
      }


      pushObservation(
        output,
        productIdentity,
        "REVIEW_COUNT",
        digits,
        "VISIBLE_TEXT",
        sourceUrl,
        "visible-review-count[" +
        index +
        "]"
      );
    }
  );
}


function collectStructuredObservations(
  output:
    ProductObservation[],
  productIdentity:
    string,
  sourceUrl:
    string,
  product:
    JsonObject
): void {

  for (
    const value
    of primitiveValues(
      product.name
    )
  ) {
    pushObservation(
      output,
      productIdentity,
      "PRODUCT_NAME",
      value,
      "JSON_LD",
      sourceUrl,
      "Product.name"
    );
  }


  for (
    const value
    of primitiveValues(
      product.sku
    )
  ) {
    pushObservation(
      output,
      productIdentity,
      "SKU",
      value,
      "JSON_LD",
      sourceUrl,
      "Product.sku"
    );
  }


  for (
    const value
    of primitiveValues(
      product.productID
    )
  ) {
    pushObservation(
      output,
      productIdentity,
      "PRODUCT_ID",
      value,
      "JSON_LD",
      sourceUrl,
      "Product.productID"
    );
  }


  for (
    const value
    of brandValues(
      product.brand
    )
  ) {
    pushObservation(
      output,
      productIdentity,
      "BRAND",
      value,
      "JSON_LD",
      sourceUrl,
      "Product.brand"
    );
  }


  for (
    const value
    of primitiveValues(
      product.description
    )
  ) {
    pushObservation(
      output,
      productIdentity,
      "DESCRIPTION",
      value,
      "JSON_LD",
      sourceUrl,
      "Product.description"
    );
  }


  for (
    const value
    of primitiveValues(
      product.category
    )
  ) {
    pushObservation(
      output,
      productIdentity,
      "CATEGORY",
      value,
      "JSON_LD",
      sourceUrl,
      "Product.category"
    );
  }


  const aggregate =
    isObject(
      product.aggregateRating
    )
      ? product.aggregateRating
      : null;


  if (
    aggregate
  ) {

    for (
      const value
      of primitiveValues(
        aggregate.ratingValue
      )
    ) {
      pushObservation(
        output,
        productIdentity,
        "RATING",
        value,
        "JSON_LD",
        sourceUrl,
        "Product.aggregateRating.ratingValue"
      );
    }


    for (
      const value
      of primitiveValues(
        aggregate.reviewCount ??
        aggregate.ratingCount
      )
    ) {
      pushObservation(
        output,
        productIdentity,
        "REVIEW_COUNT",
        value,
        "JSON_LD",
        sourceUrl,
        aggregate.reviewCount !==
          undefined
          ? "Product.aggregateRating.reviewCount"
          : "Product.aggregateRating.ratingCount"
      );
    }
  }


  const rawAdditional =
    product.additionalProperty;


  const additional =
    Array.isArray(
      rawAdditional
    )
      ? rawAdditional
      : isObject(
          rawAdditional
        )
        ? [
            rawAdditional
          ]
        : [];


  additional.forEach(
    (
      item,
      index
    ) => {

      if (
        !isObject(
          item
        )
      ) {
        return;
      }


      const name =
        clean(
          item.name
        );


      const value =
        clean(
          item.value
        );


      if (
        !name &&
        !value
      ) {
        return;
      }


      pushObservation(
        output,
        productIdentity,
        "SPECS",
        [
          name,
          value
        ]
          .filter(
            Boolean
          )
          .join(
            ": "
          ),
        "JSON_LD",
        sourceUrl,
        "Product.additionalProperty[" +
        index +
        "]"
      );
    }
  );


  offerObjects(
    product
  ).forEach(
    (
      offer,
      index
    ) => {

      const prefix =
        "Product.offers[" +
        index +
        "]";


      for (
        const value
        of primitiveValues(
          offer.price ??
          offer.lowPrice
        )
      ) {
        pushObservation(
          output,
          productIdentity,
          "PRICE",
          value,
          "JSON_LD",
          sourceUrl,
          prefix +
          (
            offer.price !==
              undefined
              ? ".price"
              : ".lowPrice"
          )
        );
      }


      for (
        const value
        of primitiveValues(
          offer.priceCurrency
        )
      ) {
        pushObservation(
          output,
          productIdentity,
          "PRICE_CURRENCY",
          value,
          "JSON_LD",
          sourceUrl,
          prefix +
          ".priceCurrency"
        );
      }


      for (
        const value
        of primitiveValues(
          offer.itemCondition
        )
      ) {
        pushObservation(
          output,
          productIdentity,
          "CONDITION",
          value,
          "JSON_LD",
          sourceUrl,
          prefix +
          ".itemCondition"
        );
      }


      for (
        const value
        of inventoryLevelValues(
          offer.inventoryLevel
        )
      ) {
        pushObservation(
          output,
          productIdentity,
          "INVENTORY_LEVEL",
          value,
          "JSON_LD",
          sourceUrl,
          prefix +
          ".inventoryLevel"
        );
      }


      for (
        const value
        of primitiveValues(
          offer.availability
        )
      ) {
        pushObservation(
          output,
          productIdentity,
          "AVAILABILITY",
          value,
          "JSON_LD",
          sourceUrl,
          prefix +
          ".availability"
        );
      }


      for (
        const value
        of primitiveValues(
          offer.url
        )
      ) {
        pushObservation(
          output,
          productIdentity,
          "OFFER_URL",
          value,
          "JSON_LD",
          sourceUrl,
          prefix +
          ".url"
        );
      }


      for (
        const value
        of primitiveValues(
          offer.businessFunction
        )
      ) {
        pushObservation(
          output,
          productIdentity,
          "BUSINESS_FUNCTION",
          value,
          "JSON_LD",
          sourceUrl,
          prefix +
          ".businessFunction"
        );
      }
    }
  );
}


const SECTION_FIELD:
  Readonly<
    Record<
      string,
      ObservationField
    >
  > = {
    SPECS:
      "SPECS",

    CONDITION:
      "CONDITION",

    RENTAL_CONDITIONS:
      "RENTAL_CONDITIONS",

    RENTAL_TIME:
      "RENTAL_TIME",

    PAYMENT:
      "PAYMENT",

    DOCUMENTS:
      "DOCUMENTS",

    DELIVERY:
      "DELIVERY",

    ACCESSORIES:
      "ACCESSORIES",

    COMBO:
      "COMBO"
  };


export function collectProductObservationsFromHtml(
  html:
    string,
  requestedUrl:
    string,
  finalUrl:
    string =
      requestedUrl
): ObservationCollectionResult {

  const identity =
    createProductIdentityRecord(
      extractDetailIdentitySignals(
        html,
        requestedUrl,
        finalUrl
      )
    );


  const resolution =
    resolveProductIdentities([
      identity
    ]);


  const identityId =
    resolution.clusters[0]
      ?.identityId;


  if (
    identityId ===
      undefined
  ) {
    throw new Error(
      "Unable to resolve product identity for observation collection."
    );
  }


  const rawFacts =
    extractRawProductFactsFromHtml(
      html,
      finalUrl
    );


  const $ =
    load(
      html
    );


  const output:
    ProductObservation[] =
      [];


  const warnings:
    string[] =
      [];


  $("h1")
    .each(
      (
        index,
        element
      ) => {

        pushObservation(
          output,
          identityId,
          "PRODUCT_NAME",
          $(element)
            .text(),
          "VISIBLE_TEXT",
          finalUrl,
          "h1[" +
          index +
          "]"
        );
      }
    );


  const ogTitle =
    $('meta[property="og:title"]')
      .attr(
        "content"
      );


  if (
    ogTitle
  ) {
    pushObservation(
      output,
      identityId,
      "PRODUCT_NAME",
      ogTitle,
      "META",
      finalUrl,
      'meta[property="og:title"]'
    );
  }


  rawFacts.breadcrumbs.forEach(
    (
      value,
      index
    ) => {

      pushObservation(
        output,
        identityId,
        "BREADCRUMB",
        value,
        "VISIBLE_TEXT",
        finalUrl,
        "breadcrumb[" +
        index +
        "]"
      );
    }
  );


  if (
    rawFacts.listingCategory
  ) {
    pushObservation(
      output,
      identityId,
      "CATEGORY",
      rawFacts.listingCategory,
      "VISIBLE_TEXT",
      finalUrl,
      "breadcrumb-derived-listing-category",
      "Nearest ancestor category in the observed breadcrumb trail"
    );
  }


  rawFacts.visiblePriceTexts.forEach(
    (
      value,
      index
    ) => {

      pushObservation(
        output,
        identityId,
        "PRICE",
        value,
        "VISIBLE_TEXT",
        finalUrl,
        "scoped-price[" +
        index +
        "]",
        "Primary-product scoped visible price"
      );
    }
  );


  rawFacts.buttons.forEach(
    (
      value,
      index
    ) => {

      pushObservation(
        output,
        identityId,
        "ACTION_TEXT",
        value,
        "VISIBLE_TEXT",
        finalUrl,
        "action[" +
        index +
        "]"
      );
    }
  );


  rawFacts.ratingTexts.forEach(
    (
      value,
      index
    ) => {

      pushObservation(
        output,
        identityId,
        "RATING_REVIEW_TEXT",
        value,
        "VISIBLE_TEXT",
        finalUrl,
        "rating-or-review[" +
        index +
        "]",
        "Raw visible rating/review text"
      );
    }
  );


  rawFacts.stockTexts.forEach(
    (
      value,
      index
    ) => {

      pushObservation(
        output,
        identityId,
        "AVAILABILITY",
        value,
        "VISIBLE_TEXT",
        finalUrl,
        "availability[" +
        index +
        "]"
      );
    }
  );


  rawFacts.sections.forEach(
    (
      section,
      index
    ) => {

      const field =
        SECTION_FIELD[
          section.key
        ];


      if (
        field ===
          undefined
      ) {
        return;
      }


      pushObservation(
        output,
        identityId,
        field,
        section.content ||
        section.heading,
        "VISIBLE_TEXT",
        finalUrl,
        "section[" +
        index +
        "]",
        section.heading
      );
    }
  );


  /*
   * If the title contains an explicit condition expression, preserve
   * the full visible title as CONDITION evidence rather than deriving
   * a normalized winner. This keeps the raw contradiction visible,
   * e.g. H1 "(NEW 100%)" versus JSON-LD UsedCondition.
   */
  $("h1")
    .each(
      (
        index,
        element
      ) => {

        const title =
          clean(
            $(element)
              .text()
          );


        if (
          /\b(?:new|used|second[\s-]?hand|refurbished|moi|mới|cu|cũ|qua su dung|qua sử dụng)\b/iu
            .test(
              title
            )
        ) {
          pushObservation(
            output,
            identityId,
            "CONDITION",
            title,
            "VISIBLE_TEXT",
            finalUrl,
            "h1[" +
            index +
            "]",
            "Condition-bearing product title"
          );
        }
      }
    );


  collectVisibleSemanticDetails(
    $,
    output,
    identityId,
    finalUrl
  );


  const structuredProduct =
    primaryProductObject(
      rawFacts.jsonLd,
      identity
    );


  if (
    structuredProduct
  ) {
    collectStructuredObservations(
      output,
      identityId,
      finalUrl,
      structuredProduct
    );
  }
  else if (
    rawFacts.jsonLd.length >
      0
  ) {
    warnings.push(
      "Structured Product observations were not collected because no unambiguous primary Product object was established."
    );
  }


  annotateObservationSemantics(
    output
  );


  return {
    identity,
    identityId,
    observations:
      preserveUniqueObservations(
        output
      ) as
        ProductObservation[],
    warnings
  };
}
