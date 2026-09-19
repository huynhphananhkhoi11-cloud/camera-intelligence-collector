export type ProductIdentityTokenKind =
  | "CANONICAL"
  | "STRUCTURED_ID"
  | "STRUCTURED_URL"
  | "SKU"
  | "PRODUCT_ID"
  | "REQUESTED_URL";


export interface ProductIdentityToken {
  readonly kind:
    ProductIdentityTokenKind;

  readonly value:
    string;

  readonly token:
    string;
}


export interface DetailIdentitySignals {
  readonly requestedUrl:
    string;

  readonly finalUrl:
    string;

  readonly canonicalUrl:
    string |
    null;

  readonly structuredProductId:
    string |
    null;

  readonly sku:
    string |
    null;

  readonly productId:
    string |
    null;

  readonly structuredProductUrl:
    string |
    null;

  readonly productObjectCount:
    number;

  readonly primaryProductSelection:
    "MATCHED_URL" |
    "SINGLE_PRODUCT" |
    "NONE";
}


export interface ProductIdentityRecord {
  readonly requestedUrl:
    string;

  readonly signals:
    DetailIdentitySignals;

  readonly tokens:
    readonly ProductIdentityToken[];
}


export interface ProductIdentityCluster {
  readonly identityId:
    string;

  readonly memberUrls:
    readonly string[];

  readonly tokens:
    readonly ProductIdentityToken[];

  readonly records:
    readonly ProductIdentityRecord[];
}


export interface ProductIdentityResolution {
  readonly clusters:
    readonly ProductIdentityCluster[];

  readonly byRequestedUrl:
    Readonly<
      Record<
        string,
        string
      >
    >;
}
