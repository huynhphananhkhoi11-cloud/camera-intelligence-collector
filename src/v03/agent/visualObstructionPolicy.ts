import type {
  AISemanticDecision,
  SemanticValidationResult
} from "../ai/semanticContracts.js";

import type {
  EvidenceItem,
  EvidencePacket
} from "../ai/evidenceTypes.js";

import type {
  VisionEvidenceItem,
  VisionEvidencePacket
} from "../vision/visionEvidenceTypes.js";


export interface VisualObstructionAssessment {
  readonly visualObstruction:
    boolean;

  readonly strongCameraEvidence:
    boolean;

  readonly clearNonCameraEvidence:
    boolean;

  readonly entityGroundingInsufficient:
    boolean;

  readonly blockNonCamera:
    boolean;

  readonly reason:
    string |
    null;
}


function normalize(
  value:
    string
): string {

  return value
    .normalize(
      "NFD"
    )
    .replace(
      /\p{M}+/gu,
      ""
    )
    .replace(
      /đ/giu,
      "d"
    )
    .toLowerCase()
    .replace(
      /\s+/gu,
      " "
    )
    .trim();
}


function itemSearchText(
  item:
    Pick<
      EvidenceItem,
      "fieldHint" |
      "rawValue" |
      "locator" |
      "context"
    >
): string {

  return normalize(
    [
      item.fieldHint,
      item.rawValue,
      item.locator,
      item.context
    ]
      .filter(
        (
          value
        ): value is
          string =>
            typeof value ===
              "string" &&
            value.length >
              0
      )
      .join(
        " "
      )
  );
}


export function isVisualObstructionNoise(
  item:
    VisionEvidenceItem |
    EvidenceItem
): boolean {

  if (
    item.ownershipHint ===
      "PAGE_CHROME"
  ) {
    return true;
  }


  const locationText =
    normalize(
      [
        item.locator,
        item.context
      ]
        .filter(
          (
            value
          ): value is
            string =>
              typeof value ===
                "string" &&
              value.length >
                0
        )
        .join(
          " "
        )
    );


  if (
    /(?:popup|modal|overlay|coupon|voucher|newsletter|subscribe|cookie[-_ ]?banner|promo[-_ ]?popup|promotion[-_ ]?popup)/iu.test(
      locationText
    )
  ) {
    return true;
  }


  if (
    item.ownershipHint !==
      "PRIMARY_PRODUCT" &&
    /(?:nhan uu dai|dang ky nhan tin|newsletter|subscribe now|claim offer|voucher|coupon)/iu.test(
      normalize(
        item.rawValue
      )
    )
  ) {
    return true;
  }


  return false;
}


export function filterVisualObstructionNoise(
  items:
    readonly VisionEvidenceItem[]
): VisionEvidenceItem[] {

  return items.filter(
    item =>
      !isVisualObstructionNoise(
        item
      )
  );
}


function sourceEvidence(
  packet:
    EvidencePacket
): EvidenceItem[] {

  const value =
    (
      packet as {
        readonly allEvidence?:
          unknown;
      }
    ).allEvidence;


  return Array.isArray(
    value
  )
    ? value as EvidenceItem[]
    : [];
}


function isEntityEvidenceCandidate(
  item:
    EvidenceItem
): boolean {

  if (
    isVisualObstructionNoise(
      item
    )
  ) {
    return false;
  }


  const field =
    normalize(
      item.fieldHint
    );


  return [
    "product",
    "product_name",
    "category",
    "breadcrumb",
    "description",
    "specs"
  ].includes(
    field
  ) ||
    [
      "JSON_LD",
      "MICRODATA",
      "META"
    ].includes(
      String(
        item.sourceKind
      )
    );
}


function hasCameraBodyCue(
  value:
    string
): boolean {

  const text =
    normalize(
      value
    );


  return /(?:\bcamera\b|\bmay anh\b|\bbody\b|\bmirrorless\b|\bdslr\b|\bcanon eos\b|\bsony alpha\b|\bsony a[1679]\b|\bnikon z\s?\d|\bnikon d\s?\d|\bfujifilm x[- ]|\bfujifilm gfx\b|\blumix\b|\bom system\b|\bolympus om\b|\bricoh gr\b)/iu.test(
    text
  );
}


function hasClearNonCameraCue(
  value:
    string
): boolean {

  const text =
    normalize(
      value
    );


  if (
    /(?:\blens\b|\bong kinh\b)/iu.test(
      text
    )
  ) {
    return true;
  }


  if (
    /\b\d{1,3}(?:-\d{1,3})?\s*mm\b/iu.test(
      text
    ) &&
    /\bf\s*\/?\s*\d(?:[.,]\d+)?\b/iu.test(
      text
    )
  ) {
    return true;
  }


  return /(?:\bblog\b|\bworkshop\b|\barticle\b|\bnews\b|\btin tuc\b|\bbai viet\b|\bsu kien\b|\bevent\b)/iu.test(
    text
  );
}


function visualEvidence(
  packet:
    VisionEvidencePacket
): VisionEvidenceItem[] {

  const values:
    VisionEvidenceItem[] =
      [];


  for (
    const candidate
    of [
      (
        packet as {
          readonly compactDomEvidence?:
            unknown;
        }
      ).compactDomEvidence,
      (
        packet as {
          readonly selectedControls?:
            unknown;
        }
      ).selectedControls,
      (
        packet as {
          readonly structuredFacts?:
            unknown;
        }
      ).structuredFacts
    ]
  ) {
    if (
      Array.isArray(
        candidate
      )
    ) {
      values.push(
        ...candidate as
          VisionEvidenceItem[]
      );
    }
  }


  return values;
}


function screenshotFallback(
  packet:
    VisionEvidencePacket
): boolean {

  return (
    packet as {
      readonly productRegionScreenshot?:
        {
          readonly fallback?:
            unknown;
        };
    }
  ).productRegionScreenshot
    ?.fallback ===
      true;
}


function decisionEvidenceIds(
  decision:
    AISemanticDecision
): readonly string[] {

  const ids =
    (
      decision.entity as {
        readonly evidenceIds?:
          unknown;
      }
    ).evidenceIds;


  return Array.isArray(
    ids
  )
    ? ids.filter(
        (
          value
        ): value is
          string =>
            typeof value ===
              "string"
      )
    : [];
}


export function assessVisualObstructionFailSafe(
  sourcePacket:
    EvidencePacket,
  visionPacket:
    VisionEvidencePacket,
  decision:
    AISemanticDecision
): VisualObstructionAssessment {

  const evidence =
    sourceEvidence(
      sourcePacket
    );

  const entityCandidates =
    evidence.filter(
      isEntityEvidenceCandidate
    );

  const strongCameraEvidence =
    entityCandidates.some(
      item =>
        hasCameraBodyCue(
          itemSearchText(
            item
          )
        )
    );

  const clearNonCameraEvidence =
    !strongCameraEvidence &&
    entityCandidates.some(
      item =>
        hasClearNonCameraCue(
          itemSearchText(
            item
          )
        )
    );

  const evidenceById =
    new Map(
      evidence.map(
        item => [
          item.id,
          item
        ] as const
      )
    );

  const citedEntityEvidence =
    decisionEvidenceIds(
      decision
    )
      .map(
        id =>
          evidenceById.get(
            id
          )
      )
      .filter(
        (
          item
        ): item is
          EvidenceItem =>
            item !==
              undefined &&
            !isVisualObstructionNoise(
              item
            )
      );

  const entityGroundingInsufficient =
    citedEntityEvidence.length ===
      0;

  const visualObstruction =
    screenshotFallback(
      visionPacket
    ) ||
    visualEvidence(
      visionPacket
    ).some(
      isVisualObstructionNoise
    );

  const blockNonCamera =
    decision.entity.type ===
      "NON_CAMERA" &&
    visualObstruction &&
    !clearNonCameraEvidence &&
    (
      strongCameraEvidence ||
      entityGroundingInsufficient
    );

  const reason =
    !blockNonCamera
      ? null
      : strongCameraEvidence
        ? "STRONG_CAMERA_EVIDENCE_CONFLICTS_WITH_OBSTRUCTED_VISUAL"
        : "NON_CAMERA_ONLY_HAS_OBSTRUCTED_OR_MISSING_ENTITY_GROUNDING";


  return {
    visualObstruction,
    strongCameraEvidence,
    clearNonCameraEvidence,
    entityGroundingInsufficient,
    blockNonCamera,
    reason
  };
}


export function applyVisualObstructionFailSafe(
  input:
    {
      readonly sourcePacket:
        EvidencePacket;

      readonly visionPacket:
        VisionEvidencePacket;

      readonly decision:
        AISemanticDecision;

      readonly validation:
        SemanticValidationResult;
    }
): SemanticValidationResult {

  if (
    input.validation.status !==
      "VALIDATED"
  ) {
    return input.validation;
  }


  const assessment =
    assessVisualObstructionFailSafe(
      input.sourcePacket,
      input.visionPacket,
      input.decision
    );


  if (
    !assessment.blockNonCamera
  ) {
    return input.validation;
  }


  return {
    status:
      "NEEDS_REVIEW",

    issues: [
      ...input.validation.issues,
      {
        code:
          "VISUAL_OBSTRUCTION_NON_CAMERA_GUARD",

        field:
          "entity.type",

        message:
          assessment.reason ??
          "Visual obstruction makes NON_CAMERA unsafe to finalize."
      }
    ]
  };
}


export function shouldEscalateVisualObstruction(
  input:
    {
      readonly sourcePacket:
        EvidencePacket;

      readonly visionPacket:
        VisionEvidencePacket;

      readonly decision:
        AISemanticDecision;
    }
): boolean {

  return assessVisualObstructionFailSafe(
    input.sourcePacket,
    input.visionPacket,
    input.decision
  ).blockNonCamera;
}
