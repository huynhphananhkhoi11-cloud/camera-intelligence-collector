import * as cheerio from "cheerio";
import type {
  Page
} from "playwright";

import {
  sectionizeHtml,
  type ProductSection
} from "./sectionizer.js";
import type {
  NetworkFact
} from "./extraction/networkFactExtractor.js";


export interface RawProductFacts {
  url: string;

  title: string;

  breadcrumbs: string[];

  listingCategory: string;

  jsonLd: unknown[];

  visiblePriceTexts: string[];

  buttons: string[];

  sections: ProductSection[];

  ratingTexts: string[];

  stockTexts: string[];

  listingPriceText: string;

  networkFacts: NetworkFact[];

  pageText: string;
}


function clean(
  value: unknown
): string {

  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function unique(
  values: string[]
): string[] {

  return Array.from(
    new Set(
      values
        .map(clean)
        .filter(Boolean)
    )
  );
}


function parseJsonLd(
  raw: string
): unknown[] {

  const text =
    raw.trim();

  if (!text) {
    return [];
  }

  try {

    const parsed =
      JSON.parse(text);

    if (
      Array.isArray(parsed)
    ) {
      return parsed;
    }

    return [parsed];

  }
  catch {

    /*
     * Invalid JSON-LD must not crash
     * the product crawl.
     */
    return [];
  }
}


function firstStructuredProductName(
  values: unknown[]
): string {

  let found =
    "";

  const seen =
    new Set<object>();

  const walk = (
    value: unknown
  ): void => {

    if (
      found ||
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

        if (found) {
          return;
        }
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
        ? rawType.map(
            item =>
              clean(
                item
              )
          )
        : [
            clean(
              rawType
            )
          ];

    const isProduct =
      types.some(
        type =>
          type.toLowerCase() ===
            "product" ||
          /(?:^|[\/#:])product$/i
            .test(
              type
            )
      );

    if (isProduct) {
      const name =
        clean(
          object.name
        );

      if (name) {
        found =
          name;

        return;
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

      if (found) {
        return;
      }
    }
  };


  for (
    const value
    of values
  ) {
    walk(
      value
    );

    if (found) {
      break;
    }
  }


  return found;
}


function extractVisiblePageText(
  html: string
): string {
  const $ =
    cheerio.load(html);

  /*
   * pageText is evidence used downstream.
   *
   * Script/style/noscript/svg text is implementation
   * content rather than user-visible product evidence.
   * JSON-LD is parsed independently before this point,
   * so removing script nodes here does not discard
   * structured data.
   */
  $(
    "script,style,noscript,svg"
  ).remove();

  const bodyText =
    clean(
      $("body").text()
    );

  if (bodyText) {
    return bodyText;
  }

  return clean(
    $.root().text()
  );
}

export function extractRawProductFactsFromHtml(
  html: string,
  url: string
): RawProductFacts {

  const $ =
    cheerio.load(html);

  /*
   * -------------------------------------------
   * TITLE
   * -------------------------------------------
   */

  const isSiteChromeHeading = (
    element:
      unknown
  ): boolean => {

    const node =
      $(
        element as never
      );

    if (
      node.closest(
        [
          "header",
          "nav",
          "footer",
          '[role="navigation"]'
        ].join(",")
      ).length >
        0
    ) {
      return true;
    }

    const signature =
      clean(
        [
          node.attr(
            "class"
          ),
          node.attr(
            "id"
          )
        ].join(
          " "
        )
      )
        .normalize(
          "NFD"
        )
        .replace(
          /[\u0300-\u036f]/g,
          ""
        )
        .toLowerCase();

    return /(?:^|[\s_-])(?:logo|site[-_ ]?title|site[-_ ]?brand|brand)(?:$|[\s_-])/
      .test(
        signature
      );
  };


  const productHeadingOwners = [
    '[itemtype*="Product"]',
    "[data-product-id]",
    ".product-detail",
    ".product-details",
    '[class*="product-detail"]',
    '[class*="product_details"]',
    "article.product",
    ".product"
  ].join(",");


  const h1Candidates =
    $("h1")
      .toArray()
      .filter(
        element =>
          clean(
            $(element).text()
          ) &&
          !isSiteChromeHeading(
            element
          )
      );


  const preferredHeadingNode =
    h1Candidates.find(
      element =>
        $(element)
          .closest(
            productHeadingOwners
          ).length >
          0
    ) ??
    h1Candidates.find(
      element =>
        $(element)
          .closest(
            [
              "main",
              '[role="main"]',
              "#main",
              "#MainContent",
              ".main-content"
            ].join(",")
          ).length >
          0
    ) ??
    h1Candidates[0] ??
    $("h1")
      .first()
      .get(0);


  const primaryHeading =
    preferredHeadingNode
      ? $(
          preferredHeadingNode
        )
      : $("h1")
          .first();


  const h1Title =
    clean(
      primaryHeading.text()
    );

  const ogTitle =
    clean(
      $('meta[property="og:title"]')
        .attr("content")
    );


  /*
   * -------------------------------------------
   * BREADCRUMBS
   * -------------------------------------------
   */

  const breadcrumbValues:
    string[] = [];

  const breadcrumbSelectors = [
    ".breadcrumb a",
    ".breadcrumbs a",
    'nav[aria-label*="breadcrumb" i] a',
    '[itemprop="itemListElement"] [itemprop="name"]'
  ];

  for (
    const selector
    of breadcrumbSelectors
  ) {

    $(
      selector
    ).each(
      (_, element) => {

        const text =
          clean(
            $(element).text()
          );

        if (text) {
          breadcrumbValues.push(
            text
          );
        }
      }
    );
  }

  const breadcrumbs =
    unique(
      breadcrumbValues
    );

  const listingCategory =
    breadcrumbs.length >= 2
      ? breadcrumbs[
          breadcrumbs.length - 2
        ]
      : "";


  /*
   * -------------------------------------------
   * JSON-LD
   * -------------------------------------------
   */

  const jsonLd:
    unknown[] = [];

  $(
    'script[type="application/ld+json"]'
  ).each(
    (_, element) => {

      const raw =
        $(element).html() ??
        "";

      jsonLd.push(
        ...parseJsonLd(raw)
      );
    }
  );


  /*
   * -------------------------------------------
   * CANONICAL PRODUCT TITLE
   * -------------------------------------------
   *
   * This is factual source normalization, not
   * product/business classification.
   *
   * Priority:
   * h1 > JSON-LD Product.name > og:title
   */
  const title =
    h1Title ||
    firstStructuredProductName(
      jsonLd
    ) ||
    ogTitle;


  /*
   * -------------------------------------------
   * PRIMARY PRODUCT SCOPE
   * -------------------------------------------
   *
   * Fallback extraction must stay local to the
   * current product. Related-product cards can
   * contain their own prices and CTAs.
   *
   * This is structural scoping only. No sale or
   * rental meaning is inferred in acquisition.
   */
  const baseActionSelector = [
    "button",
    "a.btn",
    "a.button",
    'input[type="submit"]',
    'input[type="button"]'
  ].join(",");

  const fallbackActionSelector = [
    'a[class*="btn"]',
    '[role="button"]'
  ].join(",");

  const structuralActionSelector = [
    baseActionSelector,
    fallbackActionSelector
  ].join(",");


  const normalizeActionText = (
    value: unknown
  ): string =>
    clean(
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
      .replace(
        /₫/g,
        " vnd "
      )
      .toLowerCase();


  const transactionActionPattern =
    /\b(?:mua ngay|mua hang|mua nhanh|dat mua|them vao gio(?: hang)?|thue ngay|dat thue|thue san pham(?: nay)?|lien he thue|dat lich thue|buy now|add to cart|rent now|book rental|book now)\b/i;


  const hasTransactionAction = (
    scope:
      ReturnType<
        typeof $
      >
  ): boolean =>
    scope
      .find(
        structuralActionSelector
      )
      .toArray()
      .some(
        element =>
          transactionActionPattern
            .test(
              normalizeActionText(
                $(element).text() ||
                $(element).attr(
                  "value"
                )
              )
            )
      );


  const hasBoundedPriceEvidence = (
    scope:
      ReturnType<
        typeof $
      >
  ): boolean => {

    const text =
      normalizeActionText(
        scope.text()
      ).slice(
        0,
        12_000
      );

    return (
      /\b(?:gia thue|gia ban|rental price|sale price|price)\b[^0-9]{0,80}\d[\d.,\s]*(?:d|vnd)\b/i
        .test(
          text
        ) ||
      /\d[\d.,\s]*(?:d|vnd)\s*\/\s*(?:ngay|day|24h)\b/i
        .test(
          text
        )
    );
  };


  let primaryProductScope =
    primaryHeading.parent();

  let primaryProductScopeFound =
    false;

  if (
    primaryHeading.length > 0
  ) {
    let cursor =
      primaryHeading.parent();

    for (
      let depth = 0;
      depth < 6 &&
      cursor.length > 0;
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
        hasTransactionAction(
          cursor
        ) ||
        hasBoundedPriceEvidence(
          cursor
        )
      ) {
        primaryProductScope =
          cursor;

        primaryProductScopeFound =
          true;

        break;
      }

      cursor =
        cursor.parent();
    }
  }


  /*
   * -------------------------------------------
   * PRICE EVIDENCE
   * -------------------------------------------
   *
   * Keep raw strings. Actual parsing belongs to
   * priceResolver.
   */
  const priceTexts:
    string[] = [];

  const priceSelectors = [
    '[itemprop="price"]',
    '[data-price]',
    ".price",
    ".product-price",
    ".sale-price",
    ".current-price",
    '[class*="price"]'
  ];

  for (
    const selector
    of priceSelectors
  ) {
    /*
     * Primary detail price evidence must not absorb
     * prices from recommendation cards, navigation,
     * footer content or other products on the page.
     *
     * The extractor already establishes a bounded
     * primaryProductScope from the H1 + transaction
     * action. Reuse that generic scope here.
     *
     * If no bounded product scope can be established,
     * preserve the prior page-level fallback.
     */
    (
      primaryProductScopeFound
        ? primaryProductScope.find(
            selector
          )
        : $(selector)
    ).each(
      (_, element) => {

        /*
         * Foreign product cards inside a broad primary scope
         * must never contribute price evidence to the H1 product.
         *
         * This is generic DOM ownership logic:
         * if a price lives inside a related/recommended/card-like
         * product container that does not own the page H1, it
         * belongs to another product.
         */
        const priceNode =
          $(element);


        /*
         * Semantic related-product boundary.
         *
         * Card classes are not portable across stores. A product
         * recommendation region is therefore also detected by a
         * preceding semantic heading while walking from the price
         * node toward the primary product scope.
         */
        const isRelatedHeading =
          (
            value:
              unknown
          ): boolean => {

            const normalized =
              clean(
                value
              )
                .normalize(
                  "NFD"
                )
                .replace(
                  /[̀-ͯ]/g,
                  ""
                )
                .replace(
                  /Ä‘/g,
                  "d"
                )
                .replace(
                  /Ä/g,
                  "D"
                )
                .toLowerCase();


            return /^(?:san pham cung loai|san pham lien quan|related products?|similar products?|recommended products?|you may also like)$/
              .test(
                normalized
              );
          };


        let semanticCursor =
          priceNode;

        let inRelatedRegion =
          false;


        for (
          let depth = 0;
          depth < 8 &&
          semanticCursor.length > 0;
          depth++
        ) {

          const previous =
            semanticCursor.prevAll();


          previous.each(
            (_, sibling) => {

              if (
                inRelatedRegion
              ) {
                return;
              }


              const candidate =
                $(sibling);


              const headings =
                candidate.is(
                  "h1,h2,h3,h4,h5,h6"
                )
                  ? candidate
                  : candidate.find(
                      "h1,h2,h3,h4,h5,h6"
                    );


              headings.each(
                (_, heading) => {

                  if (
                    isRelatedHeading(
                      $(heading).text()
                    )
                  ) {
                    inRelatedRegion =
                      true;
                  }
                }
              );
            }
          );


          if (
            inRelatedRegion
          ) {
            break;
          }


          if (
            primaryProductScopeFound &&
            semanticCursor.get(
              0
            ) ===
              primaryProductScope.get(
                0
              )
          ) {
            break;
          }


          semanticCursor =
            semanticCursor.parent();
        }


        if (
          inRelatedRegion
        ) {
          return;
        }


        const foreignOwner =
          priceNode.closest(
            [
              "article",
              ".product",
              ".product-item",
              ".product-card",
              '[class*="product-item"]',
              '[class*="product-card"]',
              '[class*="related"]',
              '[class*="recommend"]',
              '[class*="similar"]',
              '[class*="upsell"]',
              '[class*="cross-sell"]'
            ].join(",")
          );


        const primaryHeadingNode =
          primaryHeading.get(
            0
          );


        if (
          foreignOwner.length >
            0 &&
          primaryHeadingNode
        ) {

          const ownerHasPrimaryHeading =
            foreignOwner
              .find("h1")
              .toArray()
              .some(
                node =>
                  node ===
                    primaryHeadingNode
              );


          if (
            !ownerHasPrimaryHeading
          ) {
            return;
          }
        }


        const text =
          clean(
            $(element).text() ||
            $(element).attr(
              "content"
            ) ||
            $(element).attr(
              "data-price"
            )
          );

        /*
         * Huge product containers sometimes
         * have "price" in their class name.
         */
        if (
          text &&
          text.length <= 160
        ) {
          priceTexts.push(
            text
          );
        }
      }
    );
  }

  /*
   * Structural fallback for detail layouts that
   * render the primary price without a semantic
   * price class/attribute.
   *
   * Only inspect short leaf nodes inside the
   * bounded primary-product scope. If the short
   * parent groups price + unit, preserve that
   * raw parent text as one evidence candidate.
   */
  if (
    primaryProductScopeFound &&
    priceTexts.length === 0
  ) {
    const currencyLike =
      /[0-9][0-9.,\s]*\s*(?:\u0111|\u20ab|vnd)(?:\s|\/|$)/i;

    primaryProductScope
      .find("*")
      .each(
        (_, element) => {
          const node =
            $(element);

          if (
            node.children().length > 0
          ) {
            return;
          }

          const text =
            clean(
              node.text()
            );

          if (
            !text ||
            text.length > 80 ||
            !currencyLike.test(
              text
            )
          ) {
            return;
          }

          const parentText =
            clean(
              node.parent().text()
            );

          const parentCurrencyMatches =
            parentText.match(
              /[0-9][0-9.,\s]*\s*(?:\u0111|\u20ab|vnd)(?=\s|\/|$)/gi
            ) ??
            [];


          /*
           * A short parent is useful when it only combines one
           * price with its unit/label. If the parent contains
           * multiple currency amounts, keep the leaf price instead
           * so sibling list/original prices do not collapse into one
           * ambiguous evidence string.
           */
          const candidate =
            parentText &&
            parentText.length <= 160 &&
            parentCurrencyMatches.length ===
              1
              ? parentText
              : text;

          priceTexts.push(
            candidate
          );
        }
      );
  }


  /*
   * -------------------------------------------
   * CTA / BUTTONS
   * -------------------------------------------
   */
  const buttonTexts:
    string[] = [];

  $(
    baseActionSelector
  ).each(
    (_, element) => {
      const text =
        clean(
          $(element).text() ||
          $(element).attr(
            "value"
          ) ||
          $(element).attr(
            "aria-label"
          )
        );

      if (
        text &&
        text.length <= 120
      ) {
        buttonTexts.push(
          text
        );
      }
    }
  );

  /*
   * Some product CTAs are anchor elements with
   * button-like classes rather than `.btn` as an
   * exact class token. Collect those only inside
   * the primary-product scope so navigation,
   * footer and related-product actions do not
   * become product-level evidence.
   */
  if (
    primaryProductScopeFound
  ) {
    primaryProductScope
      .find(
        fallbackActionSelector
      )
      .each(
        (_, element) => {
          const text =
            clean(
              $(element).text() ||
              $(element).attr(
                "value"
              ) ||
              $(element).attr(
                "aria-label"
              )
            );

          if (
            text &&
            text.length <= 120
          ) {
            buttonTexts.push(
              text
            );
          }
        }
      );
  }

  /*
   * -------------------------------------------
   * RATING / REVIEW RAW EVIDENCE
   * -------------------------------------------
   */

  const ratingTexts:
    string[] = [];

  $(
    [
      '[itemprop="ratingValue"]',
      '[itemprop="reviewCount"]',
      '[itemprop="ratingCount"]',
      '[class*="rating"]',
      '[class*="review"]'
    ].join(",")
  ).each(
    (_, element) => {

      const text =
        clean(
          $(element).text() ||
          $(element).attr(
            "content"
          )
        );

      if (
        text &&
        text.length <= 160
      ) {
        ratingTexts.push(
          text
        );
      }
    }
  );


  /*
   * -------------------------------------------
   * STOCK RAW EVIDENCE
   * -------------------------------------------
   */

  const stockTexts:
    string[] = [];

  $(
    [
      '[itemprop="availability"]',
      '[class*="stock"]',
      '[class*="availability"]',
      '[class*="inventory"]'
    ].join(",")
  ).each(
    (_, element) => {

      const text =
        clean(
          $(element).text() ||
          $(element).attr(
            "href"
          ) ||
          $(element).attr(
            "content"
          )
        );

      if (
        text &&
        text.length <= 160
      ) {
        stockTexts.push(
          text
        );
      }
    }
  );


  /*
   * -------------------------------------------
   * PAGE TEXT
   * -------------------------------------------
   *
   * Remove scripts/styles to avoid fake evidence.
   */

  const body =
    $("body").clone();

  body
    .find(
      "script,style,noscript,svg"
    )
    .remove();

  const pageText =
    clean(
      body.text()
    );


  /*
   * -------------------------------------------
   * SECTIONIZER
   * -------------------------------------------
   */

  /*
   * Condition sections must remain product-local.
   *
   * Specs/accessories/combo may legitimately live below the hero
   * block, so they remain page-wide. CONDITION is different:
   * site chrome, footer templates and unrelated cards must not
   * contradict the current product's title/structured evidence.
   */
  const allSections =
    sectionizeHtml(
      html
    );


  const localConditionSections =
    primaryProductScopeFound
      ? sectionizeHtml(
          primaryProductScope.html() ??
            ""
        ).filter(
          section =>
            section.key ===
              "CONDITION"
        )
      : allSections.filter(
          section =>
            section.key ===
              "CONDITION"
        );


  const sections = [
    ...allSections.filter(
      section =>
        section.key !==
          "CONDITION"
    ),

    ...localConditionSections
  ];


  return {
    url,

    title,

    breadcrumbs,

    listingCategory,

    jsonLd,

    visiblePriceTexts:
      unique(priceTexts),

    buttons:
      unique(buttonTexts),

    sections,

    ratingTexts:
      unique(ratingTexts),

    stockTexts:
      unique(stockTexts),

    listingPriceText:
      "",

    networkFacts: [],

    pageText:
      extractVisiblePageText(
        html
      )
  };
}


export async function extractRawProductFacts(
  page: Page
): Promise<RawProductFacts> {

  const html =
    await page.content();

  return extractRawProductFactsFromHtml(
    html,
    page.url()
  );
}
