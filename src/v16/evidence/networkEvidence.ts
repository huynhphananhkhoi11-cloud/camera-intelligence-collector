export type NetworkEvidencePriority =
  | "high"
  | "normal"
  | "low";

export type NetworkJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly NetworkJsonValue[]
  | {
      readonly [key: string]:
        NetworkJsonValue;
    };

export type NetworkEvidenceBody =
  | {
      readonly kind:
        "json";
      readonly value:
        NetworkJsonValue;
      readonly topLevelKeys:
        readonly string[];
      readonly arrayLength:
        number | null;
    }
  | {
      readonly kind:
        "text";
      readonly text:
        string;
    };

export interface NetworkEvidenceEntry {
  readonly responseUrl:
    string;
  readonly requestMethod:
    string | null;
  readonly status:
    number;
  readonly contentType:
    string | null;
  readonly resourceType:
    "fetch" | "xhr";
  readonly contextUrl:
    string | null;
  readonly body:
    NetworkEvidenceBody;
  readonly bodyBytes:
    number;
  readonly bodySha256:
    string;
  readonly priority:
    NetworkEvidencePriority;
  readonly duplicateCount:
    number;
}

export interface NetworkEvidenceStats {
  readonly observedResponses:
    number;
  readonly capturedResponses:
    number;
  readonly ignoredNonFetchXhr:
    number;
  readonly ignoredTelemetry:
    number;
  readonly ignoredBinary:
    number;
  readonly ignoredOversized:
    number;
  readonly ignoredObservationCap:
    number;
  readonly ignoredCaptureCap:
    number;
  readonly bodyReadErrors:
    number;
  readonly bodyReadTimeouts:
    number;
  readonly parseErrors:
    number;
  readonly deduplicated:
    number;
}

export interface NetworkEvidenceLimits {
  readonly maxObservedResponses:
    number;
  readonly maxCapturedResponses:
    number;
  readonly maxBodyBytes:
    number;
  readonly maxTextBytes:
    number;
  readonly maxTotalBodyBytes:
    number;
  readonly inspectionTimeoutMs:
    number;
  readonly reloadTimeoutMs:
    number;
  readonly observationWindowMs:
    number;
  readonly perResponseTimeoutMs:
    number;
}

export interface NetworkEvidenceBundle {
  readonly pageUrl:
    string;
  readonly finalUrl:
    string;
  readonly reloadCount:
    1;
  readonly reloadErrorCode:
    "TIMEOUT" | "RELOAD_FAILED" | null;
  readonly entries:
    readonly NetworkEvidenceEntry[];
  readonly stats:
    NetworkEvidenceStats;
  readonly limits:
    NetworkEvidenceLimits;
}
