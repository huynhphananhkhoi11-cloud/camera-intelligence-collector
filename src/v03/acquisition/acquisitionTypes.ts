export type AcquisitionBackendId =
  | "STATIC_HTTP"
  | "NETWORK_RECON"
  | "ENDPOINT_REPLAY"
  | "BROWSER_RENDERED"
  | (string & {});


export type AcquisitionProbeStatus =
  | "AVAILABLE"
  | "UNAVAILABLE"
  | "ERROR";


export interface AcquisitionContext {
  readonly rootUrl:
    string;

  readonly signal?:
    AbortSignal;
}


export interface AcquisitionProbe {
  readonly backendId:
    AcquisitionBackendId;

  readonly status:
    AcquisitionProbeStatus;

  readonly reason:
    string;

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


export type AcquisitionArtifactKind =
  | "HTML"
  | "JSON"
  | "TEXT"
  | "BINARY_REF";


export interface AcquisitionArtifact {
  readonly backendId:
    AcquisitionBackendId;

  readonly kind:
    AcquisitionArtifactKind;

  readonly url:
    string;

  readonly status?:
    number;

  readonly contentType?:
    string |
    null;

  readonly body?:
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


export interface AcquisitionResult {
  readonly backendId:
    AcquisitionBackendId;

  readonly artifacts:
    readonly AcquisitionArtifact[];

  readonly discoveredUrls:
    readonly string[];

  readonly warnings:
    readonly string[];

  readonly complete:
    boolean;
}


export interface AcquisitionBackend {
  readonly id:
    AcquisitionBackendId;

  probe(
    context:
      AcquisitionContext
  ):
    Promise<
      AcquisitionProbe
    >;

  acquire(
    context:
      AcquisitionContext
  ):
    Promise<
      AcquisitionResult
    >;
}


export interface AcquisitionAttempt {
  readonly backendId:
    AcquisitionBackendId;

  readonly phase:
    "PROBE" |
    "ACQUIRE";

  readonly outcome:
    "SUCCESS" |
    "SKIPPED" |
    "FAILED";

  readonly reason:
    string;
}


export interface AcquisitionRunResult {
  readonly result:
    AcquisitionResult;

  readonly attempts:
    readonly AcquisitionAttempt[];
}


export interface AcquisitionDoctorReport {
  readonly rootUrl:
    string;

  readonly probes:
    readonly AcquisitionProbe[];

  readonly recommendedBackend:
    AcquisitionBackendId |
    null;
}
