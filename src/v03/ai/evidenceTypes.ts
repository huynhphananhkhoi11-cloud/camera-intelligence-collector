import type {
  ObservationOwnership,
  ObservationSourceKind
} from "../contracts/observationContract.js";


export interface EvidenceBox {
  readonly x:
    number;

  readonly y:
    number;

  readonly w:
    number;

  readonly h:
    number;
}


export interface EvidenceItem {
  readonly id:
    string;

  readonly fieldHint:
    string;

  readonly rawValue:
    string;

  readonly normalizedValue?:
    string |
    number |
    boolean |
    null;

  readonly sourceKind:
    ObservationSourceKind;

  readonly sourceUrl:
    string;

  readonly locator?:
    string |
    null;

  readonly context?:
    string |
    null;

  readonly ownershipHint?:
    ObservationOwnership |
    null;

  readonly bbox?:
    EvidenceBox;

  readonly confidence?:
    number;
}


export interface VisualEvidence {
  readonly imageId:
    string;

  readonly kind:
    "PRIMARY_PRODUCT_VIEWPORT";

  readonly mimeType:
    "image/png" |
    "image/jpeg" |
    "image/webp";

  readonly base64:
    string;

  readonly width:
    number;

  readonly height:
    number;
}


export interface ControlSnapshot {
  readonly kind:
    string;

  readonly label:
    string;

  readonly value:
    string;

  readonly selected:
    boolean;
}


export interface EvidencePacket {
  readonly packetId:
    string;

  readonly pageUrl:
    string;

  readonly finalUrl:
    string;

  readonly productIdentity:
    string;

  readonly primaryRegionText:
    string;

  readonly allEvidence:
    readonly EvidenceItem[];

  readonly titleCandidates:
    readonly EvidenceItem[];

  readonly breadcrumbs:
    readonly EvidenceItem[];

  readonly moneyCandidates:
    readonly EvidenceItem[];

  readonly conditionCandidates:
    readonly EvidenceItem[];

  readonly stockCandidates:
    readonly EvidenceItem[];

  readonly ratingCandidates:
    readonly EvidenceItem[];

  readonly reviewCandidates:
    readonly EvidenceItem[];

  readonly specCandidates:
    readonly EvidenceItem[];

  readonly variantCandidates:
    readonly EvidenceItem[];

  readonly selectedControls:
    readonly EvidenceItem[];

  readonly structuredFacts:
    readonly EvidenceItem[];

  readonly evidenceBoard?:
    VisualEvidence;
}
