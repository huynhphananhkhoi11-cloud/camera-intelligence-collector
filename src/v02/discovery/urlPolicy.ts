const TRACKING_PARAMS =
  new Set([
    "fbclid",
    "gclid",
    "dclid",
    "msclkid",
    "srsltid",
    "gbraid",
    "wbraid",
    "yclid",
    "ttclid",
    "twclid",
    "li_fat_id",
    "mc_cid",
    "mc_eid",
    "_gl"
  ]);


function ensureHttpScheme(
  raw: string
): string {

  const value =
    raw.trim();

  if (!value) {
    return "";
  }

  if (
    /^https?:\/\//i.test(value)
  ) {
    return value;
  }

  if (
    value.startsWith("//")
  ) {
    return `https:${value}`;
  }

  const looksLikeScheme =
    /^[a-z][a-z0-9+.-]*:/i
      .test(value);

  const looksLikeHostPort =
    /^[^/\s:]+:\d+(?:\/|$)/
      .test(value);

  if (
    looksLikeScheme &&
    !looksLikeHostPort
  ) {
    return value;
  }

  return `https://${value}`;
}


function isHttpUrl(
  url: URL
): boolean {

  return (
    url.protocol === "http:" ||
    url.protocol === "https:"
  );
}


function isTrackingParam(
  rawKey: string
): boolean {

  const key =
    rawKey
      .trim()
      .toLowerCase();


  if (!key) {
    return false;
  }


  /*
   * UTM is an explicitly defined analytics namespace.
   * Use the namespace rather than enumerating every
   * present and future utm_* key.
   */
  if (
    key.startsWith(
      "utm_"
    )
  ) {
    return true;
  }


  return TRACKING_PARAMS.has(
    key
  );
}


function removeTrackingParams(
  url: URL
): void {

  const keys =
    Array.from(
      url.searchParams.keys()
    );


  for (
    const key
    of keys
  ) {

    if (
      isTrackingParam(
        key
      )
    ) {

      url.searchParams.delete(
        key
      );
    }
  }
}


function normalizeTrailingSlash(
  url: URL
): void {

  if (
    url.pathname === "/"
  ) {
    return;
  }

  const pathname =
    url.pathname.replace(
      /\/+$/,
      ""
    );

  url.pathname =
    pathname || "/";
}


/**
 * Deterministic URL normalization.
 *
 * No network request or redirect resolution
 * happens at this layer.
 */
export function canonicalizeUrl(
  raw: string,
  baseUrl?: string
): string | null {

  try {

    const value =
      raw.trim();

    if (!value) {
      return null;
    }

    let base:
      URL | undefined;

    if (baseUrl) {

      base =
        new URL(
          ensureHttpScheme(
            baseUrl
          )
        );

      if (
        !isHttpUrl(base)
      ) {
        return null;
      }
    }

    const url =
      base
        ? new URL(
            value,
            base
          )
        : new URL(
            ensureHttpScheme(
              value
            )
          );

    if (
      !isHttpUrl(url)
    ) {
      return null;
    }

    if (
      url.username ||
      url.password
    ) {
      return null;
    }

    url.hash = "";

    removeTrackingParams(
      url
    );

    normalizeTrailingSlash(
      url
    );

    return url.toString();
  }
  catch {
    return null;
  }
}


export function normalizeSiteInput(
  raw: string
): string | null {

  return canonicalizeUrl(
    raw
  );
}


export function getCanonicalOrigin(
  raw: string
): string | null {

  const canonical =
    canonicalizeUrl(
      raw
    );

  if (!canonical) {
    return null;
  }

  const url =
    new URL(
      canonical
    );

  return `${url.origin}/`;
}


export function isUrlInScope(
  raw: string,
  baseUrl: string,
  allowedOrigins:
    readonly string[] = []
): boolean {

  const candidate =
    canonicalizeUrl(
      raw,
      baseUrl
    );

  if (!candidate) {
    return false;
  }

  const baseOrigin =
    getCanonicalOrigin(
      baseUrl
    );

  if (!baseOrigin) {
    return false;
  }

  const allowed =
    new Set<string>();

  allowed.add(
    new URL(
      baseOrigin
    ).origin
  );

  for (
    const rawOrigin
    of allowedOrigins
  ) {

    const canonicalOrigin =
      getCanonicalOrigin(
        rawOrigin
      );

    if (!canonicalOrigin) {
      continue;
    }

    allowed.add(
      new URL(
        canonicalOrigin
      ).origin
    );
  }

  return allowed.has(
    new URL(
      candidate
    ).origin
  );
}
