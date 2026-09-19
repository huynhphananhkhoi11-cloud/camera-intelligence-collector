import {
  load
} from "cheerio";

import {
  createAcquisitionContext
} from "../acquisition/acquisitionContext.js";

import {
  StaticHttpBackend
} from "../acquisition/staticHttpBackend.js";

import type {
  StaticHttpBackendOptions
} from "../acquisition/staticHttpBackend.js";

import type {
  StaticTraversalResult,
  UrlDiscoveryEvidence
} from "./multiSourceDiscoveryTypes.js";

import {
  scoreDiscoveredUrl,
  shouldTraverseAsCatalog
} from "./urlDiscoveryScoring.js";


export interface StaticTraversalOptions {
  readonly staticHttp?:
    StaticHttpBackendOptions;

  readonly maxPages?:
    number;

  readonly maxDepth?:
    number;
}


interface QueueItem {
  readonly url:
    string;

  readonly depth:
    number;
}


const DEFAULT_MAX_PAGES =
  30;


const DEFAULT_MAX_DEPTH =
  2;


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


function resolveLink(
  href:
    string |
    undefined,
  baseUrl:
    string
): string |
  null {

  if (
    !href
  ) {
    return null;
  }


  try {

    const url =
      new URL(
        href,
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


    return url.toString();
  }
  catch {
    return null;
  }
}


export class StaticTraversalDiscovery {
  private readonly backend:
    StaticHttpBackend;


  private readonly maxPages:
    number;


  private readonly maxDepth:
    number;


  constructor(
    options:
      StaticTraversalOptions = {}
  ) {

    this.backend =
      new StaticHttpBackend(
        options.staticHttp
      );


    this.maxPages =
      options.maxPages ??
      DEFAULT_MAX_PAGES;


    this.maxDepth =
      options.maxDepth ??
      DEFAULT_MAX_DEPTH;
  }


  async discover(
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      StaticTraversalResult
    > {

    const queue:
      QueueItem[] = [
        {
          url:
            rootUrl,
          depth:
            0
        }
      ];


    const queued =
      new Set([
        rootUrl
      ]);


    const visited:
      string[] =
        [];


    const evidence:
      UrlDiscoveryEvidence[] =
        [];


    const warnings:
      string[] =
        [];


    while (
      queue.length >
        0 &&
      visited.length <
        this.maxPages
    ) {

      const item =
        queue.shift()!;


      if (
        signal?.aborted
      ) {
        throw new Error(
          "Static traversal aborted."
        );
      }


      try {

        const context =
          createAcquisitionContext(
            item.url,
            signal
          );


        const probe =
          await this.backend.probe(
            context
          );


        if (
          probe.status !==
            "AVAILABLE"
        ) {

          warnings.push(
            "Static page unavailable: " +
            item.url +
            " | " +
            probe.reason
          );


          continue;
        }


        const result =
          await this.backend.acquire(
            context
          );


        const html =
          result.artifacts.find(
            artifact =>
              artifact.kind ===
                "HTML" &&
              typeof artifact.body ===
                "string"
          );


        if (
          !html?.body
        ) {
          continue;
        }


        visited.push(
          item.url
        );


        const $ =
          load(
            html.body
          );


        const baseHref =
          $("base[href]")
            .first()
            .attr(
              "href"
            );


        const baseUrl =
          resolveLink(
            baseHref,
            html.url
          ) ??
          html.url;


        $("a[href]")
          .each(
            (
              _,
              element
            ) => {

              const resolved =
                resolveLink(
                  $(element)
                    .attr(
                      "href"
                    ),
                  baseUrl
                );


              if (
                resolved ===
                  null ||
                !sameSite(
                  resolved,
                  rootUrl
                )
              ) {
                return;
              }


              const anchorText =
                $(element)
                  .text()
                  .replace(
                    /\s+/g,
                    " "
                  )
                  .trim() ||
                null;


              evidence.push({
                url:
                  resolved,

                channel:
                  "STATIC_HTML",

                parentUrl:
                  item.url,

                anchorText,

                score:
                  scoreDiscoveredUrl(
                    resolved,
                    "STATIC_HTML",
                    anchorText
                  )
              });


              if (
                item.depth >=
                  this.maxDepth ||
                queued.has(
                  resolved
                ) ||
                !shouldTraverseAsCatalog(
                  resolved,
                  anchorText
                )
              ) {
                return;
              }


              queued.add(
                resolved
              );


              queue.push({
                url:
                  resolved,

                depth:
                  item.depth +
                  1
              });
            }
          );
      }
      catch (
        error
      ) {

        warnings.push(
          "Static traversal failed: " +
          item.url +
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
      visitedPages:
        visited,

      evidence,

      warnings
    };
  }
}
