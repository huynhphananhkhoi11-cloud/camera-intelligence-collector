import {
  load
} from "cheerio";

import {
  detectChallenge
} from "../contracts/challengeContract.js";

import type {
  ChallengeState
} from "../contracts/challengeContract.js";

import type {
  AcquisitionArtifact,
  AcquisitionBackend,
  AcquisitionContext,
  AcquisitionProbe,
  AcquisitionResult
} from "./acquisitionTypes.js";


interface StaticFetchHeaders {
  get(
    name:
      string
  ):
    string |
    null;
}


interface StaticFetchResponse {
  readonly status:
    number;

  readonly ok:
    boolean;

  readonly url:
    string;

  readonly headers:
    StaticFetchHeaders;

  text():
    Promise<
      string
    >;
}


export type StaticFetch =
  (
    input:
      string,
    init:
      RequestInit
  ) =>
    Promise<
      StaticFetchResponse
    >;


export interface StaticHttpBackendOptions {
  readonly fetchFn?:
    StaticFetch;

  readonly timeoutMs?:
    number;

  readonly maxBodyBytes?:
    number;

  readonly requestHeaders?:
    Readonly<
      Record<
        string,
        string
      >
    >;
}


interface StaticSnapshot {
  readonly requestedUrl:
    string;

  readonly finalUrl:
    string;

  readonly status:
    number;

  readonly contentType:
    string |
    null;

  readonly body:
    string;

  readonly challengeState:
    ChallengeState;
}


const DEFAULT_TIMEOUT_MS =
  20_000;


const DEFAULT_MAX_BODY_BYTES =
  5 *
  1024 *
  1024;


function createRequestSignal(
  parent:
    AbortSignal |
    undefined,
  timeoutMs:
    number
): {
  readonly signal:
    AbortSignal;

  readonly cleanup:
    () =>
      void;
} {

  const controller =
    new AbortController();


  const abortFromParent =
    () => {
      controller.abort(
        parent?.reason
      );
    };


  if (
    parent?.aborted
  ) {
    abortFromParent();
  }
  else {
    parent?.addEventListener(
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
            "Static HTTP request timed out."
          )
        );
      },
      timeoutMs
    );


  return {
    signal:
      controller.signal,

    cleanup:
      () => {
        clearTimeout(
          timer
        );

        parent?.removeEventListener(
          "abort",
          abortFromParent
        );
      }
  };
}


function normalizedContentType(
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


  return value
    .split(
      ";",
      1
    )[0]
    ?.trim()
    .toLowerCase() ??
    null;
}


function looksLikeHtml(
  contentType:
    string |
    null,
  body:
    string
): boolean {

  if (
    contentType ===
      "text/html" ||
    contentType ===
      "application/xhtml+xml"
  ) {
    return true;
  }


  const prefix =
    body
      .slice(
        0,
        2048
      )
      .toLowerCase();


  return (
    prefix.includes(
      "<!doctype html"
    ) ||
    prefix.includes(
      "<html"
    ) ||
    prefix.includes(
      "<head"
    ) ||
    prefix.includes(
      "<body"
    )
  );
}


function resolveHttpUrl(
  value:
    string |
    undefined,
  baseUrl:
    string
): string |
  null {

  if (
    value ===
      undefined ||
    value.trim().length ===
      0
  ) {
    return null;
  }


  try {

    const resolved =
      new URL(
        value,
        baseUrl
      );


    if (
      resolved.protocol !==
        "http:" &&
      resolved.protocol !==
        "https:"
    ) {
      return null;
    }


    resolved.hash = "";


    return resolved.toString();
  }
  catch {
    return null;
  }
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


export class StaticHttpBackend
implements AcquisitionBackend {

  readonly id =
    "STATIC_HTTP" as const;


  private readonly fetchFn:
    StaticFetch;


  private readonly timeoutMs:
    number;


  private readonly maxBodyBytes:
    number;


  private readonly requestHeaders:
    Readonly<
      Record<
        string,
        string
      >
    >;


  private readonly cache =
    new Map<
      string,
      StaticSnapshot
    >();


  constructor(
    options:
      StaticHttpBackendOptions = {}
  ) {

    this.fetchFn =
      options.fetchFn ??
      (
        fetch as
          StaticFetch
      );


    this.timeoutMs =
      options.timeoutMs ??
      DEFAULT_TIMEOUT_MS;


    this.maxBodyBytes =
      options.maxBodyBytes ??
      DEFAULT_MAX_BODY_BYTES;


    this.requestHeaders = {
      Accept:
        "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",

      ...options.requestHeaders
    };
  }


  async probe(
    context:
      AcquisitionContext
  ):
    Promise<
      AcquisitionProbe
    > {

    const snapshot =
      await this.getSnapshot(
        context
      );


    if (
      snapshot.challengeState ===
        "CHALLENGE_CONFIRMED"
    ) {
      return {
        backendId:
          this.id,

        status:
          "UNAVAILABLE",

        reason:
          "Human-verification challenge detected.",

        metadata: {
          status:
            snapshot.status,

          finalUrl:
            snapshot.finalUrl,

          challenge:
            snapshot.challengeState
        }
      };
    }


    if (
      snapshot.challengeState ===
        "RATE_LIMIT"
    ) {
      return {
        backendId:
          this.id,

        status:
          "UNAVAILABLE",

        reason:
          "HTTP rate limit detected.",

        metadata: {
          status:
            snapshot.status,

          finalUrl:
            snapshot.finalUrl,

          challenge:
            snapshot.challengeState
        }
      };
    }


    if (
      snapshot.status <
        200 ||
      snapshot.status >=
        300
    ) {
      return {
        backendId:
          this.id,

        status:
          "UNAVAILABLE",

        reason:
          "Static HTTP did not return a successful document.",

        metadata: {
          status:
            snapshot.status,

          finalUrl:
            snapshot.finalUrl,

          challenge:
            snapshot.challengeState
        }
      };
    }


    if (
      !looksLikeHtml(
        snapshot.contentType,
        snapshot.body
      )
    ) {
      return {
        backendId:
          this.id,

        status:
          "UNAVAILABLE",

        reason:
          "Static HTTP response is not HTML.",

        metadata: {
          status:
            snapshot.status,

          finalUrl:
            snapshot.finalUrl,

          contentType:
            snapshot.contentType
        }
      };
    }


    return {
      backendId:
        this.id,

      status:
        "AVAILABLE",

      reason:
        "Static HTML is directly accessible.",

      metadata: {
        status:
          snapshot.status,

        finalUrl:
          snapshot.finalUrl,

        contentType:
          snapshot.contentType,

        bytes:
          Buffer.byteLength(
            snapshot.body,
            "utf8"
          )
      }
    };
  }


  async acquire(
    context:
      AcquisitionContext
  ):
    Promise<
      AcquisitionResult
    > {

    const snapshot =
      await this.getSnapshot(
        context
      );


    if (
      snapshot.challengeState !==
        "NONE"
    ) {
      throw new Error(
        "Static HTTP acquisition is blocked by state: " +
        snapshot.challengeState
      );
    }


    if (
      snapshot.status <
        200 ||
      snapshot.status >=
        300
    ) {
      throw new Error(
        "Static HTTP acquisition failed with status " +
        snapshot.status
      );
    }


    if (
      !looksLikeHtml(
        snapshot.contentType,
        snapshot.body
      )
    ) {
      throw new Error(
        "Static HTTP acquisition did not return HTML."
      );
    }


    return this.parseSnapshot(
      snapshot
    );
  }


  private async getSnapshot(
    context:
      AcquisitionContext
  ):
    Promise<
      StaticSnapshot
    > {

    const cached =
      this.cache.get(
        context.rootUrl
      );


    if (
      cached
    ) {
      return cached;
    }


    const requestSignal =
      createRequestSignal(
        context.signal,
        this.timeoutMs
      );


    try {

      const response =
        await this.fetchFn(
          context.rootUrl,
          {
            method:
              "GET",

            redirect:
              "follow",

            headers:
              this.requestHeaders,

            signal:
              requestSignal.signal
          }
        );


      const contentLength =
        response.headers.get(
          "content-length"
        );


      if (
        contentLength !==
          null
      ) {

        const declaredBytes =
          Number.parseInt(
            contentLength,
            10
          );


        if (
          Number.isFinite(
            declaredBytes
          ) &&
          declaredBytes >
            this.maxBodyBytes
        ) {
          throw new Error(
            "Static HTTP response exceeds maximum body size."
          );
        }
      }


      const body =
        await response.text();


      const actualBytes =
        Buffer.byteLength(
          body,
          "utf8"
        );


      if (
        actualBytes >
          this.maxBodyBytes
      ) {
        throw new Error(
          "Static HTTP response exceeds maximum body size."
        );
      }


      const finalUrl =
        resolveHttpUrl(
          response.url,
          context.rootUrl
        ) ??
        context.rootUrl;


      const challenge =
        detectChallenge({
          status:
            response.status,

          bodyText:
            body,

          url:
            finalUrl
        });


      const snapshot:
        StaticSnapshot = {
          requestedUrl:
            context.rootUrl,

          finalUrl,

          status:
            response.status,

          contentType:
            normalizedContentType(
              response.headers.get(
                "content-type"
              )
            ),

          body,

          challengeState:
            challenge.state
        };


      this.cache.set(
        context.rootUrl,
        snapshot
      );


      return snapshot;
    }
    finally {
      requestSignal.cleanup();
    }
  }


  private parseSnapshot(
    snapshot:
      StaticSnapshot
  ):
    AcquisitionResult {

    const $ =
      load(
        snapshot.body
      );


    const warnings:
      string[] =
        [];


    const baseHref =
      $("base[href]")
        .first()
        .attr(
          "href"
        );


    const baseUrl =
      resolveHttpUrl(
        baseHref,
        snapshot.finalUrl
      ) ??
      snapshot.finalUrl;


    if (
      baseHref !==
        undefined &&
      baseUrl ===
        snapshot.finalUrl &&
      resolveHttpUrl(
        baseHref,
        snapshot.finalUrl
      ) ===
        null
    ) {
      warnings.push(
        "Ignored invalid HTML base URL."
      );
    }


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


    if (
      canonicalHref !==
        undefined &&
      canonicalUrl ===
        null
    ) {
      warnings.push(
        "Ignored invalid canonical URL."
      );
    }


    const documentOrigin =
      new URL(
        snapshot.finalUrl
      ).origin;


    const pageLinks:
      string[] =
        [];


    $("a[href]")
      .each(
        (
          _,
          element
        ) => {

          const resolved =
            resolveHttpUrl(
              $(element)
                .attr(
                  "href"
                ),
              baseUrl
            );


          if (
            resolved ===
              null
          ) {
            return;
          }


          if (
            new URL(
              resolved
            ).origin !==
              documentOrigin
          ) {
            return;
          }


          pageLinks.push(
            resolved
          );
        }
      );


    const scriptUrls:
      string[] =
        [];


    $("script[src]")
      .each(
        (
          _,
          element
        ) => {

          const resolved =
            resolveHttpUrl(
              $(element)
                .attr(
                  "src"
                ),
              baseUrl
            );


          if (
            resolved !==
              null
          ) {
            scriptUrls.push(
              resolved
            );
          }
        }
      );


    const artifacts:
      AcquisitionArtifact[] = [
        {
          backendId:
            this.id,

          kind:
            "HTML",

          url:
            snapshot.finalUrl,

          status:
            snapshot.status,

          contentType:
            snapshot.contentType,

          body:
            snapshot.body,

          metadata: {
            requestedUrl:
              snapshot.requestedUrl,

            finalUrl:
              snapshot.finalUrl
          }
        }
      ];


    $('script[type="application/ld+json"]')
      .each(
        (
          index,
          element
        ) => {

          artifacts.push({
            backendId:
              this.id,

            kind:
              "JSON",

            url:
              snapshot.finalUrl,

            status:
              snapshot.status,

            contentType:
              "application/ld+json",

            body:
              $(element)
                .html() ??
              "",

            metadata: {
              locator:
                "script[type=application/ld+json]",

              index
            }
          });
        }
      );


    const uniquePageLinks =
      uniqueInOrder(
        pageLinks
      );


    return {
      backendId:
        this.id,

      artifacts,

      discoveredUrls:
        uniquePageLinks,

      warnings,

      complete:
        true,

      hints: {
        canonicalUrl,
        baseUrl,
        pageLinks:
          uniquePageLinks,
        scriptUrls:
          uniqueInOrder(
            scriptUrls
          ),
        jsonLdCount:
          artifacts.length -
          1
      }
    };
  }
}
