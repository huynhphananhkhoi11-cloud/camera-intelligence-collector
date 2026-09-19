export interface ProductIdentitySignals {
  requestedUrl: string;
  canonicalUrl?: string | null;
  structuredProductId?: string | null;
  sku?: string | null;
}

function normalizeUrl(
  value: string
): string {
  const url =
    new URL(
      value
    );

  url.hash = "";

  if (
    url.pathname !== "/" &&
    url.pathname.endsWith("/")
  ) {
    url.pathname =
      url.pathname.slice(
        0,
        -1
      );
  }

  return url.toString();
}

function normalizeStableId(
  value: string
): string {
  const trimmed =
    value.trim();

  if (
    /^https?:\/\//i.test(
      trimmed
    )
  ) {
    return normalizeUrl(
      trimmed
    );
  }

  return trimmed;
}

export function productIdentityKey(
  signals:
    ProductIdentitySignals
): string {
  if (
    signals.canonicalUrl
  ) {
    return [
      "CANONICAL",
      normalizeUrl(
        signals.canonicalUrl
      )
    ].join(":");
  }

  if (
    signals.structuredProductId
  ) {
    return [
      "STRUCTURED",
      normalizeStableId(
        signals.structuredProductId
      )
    ].join(":");
  }

  if (
    signals.sku
  ) {
    const host =
      new URL(
        signals.requestedUrl
      ).host.toLowerCase();

    return [
      "SKU",
      host,
      signals.sku.trim()
    ].join(":");
  }

  return [
    "REQUESTED",
    normalizeUrl(
      signals.requestedUrl
    )
  ].join(":");
}

export function sameProductIdentity(
  left:
    ProductIdentitySignals,
  right:
    ProductIdentitySignals
): boolean {
  return productIdentityKey(
    left
  ) ===
    productIdentityKey(
      right
    );
}
