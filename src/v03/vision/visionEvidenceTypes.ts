import type {
  ObservationOwnership,
  ObservationSourceKind
} from "../contracts/observationContract.js";


export interface VisionEvidenceItem {
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

  readonly locator?:
    string |
    null;

  readonly context?:
    string |
    null;

  readonly ownershipHint?:
    ObservationOwnership |
    null;
}


export interface ProductRegionScreenshot {
  readonly imageId:
    string;

  readonly mimeType:
    "image/png";

  readonly base64:
    string;

  readonly width:
    number;

  readonly height:
    number;

  readonly selectorUsed:
    string |
    null;

  readonly fallback:
    boolean;
}


export interface VisionEvidencePacket {
  readonly packetId:
    string;

  readonly sourceEvidencePacketId:
    string;

  readonly pageUrl:
    string;

  readonly finalUrl:
    string;

  readonly productIdentity:
    string;

  readonly productRegionScreenshot:
    ProductRegionScreenshot;

  readonly compactDomEvidence:
    readonly VisionEvidenceItem[];

  readonly selectedControls:
    readonly VisionEvidenceItem[];

  readonly structuredFacts:
    readonly VisionEvidenceItem[];
}
