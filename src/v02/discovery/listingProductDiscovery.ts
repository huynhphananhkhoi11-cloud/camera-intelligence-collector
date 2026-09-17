import * as cheerio from "cheerio";

import type {
  ProductUrlEvidenceSource
} from "./productUrlGraph.js";


export interface DiscoveredProductLink {
  url:
    string;

  source:
    ProductUrlEvidenceSource;

  weight:
    number;

  detail:
    string | null;

  productId:
    string | null;
}


export interface ListingDiscoveryResult {
  productLinks:
    DiscoveredProductLink[];

  paginationUrls:
    string[];
}


export interface ApiCandidateLike {
  responseUrl:
    string;

  path:
    string;

  sample:
    readonly unknown[];
}


export interface NetworkSnapshotLike {
  apiCandidates:
    readonly ApiCandidateLike[];
}


function resolveUrl(
  raw:
    unknown,
  baseUrl:
    string
): string | null {

  if (
    typeof raw !==
    "string"
  ) {
    return null;
  }


  const value =
    raw.trim();

  if (!value) {
    return null;
  }


  if (
    value.startsWith(
      "javascript:"
    ) ||
    value.startsWith(
      "mailto:"
    ) ||
    value.startsWith(
      "tel:"
    )
  ) {
    return null;
  }


  try {

    return new URL(
      value,
      baseUrl
    ).toString();

  }
  catch {
    return null;
  }
}


function addLink(
  map:
    Map<
      string,
      DiscoveredProductLink
    >,
  rawUrl:
    unknown,
  baseUrl:
    string,
  source:
    ProductUrlEvidenceSource,
  weight:
    number,
  detail:
    string | null = null,
  productId:
    string | null = null
): void {

  const url =
    resolveUrl(
      rawUrl,
      baseUrl
    );

  if (!url) {
    return;
  }


  const key =
    `${source}|${url}|${productId ?? ""}`;


  if (
    !map.has(
      key
    )
  ) {

    map.set(
      key,
      {
        url,
        source,
        weight,
        detail,
        productId
      }
    );
  }
}


function getObjectUrl(
  value:
    unknown
): unknown {

  if (
    typeof value ===
    "string"
  ) {
    return value;
  }


  if (
    typeof value !==
      "object" ||
    value ===
      null ||
    Array.isArray(value)
  ) {
    return null;
  }


  const record =
    value as Record<
      string,
      unknown
    >;


  return (
    record.url ??
    record["@id"] ??
    null
  );
}


function collectJsonLd(
  value:
    unknown,
  baseUrl:
    string,
  links:
    Map<
      string,
      DiscoveredProductLink
    >,
  depth = 0
): void {

  if (
    depth > 10 ||
    value ===
      null ||
    value ===
      undefined
  ) {
    return;
  }


  if (
    Array.isArray(
      value
    )
  ) {

    for (
      const child
      of value
    ) {

      collectJsonLd(
        child,
        baseUrl,
        links,
        depth + 1
      );
    }

    return;
  }


  if (
    typeof value !==
    "object"
  ) {
    return;
  }


  const record =
    value as Record<
      string,
      unknown
    >;


  const rawType =
    record["@type"];


  const types =
    Array.isArray(
      rawType
    )
      ? rawType
          .filter(
            (
              item
            ): item is string =>
              typeof item ===
              "string"
          )
      : typeof rawType ===
          "string"
        ? [rawType]
        : [];


  if (
    types.some(
      type =>
        type.toLowerCase() ===
        "product"
    )
  ) {

    const productId =
      record.productID ??
      record.sku ??
      record["@id"];


    addLink(
      links,
      record.url ??
        record["@id"],
      baseUrl,
      "JSON_LD_PRODUCT",
      95,
      "@type=Product",
      productId ===
        undefined
        ? null
        : String(
            productId
          )
    );


    const offers =
      record.offers;


    if (
      typeof offers ===
        "object" &&
      offers !==
        null &&
      !Array.isArray(
        offers
      )
    ) {

      addLink(
        links,
        (
          offers as Record<
            string,
            unknown
          >
        ).url,
        baseUrl,
        "JSON_LD_PRODUCT",
        90,
        "Product.offers.url"
      );
    }
  }


  if (
    types.some(
      type =>
        type.toLowerCase() ===
        "itemlist"
    )
  ) {

    const items =
      record.itemListElement;


    if (
      Array.isArray(
        items
      )
    ) {

      for (
        const item
        of items
      ) {

        if (
          typeof item !==
            "object" ||
          item ===
            null
        ) {
          continue;
        }


        const itemRecord =
          item as Record<
            string,
            unknown
          >;


        const nested =
          itemRecord.item;


        addLink(
          links,
          itemRecord.url ??
            getObjectUrl(
              nested
            ),
          baseUrl,
          "JSON_LD_ITEM_LIST",
          90,
          "ItemList.itemListElement"
        );
      }
    }
  }


  for (
    const child
    of Object.values(
      record
    )
  ) {

    if (
      typeof child ===
        "object" &&
      child !==
        null
    ) {

      collectJsonLd(
        child,
        baseUrl,
        links,
        depth + 1
      );
    }
  }
}


function normalizedText(
  value: string
): string {

  return value
    .toLowerCase()
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
      /\s+/g,
      " "
    )
    .trim();
}


export function extractListingProductLinks(
  html: string,
  pageUrl: string
): ListingDiscoveryResult {

  const $ =
    cheerio.load(
      html
    );


  const links =
    new Map<
      string,
      DiscoveredProductLink
    >();


  $(
    'script[type="application/ld+json"]'
  ).each(
    (
      _,
      element
    ) => {

      try {

        collectJsonLd(
          JSON.parse(
            $(element)
              .text()
          ),
          pageUrl,
          links
        );

      }
      catch {
        // Malformed JSON-LD is ignored.
      }
    }
  );


  const productContainers =
    $(
      [
        ".product-card",
        ".product-item",
        ".product",
        "[data-product-id]",
        '[itemtype*="Product"]'
      ].join(",")
    );


  productContainers.each(
    (
      _,
      element
    ) => {

      const container =
        $(element);

      const anchor =
        container
          .find(
            "a[href]"
          )
          .first();

      const href =
        anchor.attr(
          "href"
        );

      if (!href) {
        return;
      }


      const productId =
        container.attr(
          "data-product-id"
        ) ??
        null;


      addLink(
        links,
        href,
        pageUrl,
        "REPEATED_CARD",
        80,
        "recognized product container",
        productId
      );
    }
  );


  $("a[href]").each(
    (
      _,
      element
    ) => {

      const anchor =
        $(element);

      const href =
        anchor.attr(
          "href"
        );

      if (!href) {
        return;
      }


      const anchorText =
        normalizedText(
          anchor.text()
        );


      const container =
        anchor.closest(
          [
            ".product-card",
            ".product-item",
            ".product",
            "[data-product-id]",
            "article",
            "li",
            "div"
          ].join(",")
        );


      const containerText =
        normalizedText(
          container
            .text()
            .slice(
              0,
              1500
            )
        );


      const hasPrice =
        /(?:\d[\d.,\s]{2,})\s*(?:d|vnd|₫)(?:\b|\/)/i
          .test(
            containerText
          );


      const hasProductClass =
        /(?:product|san-pham|item|card)/i
          .test(
            [
              container.attr(
                "class"
              ) ??
              "",
              container.attr(
                "data-product-id"
              ) ??
              ""
            ].join(" ")
          );


      if (
        hasPrice
      ) {

        addLink(
          links,
          href,
          pageUrl,
          "PRICE_LINK",
          55,
          "link near visible price"
        );
      }


      if (
        /\b(?:mua ngay|them vao gio|dat thue|thue ngay|buy now|add to cart|rent now|book now|xem chi tiet|view details)\b/i
          .test(
            anchorText
          )
      ) {

        addLink(
          links,
          href,
          pageUrl,
          "CTA_LINK",
          60,
          anchorText
        );
      }


      if (
        hasProductClass &&
        anchor.find(
          "img"
        ).length >
          0
      ) {

        addLink(
          links,
          href,
          pageUrl,
          "IMAGE_LINK",
          45,
          "product-like image link"
        );
      }
    }
  );


  const pagination =
    new Set<string>();


  $(
    [
      'a[rel="next"][href]',
      '.pagination a[href]',
      '.pager a[href]',
      'a[href*="?page="]',
      'a[href*="&page="]',
      'a[href*="/page/"]'
    ].join(",")
  ).each(
    (
      _,
      element
    ) => {

      const resolved =
        resolveUrl(
          $(element)
            .attr(
              "href"
            ),
          pageUrl
        );

      if (resolved) {
        pagination.add(
          resolved
        );
      }
    }
  );


  return {
    productLinks:
      Array.from(
        links.values()
      ),

    paginationUrls:
      Array.from(
        pagination
      )
  };
}


function findApiObjects(
  value:
    unknown,
  output:
    Record<
      string,
      unknown
    >[],
  depth = 0
): void {

  if (
    depth > 4 ||
    value ===
      null ||
    value ===
      undefined
  ) {
    return;
  }


  if (
    Array.isArray(
      value
    )
  ) {

    for (
      const child
      of value
    ) {

      findApiObjects(
        child,
        output,
        depth + 1
      );
    }

    return;
  }


  if (
    typeof value !==
    "object"
  ) {
    return;
  }


  const record =
    value as Record<
      string,
      unknown
    >;


  output.push(
    record
  );


  for (
    const child
    of Object.values(
      record
    )
  ) {

    if (
      typeof child ===
        "object" &&
      child !==
        null
    ) {

      findApiObjects(
        child,
        output,
        depth + 1
      );
    }
  }
}


export function extractApiProductLinks(
  network:
    NetworkSnapshotLike,
  pageUrl: string
): DiscoveredProductLink[] {

  const links =
    new Map<
      string,
      DiscoveredProductLink
    >();


  for (
    const candidate
    of network.apiCandidates
  ) {

    const records:
      Record<
        string,
        unknown
      >[] = [];


    findApiObjects(
      candidate.sample,
      records
    );


    for (
      const record
      of records
    ) {

      const rawUrl =
        record.url ??
        record.href ??
        record.link ??
        record.permalink;


      const id =
        record.id ??
        record.productId ??
        record.product_id ??
        null;


      addLink(
        links,
        rawUrl,
        pageUrl,
        "API_ITEM",
        90,
        `${candidate.responseUrl} ${candidate.path}`,
        id ===
          null ||
        id ===
          undefined
          ? null
          : String(id)
      );
    }
  }


  return Array.from(
    links.values()
  );
}