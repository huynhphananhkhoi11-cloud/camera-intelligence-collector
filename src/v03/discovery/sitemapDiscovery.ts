import {
  load
} from "cheerio";

import type {
  SitemapDiscoveryResult,
  UrlDiscoveryEvidence
} from "./multiSourceDiscoveryTypes.js";

import {
  scoreDiscoveredUrl
} from "./urlDiscoveryScoring.js";


export interface SitemapDiscoveryOptions {
  readonly fetchFn?:
    typeof fetch;

  readonly timeoutMs?:
    number;

  readonly maxSitemapDocuments?:
    number;

  readonly maxUrls?:
    number;
}


const DEFAULT_TIMEOUT_MS =
  15_000;


const DEFAULT_MAX_SITEMAP_DOCUMENTS =
  30;


const DEFAULT_MAX_URLS =
  10_000;


function siteKey(
  value:
    string
): string |
  null {

  try {

    const url =
      new URL(
        value
      );


    return (
      url.protocol +
      "//" +
      url.hostname
        .replace(
          /^www\./i,
          ""
        )
        .toLowerCase() +
      (
        url.port
          ? ":" +
            url.port
          : ""
      )
    );
  }
  catch {
    return null;
  }
}


function sameSite(
  left:
    string,
  right:
    string
): boolean {

  const leftKey =
    siteKey(
      left
    );


  const rightKey =
    siteKey(
      right
    );


  return (
    leftKey !==
      null &&
    leftKey ===
      rightKey
  );
}


function uniqueInOrder(
  values:
    readonly string[]
): string[] {

  return [
    ...new Set(
      values
    )
  ];
}


async function fetchText(
  fetchFn:
    typeof fetch,
  url:
    string,
  timeoutMs:
    number,
  signal?:
    AbortSignal
): Promise<{
  readonly status:
    number;

  readonly finalUrl:
    string;

  readonly body:
    string;
}> {

  const controller =
    new AbortController();


  const abortFromParent =
    () => {
      controller.abort(
        signal?.reason
      );
    };


  if (
    signal?.aborted
  ) {
    abortFromParent();
  }
  else {
    signal?.addEventListener(
      "abort",
      abortFromParent,
      {
        once:
          true
      }
    );
  }


  const timer =
    setTimeout(
      () => {
        controller.abort(
          new Error(
            "Sitemap request timed out."
          )
        );
      },
      timeoutMs
    );


  try {

    const response =
      await fetchFn(
        url,
        {
          method:
            "GET",

          redirect:
            "follow",

          headers: {
            Accept:
              "application/xml,text/xml,text/plain;q=0.9,*/*;q=0.1"
          },

          signal:
            controller.signal
        }
      );


    return {
      status:
        response.status,

      finalUrl:
        response.url ||
        url,

      body:
        await response.text()
    };
  }
  finally {

    clearTimeout(
      timer
    );


    signal?.removeEventListener(
      "abort",
      abortFromParent
    );
  }
}


function sitemapUrlsFromRobots(
  body:
    string,
  baseUrl:
    string
): string[] {

  const output:
    string[] =
      [];


  for (
    const line
    of body.split(
      /\r?\n/
    )
  ) {

    const match =
      line.match(
        /^\s*Sitemap\s*:\s*(\S+)\s*$/i
      );


    if (
      !match?.[1]
    ) {
      continue;
    }


    try {
      output.push(
        new URL(
          match[1],
          baseUrl
        ).toString()
      );
    }
    catch {
      // Ignore malformed robots sitemap declarations.
    }
  }


  return uniqueInOrder(
    output
  );
}


function parseSitemap(
  body:
    string
): {
  readonly childSitemaps:
    readonly string[];

  readonly pageUrls:
    readonly string[];
} {

  const $ =
    load(
      body,
      {
        xmlMode:
          true
      }
    );


  const childSitemaps:
    string[] =
      [];


  $("sitemapindex sitemap loc")
    .each(
      (
        _,
        element
      ) => {

        const value =
          $(element)
            .text()
            .trim();


        if (
          value
        ) {
          childSitemaps.push(
            value
          );
        }
      }
    );


  const pageUrls:
    string[] =
      [];


  $("urlset url loc")
    .each(
      (
        _,
        element
      ) => {

        const value =
          $(element)
            .text()
            .trim();


        if (
          value
        ) {
          pageUrls.push(
            value
          );
        }
      }
    );


  return {
    childSitemaps:
      uniqueInOrder(
        childSitemaps
      ),

    pageUrls:
      uniqueInOrder(
        pageUrls
      )
  };
}


export class SitemapDiscovery {
  private readonly fetchFn:
    typeof fetch;


  private readonly timeoutMs:
    number;


  private readonly maxSitemapDocuments:
    number;


  private readonly maxUrls:
    number;


  constructor(
    options:
      SitemapDiscoveryOptions = {}
  ) {

    this.fetchFn =
      options.fetchFn ??
      fetch;


    this.timeoutMs =
      options.timeoutMs ??
      DEFAULT_TIMEOUT_MS;


    this.maxSitemapDocuments =
      options.maxSitemapDocuments ??
      DEFAULT_MAX_SITEMAP_DOCUMENTS;


    this.maxUrls =
      options.maxUrls ??
      DEFAULT_MAX_URLS;
  }


  async discover(
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      SitemapDiscoveryResult
    > {

    const origin =
      new URL(
        rootUrl
      ).origin;


    const warnings:
      string[] =
        [];


    const sitemapSeeds:
      string[] =
        [];


    try {

      const robotsUrl =
        new URL(
          "/robots.txt",
          origin
        ).toString();


      const robots =
        await fetchText(
          this.fetchFn,
          robotsUrl,
          this.timeoutMs,
          signal
        );


      if (
        robots.status >=
          200 &&
        robots.status <
          300
      ) {
        sitemapSeeds.push(
          ...sitemapUrlsFromRobots(
            robots.body,
            robots.finalUrl
          )
        );
      }
    }
    catch (
      error
    ) {

      warnings.push(
        "robots.txt unavailable: " +
        (
          error instanceof
            Error
            ? error.message
            : String(
                error
              )
        )
      );
    }


    for (
      const path
      of [
        "/sitemap.xml",
        "/sitemap_index.xml",
        "/sitemap-index.xml",
        "/wp-sitemap.xml"
      ]
    ) {
      sitemapSeeds.push(
        new URL(
          path,
          origin
        ).toString()
      );
    }


    const queue =
      uniqueInOrder(
        sitemapSeeds
      )
        .filter(
          url =>
            sameSite(
              url,
              origin
            )
        );


    const queued =
      new Set(
        queue
      );


    const sitemapDocuments:
      string[] =
        [];


    const evidence:
      UrlDiscoveryEvidence[] =
        [];


    while (
      queue.length >
        0 &&
      sitemapDocuments.length <
        this.maxSitemapDocuments &&
      evidence.length <
        this.maxUrls
    ) {

      const sitemapUrl =
        queue.shift()!;


      try {

        const response =
          await fetchText(
            this.fetchFn,
            sitemapUrl,
            this.timeoutMs,
            signal
          );


        if (
          response.status <
            200 ||
          response.status >=
            300
        ) {
          continue;
        }


        const parsed =
          parseSitemap(
            response.body
          );


        if (
          parsed.childSitemaps.length ===
            0 &&
          parsed.pageUrls.length ===
            0
        ) {
          continue;
        }


        sitemapDocuments.push(
          response.finalUrl
        );


        for (
          const child
          of parsed.childSitemaps
        ) {

          let resolved:
            string;


          try {
            resolved =
              new URL(
                child,
                response.finalUrl
              ).toString();
          }
          catch {
            continue;
          }


          if (
            !sameSite(
              resolved,
              origin
            ) ||
            queued.has(
              resolved
            )
          ) {
            continue;
          }


          queued.add(
            resolved
          );


          queue.push(
            resolved
          );
        }


        for (
          const rawPageUrl
          of parsed.pageUrls
        ) {

          if (
            evidence.length >=
              this.maxUrls
          ) {
            break;
          }


          let pageUrl:
            string;


          try {

            const parsedUrl =
              new URL(
                rawPageUrl,
                response.finalUrl
              );


            parsedUrl.hash = "";


            pageUrl =
              parsedUrl.toString();
          }
          catch {
            continue;
          }


          if (
            !sameSite(
              pageUrl,
              origin
            )
          ) {
            continue;
          }


          evidence.push({
            url:
              pageUrl,

            channel:
              "SITEMAP",

            parentUrl:
              response.finalUrl,

            anchorText:
              null,

            score:
              scoreDiscoveredUrl(
                pageUrl,
                "SITEMAP"
              )
          });
        }
      }
      catch (
        error
      ) {

        warnings.push(
          "Sitemap unavailable: " +
          sitemapUrl +
          " | " +
          (
            error instanceof
              Error
              ? error.message
              : String(
                  error
                )
          )
        );
      }
    }


    return {
      sitemapDocuments,
      evidence,
      warnings
    };
  }
}
