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

  const titleCandidates = [
    clean(
      $("h1").first().text()
    ),

    clean(
      $('meta[property="og:title"]')
        .attr("content")
    ),

    clean(
      $("title").first().text()
    )
  ];

  const title =
    titleCandidates.find(Boolean) ??
    "";


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
   * PRICE EVIDENCE
   * -------------------------------------------
   *
   * Keep raw strings.
   * Actual parsing belongs to priceResolver.
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

    $(selector).each(
      (_, element) => {

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
         * Reject those here.
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
   * -------------------------------------------
   * CTA / BUTTONS
   * -------------------------------------------
   */

  const buttonTexts:
    string[] = [];

  $(
    'button,a.btn,a.button,input[type="submit"],input[type="button"]'
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

  const sections =
    sectionizeHtml(
      html
    );


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
