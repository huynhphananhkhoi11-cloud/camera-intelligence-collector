import {
  canonicalizeUrl,
  getCanonicalOrigin,
  isUrlInScope
} from "./urlPolicy.js";


export type SitemapDocumentKind =
  | "INDEX"
  | "URLSET"
  | "UNKNOWN";


export interface SitemapParseResult {
  kind: SitemapDocumentKind;
  sitemapUrls: string[];
  pageUrls: string[];
}


export interface SitemapFetchRecord {
  url: string;
  status: number | null;
  kind: SitemapDocumentKind;
  ok: boolean;
  error: string | null;
}


export interface SitemapDiscoveryResult {
  sitemapUrls: string[];
  pageUrls: string[];
  fetched: SitemapFetchRecord[];
  usedFallback: boolean;
}


export type SitemapFetch = (
  input:
    | string
    | URL
    | Request,
  init?: RequestInit
) => Promise<Response>;


export interface SitemapDiscoveryOptions {
  timeoutMs?: number;
  maxSitemaps?: number;
  fetchFn?: SitemapFetch;
  allowedOrigins?: readonly string[];
}


const FALLBACK_SITEMAPS = [
  "sitemap.xml",
  "sitemap_index.xml",
  "sitemap-index.xml",
  "wp-sitemap.xml"
] as const;


function decodeXmlEntities(
  raw: string
): string {

  return raw
    .replace(
      /&amp;/gi,
      "&"
    )
    .replace(
      /&lt;/gi,
      "<"
    )
    .replace(
      /&gt;/gi,
      ">"
    )
    .replace(
      /&quot;/gi,
      '"'
    )
    .replace(
      /&apos;/gi,
      "'"
    )
    .replace(
      /&#(\d+);/g,
      (
        _match,
        code: string
      ) =>
        String.fromCodePoint(
          Number.parseInt(
            code,
            10
          )
        )
    )
    .replace(
      /&#x([0-9a-f]+);/gi,
      (
        _match,
        code: string
      ) =>
        String.fromCodePoint(
          Number.parseInt(
            code,
            16
          )
        )
    );
}


function cleanLoc(
  raw: string
): string {

  let value =
    raw.trim();

  const cdata =
    value.match(
      /^<!\[CDATA\[([\s\S]*)\]\]>$/i
    );

  if (
    cdata?.[1] !== undefined
  ) {
    value =
      cdata[1].trim();
  }

  return decodeXmlEntities(
    value
  ).trim();
}


function extractLocValues(
  xml: string
): string[] {

  const values:
    string[] = [];

  const pattern =
    /<(?:[A-Za-z_][\w.-]*:)?loc\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z_][\w.-]*:)?loc\s*>/gi;

  let match:
    RegExpExecArray | null;

  while (
    (
      match =
        pattern.exec(
          xml
        )
    ) !== null
  ) {

    const raw =
      match[1];

    if (
      raw === undefined
    ) {
      continue;
    }

    const value =
      cleanLoc(
        raw
      );

    if (value) {
      values.push(
        value
      );
    }
  }

  return values;
}


function detectKind(
  xml: string
): SitemapDocumentKind {

  if (
    /<(?:[A-Za-z_][\w.-]*:)?sitemapindex\b/i
      .test(
        xml
      )
  ) {
    return "INDEX";
  }

  if (
    /<(?:[A-Za-z_][\w.-]*:)?urlset\b/i
      .test(
        xml
      )
  ) {
    return "URLSET";
  }

  return "UNKNOWN";
}


export function parseSitemapXml(
  xml: string,
  documentUrl: string
): SitemapParseResult {

  const kind =
    detectKind(
      xml
    );

  if (
    kind === "UNKNOWN"
  ) {
    return {
      kind,
      sitemapUrls: [],
      pageUrls: []
    };
  }


  const locations =
    extractLocValues(
      xml
    );

  const canonical =
    new Set<string>();


  for (
    const raw
    of locations
  ) {

    const url =
      canonicalizeUrl(
        raw,
        documentUrl
      );

    if (url) {
      canonical.add(
        url
      );
    }
  }


  if (
    kind === "INDEX"
  ) {

    return {
      kind,
      sitemapUrls:
        Array.from(
          canonical
        ),
      pageUrls: []
    };
  }


  return {
    kind,
    sitemapUrls: [],
    pageUrls:
      Array.from(
        canonical
      )
  };
}


async function fetchSitemap(
  url: string,
  fetchFn: SitemapFetch,
  timeoutMs: number
): Promise<Response> {

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs
    );

  try {

    return await fetchFn(
      url,
      {
        method: "GET",
        redirect: "follow",

        signal:
          controller.signal,

        headers: {
          "user-agent":
            "CameraIntelligenceCollector/0.2",

          accept:
            "application/xml,text/xml,text/plain,*/*;q=0.1"
        }
      }
    );
  }
  finally {
    clearTimeout(
      timer
    );
  }
}


export async function discoverSitemaps(
  siteUrl: string,
  declaredSitemapUrls:
    readonly string[] = [],
  options:
    SitemapDiscoveryOptions = {}
): Promise<SitemapDiscoveryResult> {

  const origin =
    getCanonicalOrigin(
      siteUrl
    );

  if (!origin) {
    throw new Error(
      `Invalid site URL: ${siteUrl}`
    );
  }


  const timeoutMs =
    options.timeoutMs ??
    15000;

  const maxSitemaps =
    options.maxSitemaps ??
    50;

  const fetchFn =
    options.fetchFn ??
    fetch;

  const allowedOrigins =
    options.allowedOrigins ??
    [];


  const queue:
    string[] = [];

  const known =
    new Set<string>();

  const processed =
    new Set<string>();

  const successfulSitemaps =
    new Set<string>();

  const pageUrls =
    new Set<string>();

  const fetched:
    SitemapFetchRecord[] = [];


  const enqueue = (
    raw: string,
    baseUrl:
      string = origin
  ): void => {

    const canonical =
      canonicalizeUrl(
        raw,
        baseUrl
      );

    if (!canonical) {
      return;
    }

    if (
      !isUrlInScope(
        canonical,
        origin,
        allowedOrigins
      )
    ) {
      return;
    }

    if (
      known.has(
        canonical
      )
    ) {
      return;
    }

    known.add(
      canonical
    );

    queue.push(
      canonical
    );
  };


  for (
    const raw
    of declaredSitemapUrls
  ) {
    enqueue(
      raw
    );
  }


  let usedFallback =
    false;


  const enqueueFallbacks =
    (): void => {

      if (usedFallback) {
        return;
      }

      usedFallback =
        true;

      for (
        const path
        of FALLBACK_SITEMAPS
      ) {

        enqueue(
          path,
          origin
        );
      }
    };


  if (
    queue.length === 0
  ) {
    enqueueFallbacks();
  }


  while (true) {

    if (
      queue.length === 0
    ) {

      /*
       * robots.txt may declare stale/broken
       * sitemap URLs. If none of them produced
       * a valid sitemap, try conventional paths.
       */
      if (
        successfulSitemaps.size === 0 &&
        !usedFallback
      ) {
        enqueueFallbacks();
        continue;
      }

      break;
    }


    if (
      processed.size >=
      maxSitemaps
    ) {
      break;
    }


    const current =
      queue.shift();

    if (!current) {
      continue;
    }


    if (
      processed.has(
        current
      )
    ) {
      continue;
    }


    processed.add(
      current
    );


    try {

      const response =
        await fetchSitemap(
          current,
          fetchFn,
          timeoutMs
        );


      if (
        !response.ok
      ) {

        fetched.push({
          url: current,
          status:
            response.status,
          kind:
            "UNKNOWN",
          ok:
            false,
          error:
            `HTTP ${response.status}`
        });

        continue;
      }


      const xml =
        await response.text();

      const parsed =
        parseSitemapXml(
          xml,
          current
        );


      if (
        parsed.kind ===
        "UNKNOWN"
      ) {

        fetched.push({
          url: current,
          status:
            response.status,
          kind:
            parsed.kind,
          ok:
            false,
          error:
            "Unrecognized sitemap XML"
        });

        continue;
      }


      successfulSitemaps.add(
        current
      );


      fetched.push({
        url: current,
        status:
          response.status,
        kind:
          parsed.kind,
        ok:
          true,
        error:
          null
      });


      if (
        parsed.kind ===
        "INDEX"
      ) {

        for (
          const child
          of parsed.sitemapUrls
        ) {
          enqueue(
            child,
            current
          );
        }

        continue;
      }


      for (
        const pageUrl
        of parsed.pageUrls
      ) {

        if (
          isUrlInScope(
            pageUrl,
            origin,
            allowedOrigins
          )
        ) {

          pageUrls.add(
            pageUrl
          );
        }
      }
    }
    catch (
      error
    ) {

      fetched.push({
        url: current,
        status:
          null,
        kind:
          "UNKNOWN",
        ok:
          false,
        error:
          String(
            error
          )
      });
    }
  }


  return {
    sitemapUrls:
      Array.from(
        successfulSitemaps
      ),

    pageUrls:
      Array.from(
        pageUrls
      ),

    fetched,

    usedFallback
  };
}