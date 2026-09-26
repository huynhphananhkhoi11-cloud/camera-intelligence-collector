import {
  canonicalizeUrl
} from "./urlPolicy.js";


export type ProductUrlEvidenceSource =
  | "JSON_LD_PRODUCT"
  | "JSON_LD_ITEM_LIST"
  | "API_ITEM"
  | "REPEATED_CARD"
  | "PRICE_LINK"
  | "CTA_LINK"
  | "IMAGE_LINK"
  | "SITEMAP_PATTERN"
  | "PAGINATION"
  | "ROOT";


export interface ProductUrlEvidence {
  source:
    ProductUrlEvidenceSource;

  parentUrl:
    string | null;

  detail:
    string | null;

  weight:
    number;
}


export type ProductUrlState =
  "DISCOVERED";


export interface ProductUrlNode {
  url:
    string;

  aliases:
    string[];

  productId:
    string | null;

  score:
    number;

  evidence:
    ProductUrlEvidence[];

  parentUrls:
    string[];

  state:
    ProductUrlState;
}


export interface AddProductUrlInput {
  source:
    ProductUrlEvidenceSource;

  parentUrl?: string | null;

  detail?: string | null;

  weight?: number;

  productId?: string | number | null;
}


function normalizeProductId(
  value:
    string |
    number |
    null |
    undefined
): string | null {

  if (
    value ===
    null ||
    value ===
    undefined
  ) {
    return null;
  }

  const normalized =
    String(value)
      .trim();

  return normalized
    ? normalized
    : null;
}


function isUtilityUrl(
  rawUrl: string
): boolean {

  try {

    const url =
      new URL(rawUrl);

    return /\/(?:cart|gio-hang|checkout|login|dang-nhap|register|account|search|tim-kiem|contact|lien-he)(?:\/|$)/i
      .test(url.pathname);

  }
  catch {
    return true;
  }
}


function evidenceKey(
  evidence:
    ProductUrlEvidence
): string {

  return [
    evidence.source,
    evidence.parentUrl ?? "",
    evidence.detail ?? ""
  ].join("|");
}


export class ProductUrlGraph {

  private readonly origin:
    string;

  private readonly nodesByUrl =
    new Map<
      string,
      ProductUrlNode
    >();

  private readonly nodesByProductId =
    new Map<
      string,
      ProductUrlNode
    >();


  constructor(
    canonicalOrigin: string
  ) {

    this.origin =
      new URL(
        canonicalOrigin
      ).origin;
  }


  get size(): number {

    return new Set(
      this.nodesByUrl.values()
    ).size;
  }


  addCandidate(
    rawUrl: string,
    input:
      AddProductUrlInput
  ): ProductUrlNode | null {

    const baseUrl =
      input.parentUrl ??
      this.origin;

    const canonical =
      canonicalizeUrl(
        rawUrl,
        baseUrl
      );

    if (!canonical) {
      return null;
    }


    let parsed:
      URL;

    try {
      parsed =
        new URL(canonical);
    }
    catch {
      return null;
    }


    if (
      parsed.origin !==
      this.origin
    ) {
      return null;
    }


    if (
      isUtilityUrl(
        canonical
      )
    ) {
      return null;
    }


    const productId =
      normalizeProductId(
        input.productId
      );


    let node =
      this.nodesByUrl.get(
        canonical
      );


    if (
      !node &&
      productId
    ) {

      node =
        this.nodesByProductId.get(
          productId
        );
    }


    if (!node) {

      node = {
        url:
          canonical,

        aliases:
          [],

        productId,

        score:
          0,

        evidence:
          [],

        parentUrls:
          [],

        state:
          "DISCOVERED"
      };
    }


    if (
      canonical !==
      node.url &&
      !node.aliases.includes(
        canonical
      )
    ) {

      node.aliases.push(
        canonical
      );
    }


    this.nodesByUrl.set(
      canonical,
      node
    );

    this.nodesByUrl.set(
      node.url,
      node
    );


    if (
      productId &&
      !node.productId
    ) {
      node.productId =
        productId;
    }


    if (
      node.productId
    ) {

      this.nodesByProductId.set(
        node.productId,
        node
      );
    }


    let parentUrl:
      string | null =
      null;


    if (
      input.parentUrl
    ) {

      parentUrl =
        canonicalizeUrl(
          input.parentUrl,
          this.origin
        );

      if (
        parentUrl &&
        !node.parentUrls.includes(
          parentUrl
        )
      ) {

        node.parentUrls.push(
          parentUrl
        );
      }
    }


    const evidence:
      ProductUrlEvidence = {

      source:
        input.source,

      parentUrl,

      detail:
        input.detail ??
        null,

      weight:
        input.weight ??
        50
    };


    const key =
      evidenceKey(
        evidence
      );


    const exists =
      node.evidence.some(
        item =>
          evidenceKey(item) ===
          key
      );


    if (!exists) {

      node.evidence.push(
        evidence
      );

      node.score =
        Math.min(
          100,
          node.score +
          Math.max(
            0,
            evidence.weight
          )
        );
    }


    return node;
  }


  get(
    rawUrl: string
  ): ProductUrlNode | null {

    const canonical =
      canonicalizeUrl(
        rawUrl,
        this.origin
      );

    if (!canonical) {
      return null;
    }

    return (
      this.nodesByUrl.get(
        canonical
      ) ??
      null
    );
  }


  values():
    ProductUrlNode[] {

    return Array.from(
      new Set(
        this.nodesByUrl.values()
      )
    )
      .sort(
        (a, b) => {

          if (
            b.score !==
            a.score
          ) {
            return (
              b.score -
              a.score
            );
          }

          return a.url.localeCompare(
            b.url
          );
        }
      );
  }
}