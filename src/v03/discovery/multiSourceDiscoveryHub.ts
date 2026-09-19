import {
  AdaptiveEndpointDiscovery
} from "../acquisition/adaptiveEndpointDiscovery.js";

import type {
  AdaptiveEndpointDiscoveryOptions
} from "../acquisition/adaptiveEndpointDiscovery.js";

import {
  RenderedDomDiscovery
} from "./renderedDomDiscovery.js";

import type {
  RenderedDomRuntime
} from "./renderedDomDiscovery.js";

import {
  SitemapDiscovery
} from "./sitemapDiscovery.js";

import type {
  SitemapDiscoveryOptions
} from "./sitemapDiscovery.js";

import {
  StaticTraversalDiscovery
} from "./staticTraversalDiscovery.js";

import type {
  StaticTraversalOptions
} from "./staticTraversalDiscovery.js";

import type {
  DiscoveryChannel,
  MultiSourceDiscoveryResult,
  UrlDiscoveryEvidence
} from "./multiSourceDiscoveryTypes.js";

import {
  scoreDiscoveredUrl
} from "./urlDiscoveryScoring.js";


export interface MultiSourceDiscoveryHubOptions {
  readonly endpoint?:
    AdaptiveEndpointDiscoveryOptions;

  readonly supplementalEnabled?:
    boolean;

  readonly staticTraversal?:
    StaticTraversalOptions;

  readonly sitemap?:
    SitemapDiscoveryOptions;

  readonly renderedRuntime?:
    RenderedDomRuntime;

  readonly renderedFallbackThreshold?:
    number;

  readonly maxCandidates?:
    number;
}


const DEFAULT_RENDERED_FALLBACK_THRESHOLD =
  25;


const DEFAULT_MAX_CANDIDATES =
  10_000;


function normalizeUrl(
  value:
    string
): string |
  null {

  try {

    const url =
      new URL(
        value
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


function endpointEvidence(
  rootUrl:
    string,
  urls:
    readonly string[]
): UrlDiscoveryEvidence[] {

  return urls.map(
    url => ({
      url,

      channel:
        "ENDPOINT_REPLAY",

      parentUrl:
        rootUrl,

      anchorText:
        null,

      score:
        scoreDiscoveredUrl(
          url,
          "ENDPOINT_REPLAY"
        )
    })
  );
}


function promisingUrlCount(
  evidence:
    readonly UrlDiscoveryEvidence[]
): number {

  return new Set(
    evidence
      .filter(
        item =>
          item.score >=
            40
      )
      .map(
        item =>
          item.url
      )
  ).size;
}


function mergeEvidence(
  evidence:
    readonly UrlDiscoveryEvidence[],
  maxCandidates:
    number
): {
  readonly evidence:
    readonly UrlDiscoveryEvidence[];

  readonly urls:
    readonly string[];

  readonly channelCounts:
    Readonly<
      Record<
        DiscoveryChannel,
        number
      >
    >;
} {

  const normalizedEvidence:
    UrlDiscoveryEvidence[] =
      [];


  const perUrl =
    new Map<
      string,
      {
        readonly firstIndex:
          number;

        score:
          number;
      }
    >();


  for (
    const item
    of evidence
  ) {

    const normalized =
      normalizeUrl(
        item.url
      );


    if (
      normalized ===
        null
    ) {
      continue;
    }


    const next = {
      ...item,
      url:
        normalized
    };


    normalizedEvidence.push(
      next
    );


    const existing =
      perUrl.get(
        normalized
      );


    if (
      existing
    ) {
      existing.score =
        Math.max(
          existing.score,
          item.score
        );
    }
    else {
      perUrl.set(
        normalized,
        {
          firstIndex:
            normalizedEvidence.length -
            1,

          score:
            item.score
        }
      );
    }
  }


  const urls =
    Array.from(
      perUrl.entries()
    )
      .sort(
        (
          left,
          right
        ) =>
          (
            right[1].score -
            left[1].score
          ) ||
          (
            left[1].firstIndex -
            right[1].firstIndex
          )
      )
      .slice(
        0,
        maxCandidates
      )
      .map(
        entry =>
          entry[0]
      );


  const channelCounts:
    Record<
      DiscoveryChannel,
      number
    > = {
    STATIC_HTML:
      0,
    SITEMAP:
      0,
    ENDPOINT_REPLAY:
      0,
    RENDERED_DOM:
      0
  };


  for (
    const channel
    of Object.keys(
      channelCounts
    ) as
      DiscoveryChannel[]
  ) {

    channelCounts[
      channel
    ] =
      new Set(
        normalizedEvidence
          .filter(
            item =>
              item.channel ===
                channel
          )
          .map(
            item =>
              item.url
          )
      ).size;
  }


  return {
    evidence:
      normalizedEvidence,

    urls,

    channelCounts
  };
}


export class MultiSourceDiscoveryHub {
  private readonly endpoint:
    AdaptiveEndpointDiscovery;


  private readonly staticTraversal:
    StaticTraversalDiscovery;


  private readonly sitemap:
    SitemapDiscovery;


  private readonly renderedDom:
    RenderedDomDiscovery;


  private readonly supplementalEnabled:
    boolean;


  private readonly renderedFallbackThreshold:
    number;


  private readonly maxCandidates:
    number;


  constructor(
    options:
      MultiSourceDiscoveryHubOptions = {}
  ) {

    this.endpoint =
      new AdaptiveEndpointDiscovery(
        options.endpoint
      );


    this.staticTraversal =
      new StaticTraversalDiscovery(
        options.staticTraversal
      );


    this.sitemap =
      new SitemapDiscovery(
        options.sitemap
      );


    this.renderedDom =
      new RenderedDomDiscovery(
        options.renderedRuntime
      );


    this.supplementalEnabled =
      options.supplementalEnabled ??
      true;


    this.renderedFallbackThreshold =
      options.renderedFallbackThreshold ??
      DEFAULT_RENDERED_FALLBACK_THRESHOLD;


    this.maxCandidates =
      options.maxCandidates ??
      DEFAULT_MAX_CANDIDATES;
  }


  async discover(
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      MultiSourceDiscoveryResult
    > {

    const endpoint =
      await this.endpoint.discover(
        rootUrl,
        signal
      );


    const effectiveRootUrl =
      endpoint.recon.finalPageUrl ||
      rootUrl;


    const [
      staticTraversal,
      sitemap
    ] =
      this.supplementalEnabled
        ? await Promise.all([
            this.staticTraversal.discover(
              effectiveRootUrl,
              signal
            ),

            this.sitemap.discover(
              effectiveRootUrl,
              signal
            )
          ])
        : [
            {
              visitedPages:
                [],
              evidence:
                [],
              warnings:
                []
            },
            {
              sitemapDocuments:
                [],
              evidence:
                [],
              warnings:
                []
            }
          ];


    const baseEvidence = [
      ...staticTraversal.evidence,
      ...sitemap.evidence,
      ...endpointEvidence(
        effectiveRootUrl,
        endpoint.replay.discoveredUrls
      )
    ];


    const shouldUseRendered =
      this.supplementalEnabled &&
      promisingUrlCount(
        baseEvidence
      ) <
      this.renderedFallbackThreshold;


    const renderedDom =
      shouldUseRendered
        ? await this.renderedDom.discover(
            effectiveRootUrl,
            signal
          )
        : {
            used:
              false,
            evidence:
              [],
            warnings:
              []
          };


    const merged =
      mergeEvidence(
        [
          ...baseEvidence,
          ...renderedDom.evidence
        ],
        this.maxCandidates
      );


    return {
      ...endpoint,

      staticTraversal,

      sitemap,

      renderedDom,

      evidence:
        merged.evidence,

      allDiscoveredUrls:
        merged.urls,

      channelCounts:
        merged.channelCounts
    };
  }
}
