import type {
  DetailIdentitySignals,
  ProductIdentityToken
} from "./productIdentityTypes.js";


function normalizeUrl(
  value:
    string
): string {

  const url =
    new URL(
      value
    );


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


function normalizedText(
  value:
    string |
    null
): string |
  null {

  if (
    value ===
      null
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


function scopedToken(
  kind:
    "SKU" |
    "PRODUCT_ID",
  value:
    string,
  requestedUrl:
    string
): ProductIdentityToken {

  const origin =
    new URL(
      requestedUrl
    ).origin
      .toLowerCase();


  return {
    kind,
    value,
    token:
      [
        kind,
        origin,
        value
      ].join(
        ":"
      )
  };
}


export function buildIdentityTokens(
  signals:
    DetailIdentitySignals
): ProductIdentityToken[] {

  const tokens:
    ProductIdentityToken[] =
      [];


  if (
    signals.canonicalUrl
  ) {

    const value =
      normalizeUrl(
        signals.canonicalUrl
      );


    tokens.push({
      kind:
        "CANONICAL",
      value,
      token:
        "CANONICAL:" +
        value
    });
  }


  if (
    signals.structuredProductId
  ) {

    const raw =
      normalizedText(
        signals.structuredProductId
      );


    if (
      raw
    ) {

      if (
        /^https?:\/\//i.test(
          raw
        )
      ) {

        const value =
          normalizeUrl(
            raw
          );


        tokens.push({
          kind:
            "STRUCTURED_ID",
          value,
          token:
            "STRUCTURED_ID:" +
            value
        });
      }
      else {

        const origin =
          new URL(
            signals.requestedUrl
          ).origin
            .toLowerCase();


        tokens.push({
          kind:
            "STRUCTURED_ID",
          value:
            raw,
          token:
            [
              "STRUCTURED_ID",
              origin,
              raw
            ].join(
              ":"
            )
        });
      }
    }
  }


  if (
    signals.structuredProductUrl
  ) {

    const value =
      normalizeUrl(
        signals.structuredProductUrl
      );


    tokens.push({
      kind:
        "STRUCTURED_URL",
      value,
      token:
        "STRUCTURED_URL:" +
        value
    });
  }


  if (
    signals.sku
  ) {

    const value =
      normalizedText(
        signals.sku
      );


    if (
      value
    ) {
      tokens.push(
        scopedToken(
          "SKU",
          value,
          signals.requestedUrl
        )
      );
    }
  }


  if (
    signals.productId
  ) {

    const value =
      normalizedText(
        signals.productId
      );


    if (
      value
    ) {
      tokens.push(
        scopedToken(
          "PRODUCT_ID",
          value,
          signals.requestedUrl
        )
      );
    }
  }


  /*
   * Requested URL is only a fallback identity signal.
   *
   * It is intentionally omitted when stronger demonstrated
   * identity signals exist, so query variants are never merged
   * merely because a URL-normalization heuristic stripped data.
   */
  if (
    tokens.length ===
      0
  ) {

    const value =
      normalizeUrl(
        signals.requestedUrl
      );


    tokens.push({
      kind:
        "REQUESTED_URL",
      value,
      token:
        "REQUESTED_URL:" +
        value
    });
  }


  return tokens;
}
