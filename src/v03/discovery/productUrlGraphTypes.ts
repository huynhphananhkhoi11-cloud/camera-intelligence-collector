export type DiscoverySourceKind =
  | "STATIC_HTML"
  | "NETWORK_RECON"
  | "ENDPOINT_REPLAY"
  | "RENDERED_DOM"
  | "DETAIL_PAGE"
  | "OTHER";


export type DiscoveryOwnerKind =
  | "ROOT_DOCUMENT"
  | "LISTING"
  | "PRODUCT_DETAIL"
  | "ENDPOINT_RESPONSE"
  | "UNKNOWN";


export type DiscoveryRelation =
  | "CANDIDATE_LINK"
  | "PRODUCT_LINK"
  | "PAGINATION"
  | "RELATED_PRODUCT"
  | "NAVIGATION"
  | "UNKNOWN";


export interface ProductUrlEvidence {
  readonly url:
    string;

  readonly parentUrl:
    string |
    null;

  readonly sourceKind:
    DiscoverySourceKind;

  readonly ownerKind:
    DiscoveryOwnerKind;

  readonly relation:
    DiscoveryRelation;

  readonly sourceRef?:
    string |
    null;

  readonly metadata?:
    Readonly<
      Record<
        string,
        string |
        number |
        boolean |
        null
      >
    >;
}


export interface ProductUrlGraphNode {
  readonly url:
    string;

  readonly evidence:
    readonly ProductUrlEvidence[];
}


export interface ProductUrlGraphSnapshot {
  readonly nodes:
    readonly ProductUrlGraphNode[];
}


export type DiscoveryTraversalDecision =
  | "DETAIL_CANDIDATE"
  | "FOLLOW_LISTING_PAGINATION"
  | "DO_NOT_TRAVERSE";
