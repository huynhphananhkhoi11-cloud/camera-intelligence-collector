import {
  load
} from "cheerio";

import type {
  DetailIdentitySignals
} from "./productIdentityTypes.js";


type JsonObject =
  Record<
    string,
    unknown
  >;


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


function hasProductType(
  value:
    unknown
): boolean {

  if (
    typeof value ===
      "string"
  ) {
    return value ===
      "Product" ||
      value.endsWith(
        "/Product"
      );
  }


  if (
    Array.isArray(
      value
    )
  ) {
    return value.some(
      item =>
        hasProductType(
          item
        )
    );
  }


  return false;
}


function collectProductObjects(
  value:
    unknown,
  output:
    JsonObject[]
): void {

  if (
    Array.isArray(
      value
    )
  ) {

    for (
      const item
      of value
    ) {
      collectProductObjects(
        item,
        output
      );
    }


    return;
  }


  if (
    !isObject(
      value
    )
  ) {
    return;
  }


  if (
    hasProductType(
      value["@type"]
    )
  ) {
    output.push(
      value
    );
  }


  const graph =
    value["@graph"];


  if (
    graph !==
      undefined
  ) {
    collectProductObjects(
      graph,
      output
    );
  }
}


function resolveHttpUrl(
  value:
    unknown,
  baseUrl:
    string
): string |
  null {

  if (
    typeof value !==
      "string" ||
    value.trim().length ===
      0
  ) {
    return null;
  }


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
      url.pathname !== "/" &&
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


function normalizePageUrl(
  value:
    string
): string {

  return (
    resolveHttpUrl(
      value,
      value
    ) ??
    value
  );
}


function stringValue(
  value:
    unknown
): string |
  null {

  if (
    typeof value !==
      "string"
  ) {
    return null;
  }


  const trimmed =
    value.trim();


  return trimmed.length >
    0
    ? trimmed
    : null;
}


function productObjectUrl(
  product:
    JsonObject,
  baseUrl:
    string
): string |
  null {

  return (
    resolveHttpUrl(
      product.url,
      baseUrl
    ) ??
    resolveHttpUrl(
      product["@id"],
      baseUrl
    )
  );
}


function selectPrimaryProduct(
  products:
    readonly JsonObject[],
  targetUrls:
    ReadonlySet<
      string
    >,
  baseUrl:
    string
): {
  readonly product:
    JsonObject |
    null;

  readonly selection:
    DetailIdentitySignals[
      "primaryProductSelection"
    ];
} {

  const matching =
    products.filter(
      product => {

        const url =
          productObjectUrl(
            product,
            baseUrl
          );


        return (
          url !==
            null &&
          targetUrls.has(
            url
          )
        );
      }
    );


  if (
    matching.length >
      0
  ) {
    return {
      product:
        matching[0] ??
        null,

      selection:
        "MATCHED_URL"
    };
  }


  if (
    products.length ===
      1
  ) {
    return {
      product:
        products[0] ??
        null,

      selection:
        "SINGLE_PRODUCT"
    };
  }


  return {
    product:
      null,

    selection:
      "NONE"
  };
}


export function extractDetailIdentitySignals(
  html:
    string,
  requestedUrl:
    string,
  finalUrl:
    string =
      requestedUrl
): DetailIdentitySignals {

  const $ =
    load(
      html
    );


  const normalizedRequestedUrl =
    normalizePageUrl(
      requestedUrl
    );


  const normalizedFinalUrl =
    normalizePageUrl(
      finalUrl
    );


  const baseHref =
    $("base[href]")
      .first()
      .attr(
        "href"
      );


  const baseUrl =
    resolveHttpUrl(
      baseHref,
      normalizedFinalUrl
    ) ??
    normalizedFinalUrl;


  const canonicalHref =
    $('link[rel~="canonical"][href]')
      .first()
      .attr(
        "href"
      );


  const canonicalUrl =
    resolveHttpUrl(
      canonicalHref,
      baseUrl
    );


  const products:
    JsonObject[] =
      [];


  $('script[type="application/ld+json"]')
    .each(
      (
        _,
        element
      ) => {

        const text =
          $(element)
            .html();


        if (
          !text
        ) {
          return;
        }


        try {

          collectProductObjects(
            JSON.parse(
              text
            ),
            products
          );
        }
        catch {
          /*
           * Invalid structured data is not identity evidence.
           * Raw collection remains available elsewhere.
           */
        }
      }
    );


  const targetUrls =
    new Set(
      [
        normalizedRequestedUrl,
        normalizedFinalUrl,
        canonicalUrl
      ].filter(
        (
          value
        ): value is
          string =>
            value !==
            null
      )
    );


  const primary =
    selectPrimaryProduct(
      products,
      targetUrls,
      baseUrl
    );


  const product =
    primary.product;


  return {
    requestedUrl:
      normalizedRequestedUrl,

    finalUrl:
      normalizedFinalUrl,

    canonicalUrl,

    structuredProductId:
      product
        ? stringValue(
            product["@id"]
          )
        : null,

    sku:
      product
        ? stringValue(
            product.sku
          )
        : null,

    productId:
      product
        ? stringValue(
            product.productID
          )
        : null,

    structuredProductUrl:
      product
        ? resolveHttpUrl(
            product.url,
            baseUrl
          )
        : null,

    productObjectCount:
      products.length,

    primaryProductSelection:
      primary.selection
  };
}
