import * as cheerio from "cheerio";

import type {
  SiteFetch
} from "./redirectResolver.js";

import {
  canonicalizeUrl,
  isUrlInScope
} from "./urlPolicy.js";


export interface MenuSeedCandidate {
  url: string;
  text: string;
  confidence: number;
  reasons: string[];
}


export interface MenuSeedDiscoveryOptions {
  timeoutMs?: number;
  fetchFn?: SiteFetch;
  allowedOrigins?: readonly string[];
}


interface SelectorRule {
  selector: string;
  confidence: number;
  reason: string;
}


const SELECTOR_RULES:
  readonly SelectorRule[] = [

    {
      selector:
        'nav a[href], [role="navigation"] a[href]',
      confidence:
        0.85,
      reason:
        "navigation structure"
    },

    {
      selector:
        'header a[href]',
      confidence:
        0.70,
      reason:
        "header navigation"
    },

    {
      selector:
        [
          '.menu a[href]',
          '.navbar a[href]',
          '.navigation a[href]',
          '[class*="menu"] a[href]',
          '[class*="nav"] a[href]'
        ].join(","),
      confidence:
        0.65,
      reason:
        "menu-like structure"
    }

  ];


function clean(
  value: unknown
): string {

  return String(
    value ??
    ""
  )
    .replace(
      /\u00a0/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function isUtilityPath(
  url: URL
): boolean {

  return /\/(?:cart|gio-hang|checkout|login|dang-nhap|register|account|search|tim-kiem|contact|lien-he)(?:\/|$)/i
    .test(
      url.pathname
    );
}


export function discoverMenuSeedsFromHtml(
  html: string,
  baseUrl: string,
  allowedOrigins:
    readonly string[] = []
): MenuSeedCandidate[] {

  const $ =
    cheerio.load(
      html
    );

  const candidates =
    new Map<
      string,
      MenuSeedCandidate
    >();


  for (
    const rule
    of SELECTOR_RULES
  ) {

    $(
      rule.selector
    ).each(
      (
        _,
        element
      ) => {

        const anchor =
          $(element);

        const href =
          clean(
            anchor.attr(
              "href"
            )
          );

        if (
          !href ||
          href.startsWith(
            "#"
          ) ||
          href.startsWith(
            "javascript:"
          ) ||
          href.startsWith(
            "mailto:"
          ) ||
          href.startsWith(
            "tel:"
          )
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


        if (
          !isUrlInScope(
            canonical,
            baseUrl,
            allowedOrigins
          )
        ) {
          return;
        }


        const url =
          new URL(
            canonical
          );

        if (
          isUtilityPath(
            url
          )
        ) {
          return;
        }


        const text =
          clean(
            anchor.text()
          );


        const existing =
          candidates.get(
            canonical
          );


        if (existing) {

          existing.confidence =
            Math.max(
              existing.confidence,
              rule.confidence
            );


          if (
            !existing.reasons.includes(
              rule.reason
            )
          ) {
            existing.reasons.push(
              rule.reason
            );
          }


          if (
            !existing.text &&
            text
          ) {
            existing.text =
              text;
          }

          return;
        }


        candidates.set(
          canonical,
          {
            url:
              canonical,

            text,

            confidence:
              rule.confidence,

            reasons: [
              rule.reason
            ]
          }
        );
      }
    );
  }


  return Array.from(
    candidates.values()
  )
    .sort(
      (a, b) =>
        b.confidence -
        a.confidence
    );
}


export async function discoverMenuSeeds(
  pageUrl: string,
  options:
    MenuSeedDiscoveryOptions = {}
): Promise<MenuSeedCandidate[]> {

  const canonical =
    canonicalizeUrl(
      pageUrl
    );

  if (!canonical) {
    throw new Error(
      `Invalid menu discovery URL: ${pageUrl}`
    );
  }


  const timeoutMs =
    options.timeoutMs ??
    15000;

  const fetchFn =
    options.fetchFn ??
    fetch;

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

    const response =
      await fetchFn(
        canonical,
        {
          method:
            "GET",

          redirect:
            "follow",

          signal:
            controller.signal,

          headers: {
            "user-agent":
              "CameraIntelligenceCollector/0.2",

            accept:
              "text/html,application/xhtml+xml"
          }
        }
      );


    if (
      !response.ok
    ) {
      return [];
    }


    const html =
      await response.text();


    return discoverMenuSeedsFromHtml(
      html,
      canonical,
      options.allowedOrigins ??
        []
    );
  }
  catch {
    /*
     * Menu seeds are supplementary.
     * Failure must not destroy bootstrap
     * results obtained from sitemap/homepage.
     */
    return [];
  }
  finally {
    clearTimeout(
      timer
    );
  }
}