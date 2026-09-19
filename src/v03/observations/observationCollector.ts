import {
  load
} from "cheerio";

import {
  preserveUniqueObservations
} from "../contracts/observationContract.js";

import type {
  ObservationContextKind,
  ObservationOwnership,
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
    string,
  metadata?:
    {
      readonly semanticRole?:
        ObservationSemanticRole |
        null;

      readonly ownership?:
        ObservationOwnership |
        null;

      readonly contextKind?:
        ObservationContextKind |
        null;
    }
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
      null,
    semanticRole:
      metadata?.semanticRole ??
      null,
    ownership:
      metadata?.ownership ??
      null,
    contextKind:
      metadata?.contextKind ??
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
): ObservationSemanticRole |
  null {

  const raw =
    normalizedSemanticText(
      observation.rawValue
    );


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
    /(?:gia\s*cu|gia\s*niem\s*yet|gia\s*goc|list\s*price|old[-_\s]*price|regular[-_\s]*price|was\s*:)/iu
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
    /(?:^|\s)[+\-]\s*\d[\d.,\s]*(?:d|₫|vnd)(?:\s|$)/iu
      .test(
        raw
      )
  ) {
    return "VARIANT_DELTA";
  }


  if (
    /(?:lowprice|highprice|variant[-_\s]*price|full[-_\s]*variant[-_\s]*price)/iu
      .test(
        text
      )
  ) {
    return "VARIANT_PRICE";
  }


  if (
    /Product\.offers\[\d+\]\.price$/u
      .test(
        observation.locator ??
        ""
      ) ||
    /(?:current[-_\s]*price|sale[-_\s]*price|selling[-_\s]*price|special[-_\s]*price|final[-_\s]*price|our[-_\s]*price|product[-_\s]*price|class(?:es)?[=:][^|]*(?:^|\s)price(?:\s|$))/iu
      .test(
        text
      )
  ) {
    return "CURRENT_PRODUCT_PRICE";
  }


  return null;
}


function priceContextKind(function priceContextKind(
  role:
    ObservationSemanticRole |
    null
): ObservationContextKind |
  null {

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


  if (
    role ===
      "CURRENT_PRODUCT_PRICE" ||
    role ===
      "VARIANT_PRICE" ||
    role ===
      "VARIANT_DELTA"
  ) {
    return "SALE";
  }


  return null;
}


function inferredOwnership(
  observation:
    ProductObservation
): ObservationOwnership {

  const locator =
    observation.locator ??
    "";


  if (
    observation.sourceKind ===
      "JSON_LD" &&
    locator.startsWith(
      "Product."
    )
  ) {
    return "PRIMARY_PRODUCT";
  }


  if (
    /^(?:visible-price|variant-price|condition-select|condition-radio|spec-table|spec-dl|visible-rating|visible-review-count|visible-availability)\[/u
      .test(
        locator
      )
  ) {
    return "PRIMARY_PRODUCT";
  }


  if (
    observation.context?.includes(
      "Primary-product scoped"
    )
  ) {
    return "PRIMARY_PRODUCT";
  }


  return "UNKNOWN";
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


      if (
        observation.semanticRole ===
          undefined ||
        observation.semanticRole ===
          null
      ) {
        observation.semanticRole =
          role;
      }


      if (
        observation.ownership ===
          undefined ||
        observation.ownership ===
          null
      ) {
        observation.ownership =
          role ===
            "GIFT_VALUE" ||
          role ===
            "ACCESSORY_PRICE"
            ? "RELATED"
            : inferredOwnership(
                observation
              );
      }


      if (
        observation.contextKind ===
          undefined ||
        observation.contextKind ===
          null
      ) {
        observation.contextKind =
          priceContextKind(
            role
          );
      }


      continue;
    }


    if (
      observation.field ===
        "AVAILABILITY" ||
      observation.field ===
        "INVENTORY_LEVEL"
    ) {
      observation.ownership ??=
        inferredOwnership(
          observation
        );

      observation.contextKind ??=
        "AVAILABILITY";

      continue;
    }


    if (
      observation.field ===
        "SPECS"
    ) {
      observation.ownership ??=
        inferredOwnership(
          observation
        );

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
        inferredOwnership(
          observation
        );

      observation.contextKind ??=
        "REVIEW";

      continue;
    }


    if (
      observation.field ===
        "CONDITION"
    ) {
      observation.ownership ??=
        inferredOwnership(
          observation
        );
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

  const primaryHeading =
    $("h1").first();


  let scope =
    primaryHeading.parent();


  let boundedScopeFound =
    false;


  if (
    primaryHeading.length >
      0
  ) {

    let cursor =
      primaryHeading.parent();


    for (
      let depth =
        0;
      depth <
        6 &&
      cursor.length >
        0;
      depth++
    ) {

      if (
        cursor.is(
          "body,html"
        )
      ) {
        break;
      }


      if (
        cursor.find(
          [
            "button",
            "a.btn",
            "a.button",
            'input[type="submit"]',
            'input[type="button"]',
            'a[class*="btn"]',
            '[role="button"]'
          ].join(
            ","
          )
        ).length >
          0
      ) {
        scope =
          cursor;

        boundedScopeFound =
          true;

        break;
      }


      cursor =
        cursor.parent();
    }
  }


  if (
    !boundedScopeFound
  ) {
    scope =
      $("main").first().length >
        0
        ? $("main").first()
        : $("body").first();
  }


  const isForeignRelatedNode =
    (
      element:
        Parameters<
          Parameters<
            typeof scope.find
          >[0]
        >[0]
    ): boolean => {

      const node =
        $(element as never);


      const foreignOwner =
        node.closest(
          [
            "article",
            ".product-item",
            ".product-card",
            '[class*="product-item"]',
            '[class*="product-card"]',
            '[class*="related"]',
            '[class*="recommend"]',
            '[class*="similar"]',
            '[class*="upsell"]',
            '[class*="cross-sell"]'
          ].join(
            ","
          )
        );


      if (
        foreignOwner.length ===
          0
      ) {
        return false;
      }


      const primaryHeadingNode =
        primaryHeading.get(
          0
        );


      if (
        !primaryHeadingNode
      ) {
        return true;
      }


      return !foreignOwner
        .find(
          "h1"
        )
        .toArray()
        .some(
          node =>
            node ===
              primaryHeadingNode
        );
    };


  const priceSelector =
    [
      '[itemprop="price"]',
      '[data-price]',
      ".price",
      ".product-price",
      ".sale-price",
      ".current-price",
      '[class*="price"]'
    ].join(
      ","
    );


  scope.find(
    priceSelector
  )
    .each(
      (
        index,
        element
      ) => {

        if (
          isForeignRelatedNode(
            element
          )
        ) {
          return;
        }


        const node =
          $(element);


        const raw =
          clean(
            node.text() ||
            node.attr(
              "content"
            ) ||
            node.attr(
              "data-price"
            )
          );


        if (
          !raw ||
          raw.length >
            160 ||
          !/\d/iu.test(
            raw
          )
        ) {
          return;
        }


        const context =
          [
            "class=" +
              clean(
                node.attr(
                  "class"
                )
              ),
            "id=" +
              clean(
                node.attr(
                  "id"
                )
              ),
            "parentClass=" +
              clean(
                node.parent().attr(
                  "class"
                )
              )
          ].join(
            " | "
          );


        const candidate:
          ProductObservation = {
            productIdentity,
            field:
              "PRICE",
            rawValue:
              raw,
            sourceKind:
              "VISIBLE_TEXT",
            sourceUrl,
            locator:
              "visible-price[" +
              index +
              "]",
            context,
            ownership:
              "PRIMARY_PRODUCT"
          };


        let role =
          priceSemanticRole(
            candidate
          );


        if (
          !role &&
          (
            node.is(
              '[itemprop="price"],[data-price],.price,.product-price,.sale-price,.current-price'
            )
          )
        ) {
          role =
            "CURRENT_PRODUCT_PRICE";
        }


        pushObservation(
          output,
          productIdentity,
          "PRICE",
          raw,
          "VISIBLE_TEXT",
          sourceUrl,
          "visible-price[" +
          index +
          "]",
          context,
          {
            semanticRole:
              role,
            ownership:
              "PRIMARY_PRODUCT",
            contextKind:
              priceContextKind(
                role
              )
          }
        );
      }
    );


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

        if (
          isForeignRelatedNode(
            element
          )
        ) {
          return;
        }


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


              const selected =
                $(optionElement).attr(
                  "selected"
                ) !==
                  undefined;


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
                [
                  descriptor,
                  "selected=" +
                    String(
                      selected
                    )
                ]
                  .filter(
                    Boolean
                  )
                  .join(
                    " | "
                  ),
                {
                  ownership:
                    "PRIMARY_PRODUCT"
                }
              );


              if (
                /[+\-]\s*\d[\d.,\s]*(?:đ|₫|vnd)/iu
                  .test(
                    value
                  )
              ) {
                pushObservation(
                  output,
                  productIdentity,
                  "PRICE",
                  value,
                  "VISIBLE_TEXT",
                  sourceUrl,
                  "variant-price[" +
                  selectIndex +
                  "].option[" +
                  optionIndex +
                  "]",
                  descriptor,
                  {
                    semanticRole:
                      "VARIANT_DELTA",
                    ownership:
                      "PRIMARY_PRODUCT",
                    contextKind:
                      "SALE"
                  }
                );
              }
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

        if (
          isForeignRelatedNode(
            element
          )
        ) {
          return;
        }


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


        const checked =
          input.attr(
            "checked"
          ) !==
            undefined;


        pushObservation(
          output,
          productIdentity,
          "CONDITION",
          labelText,
          "VISIBLE_TEXT",
          sourceUrl,
          "condition-radio[" +
          index +
          "]",
          "checked=" +
            String(
              checked
            ),
          {
            ownership:
              "PRIMARY_PRODUCT"
          }
        );


        if (
          /[+\-]\s*\d[\d.,\s]*(?:đ|₫|vnd)/iu
            .test(
              labelText
            )
        ) {
          pushObservation(
            output,
            productIdentity,
            "PRICE",
            labelText,
            "VISIBLE_TEXT",
            sourceUrl,
            "variant-price[" +
            index +
            "]",
            "radio variant option",
            {
              semanticRole:
                "VARIANT_DELTA",
              ownership:
                "PRIMARY_PRODUCT",
              contextKind:
                "SALE"
            }
          );
        }
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

        if (
          isForeignRelatedNode(
            element
          )
        ) {
          return;
        }


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
          "]",
          "Primary-product visible specification",
          {
            ownership:
              "PRIMARY_PRODUCT",
            contextKind:
              "SPECIFICATION"
          }
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

        if (
          isForeignRelatedNode(
            element
          )
        ) {
          return;
        }


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
                "]",
                "Primary-product visible specification",
                {
                  ownership:
                    "PRIMARY_PRODUCT",
                  contextKind:
                    "SPECIFICATION"
                }
              );
            }
          );
      }
    );


  const availabilityNodes =
    scope.find(
      [
        '[itemprop="availability"]',
        '[class*="stock"]',
        '[class*="availability"]',
        '[class*="inventory"]'
      ].join(
        ","
      )
    );


  availabilityNodes.each(
    (
      index,
      element
    ) => {

      if (
        isForeignRelatedNode(
          element
        )
      ) {
        return;
      }


      const node =
        $(element);


      const raw =
        clean(
          node.text() ||
          node.attr(
            "href"
          ) ||
          node.attr(
            "content"
          )
        );


      if (
        !raw ||
        raw.length >
          160
      ) {
        return;
      }


      pushObservation(
        output,
        productIdentity,
        "AVAILABILITY",
        raw,
        "VISIBLE_TEXT",
        sourceUrl,
        "visible-availability[" +
        index +
        "]",
        "Primary-product scoped visible availability",
        {
          ownership:
            "PRIMARY_PRODUCT",
          contextKind:
            "AVAILABILITY"
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

      if (
        isForeignRelatedNode(
          element
        )
      ) {
        return;
      }


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
          "]",
          "Primary-product visible aggregate rating",
          {
            ownership:
              "PRIMARY_PRODUCT",
            contextKind:
              "REVIEW"
          }
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

      if (
        isForeignRelatedNode(
          element
        )
      ) {
        return;
      }


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
        "]",
        "Primary-product visible aggregate review count",
        {
          ownership:
            "PRIMARY_PRODUCT",
          contextKind:
            "REVIEW"
        }
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


      const businessFunctions =
        primitiveValues(
          offer.businessFunction
        );


      const rentalOffer =
        businessFunctions.some(
          value =>
            /(?:lease|rent)/iu.test(
              value
            )
        );


      for (
        const value
        of primitiveValues(
          offer.price
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
          ".price",
          "Structured primary Product offer price",
          {
            semanticRole:
              "CURRENT_PRODUCT_PRICE",
            ownership:
              "PRIMARY_PRODUCT",
            contextKind:
              rentalOffer
                ? "RENTAL"
                : "SALE"
          }
        );
      }


      for (
        const [
          key,
          rawValue
        ]
        of [
          [
            "lowPrice",
            offer.lowPrice
          ],
          [
            "highPrice",
            offer.highPrice
          ]
        ] as const
      ) {

        for (
          const value
          of primitiveValues(
            rawValue
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
            "." +
            key,
            "Structured AggregateOffer full variant price",
            {
              semanticRole:
                "VARIANT_PRICE",
              ownership:
                "PRIMARY_PRODUCT",
              contextKind:
                rentalOffer
                  ? "RENTAL"
                  : "SALE"
            }
          );
        }
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
          ".itemCondition",
          "Structured primary Product condition",
          {
            ownership:
              "PRIMARY_PRODUCT"
          }
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
          ".inventoryLevel",
          "Structured primary Product inventory",
          {
            ownership:
              "PRIMARY_PRODUCT",
            contextKind:
              "AVAILABILITY"
          }
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
          ".availability",
          "Structured primary Product availability",
          {
            ownership:
              "PRIMARY_PRODUCT",
            contextKind:
              "AVAILABILITY"
          }
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
