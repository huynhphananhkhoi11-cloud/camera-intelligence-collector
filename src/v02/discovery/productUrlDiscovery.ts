import * as cheerio from "cheerio";
import type { Page } from "playwright";

import {
  canonicalizeUrl
} from "./urlPolicy.js";

export {
  canonicalizeUrl
};

export interface ProductUrlCandidate {
  url: string;
  score: number;
  reasons: string[];
}

export interface ProductUrlDiscoveryResult {
  productUrls: string[];
  candidates: ProductUrlCandidate[];
  weakCandidates: ProductUrlCandidate[];
  paginationUrls: string[];
  totalAnchors: number;
}

function clean(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHardExcluded(url: URL): boolean {
  /* STATIC_ASSET_HARD_EXCLUSION */
  if (
    /\.(?:avif|bmp|css|eot|gif|ico|jpe?g|js|mjs|map|mp4|png|svg|ttf|webm|webp|woff2?)$/i
      .test(
        url.pathname
      )
  ) {
    return true;
  }

  return /\/(?:cart|gio-hang|checkout|login|dang-nhap|register|account|search|tim-kiem|contact|lien-he)(?:\/|$)/i
    .test(url.pathname);
}

function looksLikePagination(
  url: URL,
  anchorText: string
): boolean {

  if (
    /(?:^|[?&])(?:p|page)=\d+/i
      .test(url.search)
  ) {
    return true;
  }

  if (
    /\/page\/\d+(?:\/|$)/i
      .test(url.pathname)
  ) {
    return true;
  }

  const text =
    anchorText.toLowerCase();

  if (
    /^(?:next|prev|previous|sau|trước|truoc|›|»|‹|«)$/
      .test(text)
  ) {
    return true;
  }

  return false;
}

function looksLikeProductPath(
  pathname: string
): boolean {

  return /\/(?:equipment|product|products|san-pham|item|items)\/[^/?#]+/i
    .test(pathname);
}

function parseJsonLd(
  raw: string
): unknown[] {

  try {
    const parsed =
      JSON.parse(raw);

    return Array.isArray(parsed)
      ? parsed
      : [parsed];
  }
  catch {
    return [];
  }
}

function typeNames(
  value: unknown
): string[] {

  if (Array.isArray(value)) {
    return value.map(clean);
  }

  const text = clean(value);

  return text
    ? [text]
    : [];
}

export function discoverProductUrlsFromHtml(
  html: string,
  baseUrl: string
): ProductUrlDiscoveryResult {

  const $ =
    cheerio.load(html);

  const base =
    new URL(baseUrl);

  const candidateMap =
    new Map<
      string,
      ProductUrlCandidate
    >();

  const pagination =
    new Set<string>();

  const addCandidate = (
    rawUrl: string,
    score: number,
    reason: string
  ) => {

    const canonical =
      canonicalizeUrl(
        rawUrl,
        baseUrl
      );

    if (!canonical) {
      return;
    }

    const url =
      new URL(canonical);

    if (
      url.origin !== base.origin
    ) {
      return;
    }

    if (
      isHardExcluded(url)
    ) {
      return;
    }

    const existing =
      candidateMap.get(
        canonical
      );

    if (existing) {

      existing.score =
        Math.max(
          existing.score,
          score
        );

      if (
        !existing.reasons.includes(
          reason
        )
      ) {
        existing.reasons.push(
          reason
        );
      }

      return;
    }

    candidateMap.set(
      canonical,
      {
        url: canonical,
        score,
        reasons: [reason]
      }
    );
  };


  /*
   * ==========================================
   * 1. JSON-LD
   * ==========================================
   */

  const walkJsonLd = (
    value: unknown
  ): void => {

    if (
      value === null ||
      value === undefined
    ) {
      return;
    }

    if (
      Array.isArray(value)
    ) {
      for (const child of value) {
        walkJsonLd(child);
      }

      return;
    }

    if (
      typeof value !== "object"
    ) {
      return;
    }

    const object =
      value as Record<
        string,
        unknown
      >;

    const types =
      typeNames(
        object["@type"]
      );

    const isProduct =
      types.some(
        type =>
          /product/i.test(type)
      );

    if (isProduct) {

      const urls = [
        object.url,
        object["@id"]
      ];

      let addedProductUrl =
        false;


      for (const raw of urls) {
        if (
          typeof raw === "string"
        ) {
          addCandidate(
            raw,
            100,
            "JSON-LD Product"
          );

          addedProductUrl =
            true;
        }
      }


      if (
        !addedProductUrl
      ) {
        addCandidate(
          baseUrl,
          100,
          "JSON-LD Product current page"
        );
      }
    }

    /*
     * ItemList entries can contain either
     * direct URLs or nested item objects.
     */
    if (
      types.some(
        type =>
          /itemlist/i.test(type)
      )
    ) {

      const entries =
        object.itemListElement;

      if (
        Array.isArray(entries)
      ) {

        for (const entry of entries) {

          if (
            entry &&
            typeof entry ===
              "object"
          ) {

            const item =
              entry as Record<
                string,
                unknown
              >;

            const directUrl =
              item.url;

            if (
              typeof directUrl ===
                "string"
            ) {
              addCandidate(
                directUrl,
                90,
                "JSON-LD ItemList"
              );
            }

            if (
              item.item &&
              typeof item.item ===
                "object"
            ) {

              const nested =
                item.item as Record<
                  string,
                  unknown
                >;

              const nestedUrl =
                nested.url ??
                nested["@id"];

              if (
                typeof nestedUrl ===
                  "string"
              ) {
                addCandidate(
                  nestedUrl,
                  90,
                  "JSON-LD ItemList item"
                );
              }
            }
          }
        }
      }
    }

    for (
      const child
      of Object.values(object)
    ) {
      walkJsonLd(child);
    }
  };

  $(
    'script[type="application/ld+json"]'
  ).each(
    (_, element) => {

      const raw =
        $(element).html() ??
        "";

      for (
        const root
        of parseJsonLd(raw)
      ) {
        walkJsonLd(root);
      }
    }
  );


  /*
   * ==========================================
   * 1.5 Current page as a product-detail candidate
   * ==========================================
   *
   * Some stores use root-level product slugs and omit url/@id
   * from Product JSON-LD.  A user may also start directly on a
   * product detail page.  Discovery must retain that page instead
   * of replacing it with category/navigation links.
   *
   * This is deliberately domain-neutral.  It requires a purchase
   * or rental CTA, a price, a title, and at least two independent
   * detail-page signals.
   */
  const pageScope =
    $(
      [
        "main",
        '[role="main"]',
        "#main",
        "#MainContent",
        ".main-content"
      ].join(",")
    ).first();


  const detailScope =
    pageScope.length
      ? pageScope
      : $("body");


  const detailText =
    clean(
      detailScope.text()
    ).slice(
      0,
      30000
    );


  const detailHeading =
    clean(
      detailScope
        .find("h1")
        .first()
        .text()
    );


  const hasDetailPrice =
    /\d[\d.,\s]*\s*(?:Ä‘|â‚«|vnd)(?![\p{L}\p{N}_])/iu
      .test(
        detailText
      );


  const hasTransactionCta =
    /\b(?:mua ngay|thÃªm vÃ o giá»(?: hÃ ng)?|them vao gio(?: hang)?|buy now|add to cart|thuÃª ngay|thue ngay|Ä‘áº·t thuÃª|dat thue|rent now|book now)\b/iu
      .test(
        detailText
      );


  const detailSignals =
    [
      /(?:tÃ¬nh tráº¡ng|tinh trang|availability|in stock|cÃ²n hÃ ng|con hang)/iu,
      /(?:báº£o hÃ nh|bao hanh|warranty|Ä‘iá»u kiá»‡n thuÃª|dieu kien thue|rental terms?)/iu,
      /(?:sá»‘ lÆ°á»£ng|so luong|quantity|sku|mÃ£ sáº£n pháº©m|ma san pham|product code)/iu,
      /(?:phá»¥ kiá»‡n|phu kien|accessories|included)/iu,
      /(?:thÃ´ng sá»‘|thong so|specifications?|technical specifications?)/iu
    ].filter(
      pattern =>
        pattern.test(
          detailText
        )
    ).length;


  const currentPageIsStrongProductDetail =
    Boolean(
      detailHeading &&
      hasDetailPrice &&
      hasTransactionCta &&
      detailSignals >=
        2
    );


  if (
    currentPageIsStrongProductDetail
  ) {

    addCandidate(
      baseUrl,
      120,
      "current-page product detail"
    );
  }


  /*
   * ==========================================
   * 2. DOM anchors
   * ==========================================
   *
   * IMPORTANT:
   * No CAMERA keyword filtering here.
   *
   * Lens, battery, printer, camera...
   * all product detail URLs are discovered.
   * Classification happens AFTER detail crawl.
   */

  const anchors =
    $("a[href]");

  anchors.each(
    (_, element) => {

      const anchor =
        $(element);

      const href =
        clean(
          anchor.attr("href")
        );

      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:")
      ) {
        return;
      }

      const canonical =
        canonicalizeUrl(
          href,
          baseUrl
        );

      if (!canonical) {
        return;
      }

      const url =
        new URL(canonical);

      if (
        url.origin !==
        base.origin
      ) {
        return;
      }

      if (
        isHardExcluded(url)
      ) {
        return;
      }

      const anchorText =
        clean(anchor.text());

      if (
        looksLikePagination(
          url,
          anchorText
        )
      ) {

        /*
         * Pagination discovered on a strong product-detail page
         * belongs to detail-page subcontent (for example related
         * products), not to the catalog traversal frontier.
         *
         * Following it can re-crawl the same primary product under
         * query variants such as ?p=2 and duplicate the exported row.
         * Catalog pages still expose pagination normally because they
         * do not satisfy the strong current-page detail contract.
         */
        if (
          !currentPageIsStrongProductDetail
        ) {
          pagination.add(
            canonical
          );
        }

        return;
      }


      /*
       * Site chrome is navigation, not product evidence.
       *
       * A bare <li> or repeated menu item must never become a
       * high-confidence product candidate just because the same
       * category link appears in desktop/mobile menus.
       */
      const siteChrome =
        anchor.closest(
          [
            "nav",
            "header",
            "footer",
            '[role="navigation"]',
            ".breadcrumb",
            ".breadcrumbs",
            ".navbar",
            ".main-menu",
            ".navigation"
          ].join(",")
        );


      if (
        siteChrome.length
      ) {
        return;
      }


      let score = 0;

      const reasons:
        string[] = [];

      const card =
        anchor.closest(
          [
            "article",
            ".product",
            ".product-item",
            ".product-card",
            "[data-product-id]",
            '[itemtype*="Product"]',
            '[class*="product-item"]',
            '[class*="product-card"]'
          ].join(",")
        );

      const contextRoot =
        card.length
          ? card
          : anchor.parent();

      const contextText =
        clean(
          contextRoot.text()
        ).slice(
          0,
          1500
        );

      if (
        card.length
      ) {
        score += 35;
        reasons.push(
          "product-card structure"
        );
      }

      if (
        /\d[\d.,\s]*\s*(?:đ|₫|vnd)(?![\p{L}\p{N}_])/iu
          .test(contextText)
      ) {
        score += 30;

        reasons.push(
          "price near link"
        );
      }

      if (
        /\b(?:mua ngay|thue ngay|thuê ngay|buy now|rent now|add to cart|xem chi tiet|xem chi tiết)\b/iu
          .test(contextText)
      ) {
        score += 20;

        reasons.push(
          "commercial CTA"
        );
      }

      if (
        looksLikeProductPath(
          url.pathname
        )
      ) {
        score += 25;

        reasons.push(
          "product-like URL"
        );
      }

      const hasImage =
        anchor.find("img").length >
          0 ||
        contextRoot.find("img").length >
          0;

      if (
        hasImage
      ) {
        score += 10;

        reasons.push(
          "product image"
        );
      }

      if (
        score <= 0
      ) {
        return;
      }

      for (
        const reason
        of reasons
      ) {
        addCandidate(
          canonical,
          score ===
            Math.max(
              ...reasons.map(
                () => score
              )
            )
            ? score
            : 0,
          reason
        );

        /*
         * Score must only be added once.
         */
        score = 0;
      }
    }
  );


  const all =
    Array.from(
      candidateMap.values()
    )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  /*
   * Threshold deliberately low:
   *
   * Discovery maximizes RECALL.
   * Classification later maximizes PRECISION.
   */
  const candidates =
    all.filter(
      item =>
        item.score >= 25
    );

  const weakCandidates =
    all.filter(
      item =>
        item.score > 0 &&
        item.score < 25
    );

  return {
    productUrls:
      candidates.map(
        item =>
          item.url
      ),

    candidates,

    weakCandidates,

    paginationUrls:
      Array.from(
        pagination
      ),

    totalAnchors:
      anchors.length
  };
}


export async function discoverProductUrls(
  page: Page
): Promise<ProductUrlDiscoveryResult> {

  return discoverProductUrlsFromHtml(
    await page.content(),
    page.url()
  );
}
