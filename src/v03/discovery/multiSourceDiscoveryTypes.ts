import type {
  AdaptiveEndpointDiscoveryResult
} from "../acquisition/endpointReplayTypes.js";


export type DiscoveryChannel =
  | "STATIC_HTML"
  | "SITEMAP"
  | "ENDPOINT_REPLAY"
  | "RENDERED_DOM";


export interface UrlDiscoveryEvidence {
  readonly url:
    string;

  readonly channel:
    DiscoveryChannel;

  readonly parentUrl:
    string |
    null;

  readonly anchorText:
    string |
    null;

  readonly score:
    number;
}


export interface StaticTraversalResult {
  readonly visitedPages:
    readonly string[];

  readonly evidence:
    readonly UrlDiscoveryEvidence[];

  readonly warnings:
    readonly string[];
}


export interface SitemapDiscoveryResult {
  readonly sitemapDocuments:
    readonly string[];

  readonly evidence:
    readonly UrlDiscoveryEvidence[];

  readonly warnings:
    readonly string[];
}


export interface RenderedDomDiscoveryResult {
  readonly used:
    boolean;

  readonly evidence:
    readonly UrlDiscoveryEvidence[];

  readonly warnings:
    readonly string[];
}


export interface MultiSourceDiscoveryResult
extends AdaptiveEndpointDiscoveryResult {
  readonly staticTraversal:
    StaticTraversalResult;

  readonly sitemap:
    SitemapDiscoveryResult;

  readonly renderedDom:
    RenderedDomDiscoveryResult;

  readonly evidence:
    readonly UrlDiscoveryEvidence[];

  readonly allDiscoveredUrls:
    readonly string[];

  readonly channelCounts:
    Readonly<
      Record<
        DiscoveryChannel,
        number
      >
    >;
}
