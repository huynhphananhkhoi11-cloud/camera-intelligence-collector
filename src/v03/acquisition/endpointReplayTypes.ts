export interface EndpointCandidate {
  readonly candidateId:
    string;

  readonly familyKey:
    string;

  readonly familyCount:
    number;

  readonly url:
    string;

  readonly method:
    string;

  readonly requestContentType:
    string |
    null;

  readonly requestBody:
    string |
    null;

  readonly responseContentType:
    string |
    null;

  readonly responseBodyPreview:
    string |
    null;

  readonly score:
    number;

  readonly reasons:
    readonly string[];

  readonly replayable:
    boolean;
}


export interface EndpointQualificationResult {
  readonly candidates:
    readonly EndpointCandidate[];

  readonly qualified:
    readonly EndpointCandidate[];
}


export interface EndpointReplayRequest {
  readonly candidateId:
    string;

  readonly url:
    string;

  readonly method:
    "GET" |
    "POST";

  readonly contentType:
    string |
    null;

  readonly body:
    string |
    null;

  readonly reason:
    string;
}


export interface EndpointReplayResponse {
  readonly request:
    EndpointReplayRequest;

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
    "NONE" |
    "RATE_LIMIT" |
    "FORBIDDEN" |
    "CHALLENGE_CONFIRMED";
}


export interface PaginationMutation {
  readonly location:
    "QUERY" |
    "BODY";

  readonly key:
    string;

  readonly currentValue:
    number;

  readonly nextValue:
    number;
}


export interface ReplayDiscoveryResult {
  readonly candidate:
    EndpointCandidate;

  readonly requests:
    readonly EndpointReplayRequest[];

  readonly responses:
    readonly EndpointReplayResponse[];

  readonly discoveredUrls:
    readonly string[];

  readonly warnings:
    readonly string[];
}


export interface EndpointDiscoveryRun {
  readonly qualifiedCandidateCount:
    number;

  readonly replayedCandidateCount:
    number;

  readonly discoveries:
    readonly ReplayDiscoveryResult[];

  readonly discoveredUrls:
    readonly string[];

  readonly warnings:
    readonly string[];
}
