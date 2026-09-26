export type ReconResourceType =
  | "xhr"
  | "fetch";


export interface NetworkExchange {
  readonly sequence:
    number;

  readonly url:
    string;

  readonly method:
    string;

  readonly resourceType:
    ReconResourceType;

  readonly requestContentType:
    string |
    null;

  readonly requestBodyRedacted:
    string |
    null;

  readonly status:
    number |
    null;

  readonly responseContentType:
    string |
    null;

  readonly responseBodyPreview:
    string |
    null;

  readonly responseBodyTruncated:
    boolean;

  readonly failed:
    boolean;

  readonly failureText:
    string |
    null;
}


export interface NetworkReconSnapshot {
  readonly rootUrl:
    string;

  readonly finalPageUrl:
    string;

  readonly exchanges:
    readonly NetworkExchange[];

  readonly observationWindowMs:
    number;
}


export interface NetworkReconHealth {
  readonly available:
    boolean;

  readonly reason:
    string;
}


export interface NetworkReconRuntime {
  probe(
    signal?:
      AbortSignal
  ):
    Promise<
      NetworkReconHealth
    >;

  observe(
    rootUrl:
      string,
    signal?:
      AbortSignal
  ):
    Promise<
      NetworkReconSnapshot
    >;
}


export interface NetworkReconBackendOptions {
  readonly runtime?:
    NetworkReconRuntime;
}
