import type {
  ObservationCollectionResult,
  ProductObservation
} from "../observations/observationTypes.js";


export interface ProductPageQualification {
  readonly isProductDetail:
    boolean;

  readonly confidence:
    "HIGH" |
    "MEDIUM" |
    "LOW";

  readonly reasons:
    readonly string[];
}


function hasField(
  observations:
    readonly ProductObservation[],
  field:
    ProductObservation["field"]
): boolean {

  return observations.some(
    observation =>
      observation.field ===
        field
  );
}


function hasStructuredField(
  observations:
    readonly ProductObservation[],
  field:
    ProductObservation["field"]
): boolean {

  return observations.some(
    observation =>
      observation.field ===
        field &&
      observation.sourceKind ===
        "JSON_LD"
  );
}


function hasPurchaseAction(
  observations:
    readonly ProductObservation[]
): boolean {

  return observations.some(
    observation =>
      observation.field ===
        "ACTION_TEXT" &&
      /(?:mua\s*ngay|th[eê]m\s*v[aà]o\s*gi[oỏ]\s*h[aà]ng|add\s*to\s*cart|buy\s*now|đặt\s*h[aà]ng)/iu
        .test(
          observation.rawValue
        )
  );
}


export function qualifyProductDetailPage(
  result:
    ObservationCollectionResult
): ProductPageQualification {

  const observations =
    result.observations;


  const reasons:
    string[] =
      [];


  if (
    result.identity.signals.primaryProductSelection !==
      "NONE"
  ) {
    reasons.push(
      "primary_structured_product"
    );
  }


  if (
    hasStructuredField(
      observations,
      "SKU"
    ) ||
    hasStructuredField(
      observations,
      "PRODUCT_ID"
    )
  ) {
    reasons.push(
      "structured_product_identifier"
    );
  }


  if (
    hasStructuredField(
      observations,
      "PRICE"
    )
  ) {
    reasons.push(
      "structured_offer_price"
    );
  }


  if (
    hasField(
      observations,
      "PRODUCT_NAME"
    ) &&
    hasField(
      observations,
      "PRICE"
    ) &&
    hasPurchaseAction(
      observations
    )
  ) {
    reasons.push(
      "visible_name_price_purchase_action"
    );
  }


  if (
    reasons.includes(
      "primary_structured_product"
    ) &&
    (
      reasons.includes(
        "structured_product_identifier"
      ) ||
      reasons.includes(
        "structured_offer_price"
      )
    )
  ) {
    return {
      isProductDetail:
        true,

      confidence:
        "HIGH",

      reasons
    };
  }


  if (
    reasons.includes(
      "visible_name_price_purchase_action"
    ) ||
    (
      reasons.includes(
        "primary_structured_product"
      ) &&
      hasField(
        observations,
        "PRODUCT_NAME"
      )
    )
  ) {
    return {
      isProductDetail:
        true,

      confidence:
        "MEDIUM",

      reasons
    };
  }


  return {
    isProductDetail:
      false,

    confidence:
      "LOW",

    reasons:
      reasons.length >
        0
        ? reasons
        : [
            "insufficient_product_detail_evidence"
          ]
  };
}
