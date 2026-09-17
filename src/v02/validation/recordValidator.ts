import type {
  ProductAnalysis
} from "../evidenceEngine.js";

import type {
  RawProductFacts
} from "../rawProductExtractor.js";

import type {
  ResolvedProductFields
} from "../resolvers/fieldResolvers.js";


export type FinalDecision =
  | "ACCEPT"
  | "REVIEW"
  | "EXCLUDE";


export interface ValidationResult {
  decision:
    FinalDecision;

  reasons:
    string[];

  evidenceCoverage:
    number;

  requiredEvidence:
    number;

  provenEvidence:
    number;
}


export function validateProductRecord(
  facts: RawProductFacts,
  analysis: ProductAnalysis,
  fields: ResolvedProductFields
): ValidationResult {

  const reasons:
    string[] = [];


  /*
   * Hard exclusion:
   * proven non-camera entity.
   */
  if (
    analysis.entity.type !==
      "CAMERA" &&
    analysis.entity.type !==
      "UNCERTAIN"
  ) {

    return {
      decision:
        "EXCLUDE",

      reasons: [
        `non-camera entity=${analysis.entity.type}`
      ],

      evidenceCoverage:
        1,

      requiredEvidence:
        1,

      provenEvidence:
        1
    };
  }


  let decision:
    FinalDecision =
      "ACCEPT";


  if (
    analysis.entity.type ===
      "UNCERTAIN"
  ) {

    decision =
      "REVIEW";

    reasons.push(
      "camera entity uncertain"
    );
  }


  if (
    !facts.title.trim()
  ) {

    decision =
      "REVIEW";

    reasons.push(
      "missing product name"
    );
  }


  if (
    !analysis.offer.rental &&
    !analysis.offer.sale
  ) {

    decision =
      "REVIEW";

    reasons.push(
      "no proven rental or sale offer"
    );
  }


  /*
   * Sale items need proven condition.
   */
  if (
    analysis.offer.sale
  ) {

    if (
      analysis.condition.conflict
    ) {

      decision =
        "REVIEW";

      reasons.push(
        "sale condition conflict"
      );
    }
    else if (
      analysis.condition.condition ===
        "UNKNOWN"
    ) {

      decision =
        "REVIEW";

      reasons.push(
        "sale condition unknown"
      );
    }
    else if (
      analysis.condition.condition ===
        "DAMAGED"
    ) {

      decision =
        "REVIEW";

      reasons.push(
        "damaged item requires review"
      );
    }
  }


  /*
   * Rental price.
   */
  if (
    analysis.offer.rental
  ) {

    if (
      fields.rentalPrice.conflict
    ) {

      decision =
        "REVIEW";

      reasons.push(
        "rental price conflict"
      );
    }

    if (
      fields.rentalPrice.amount ===
        null &&
      !fields.rentalPrice.contact
    ) {

      decision =
        "REVIEW";

      reasons.push(
        "missing rental price evidence"
      );
    }
  }


  /*
   * Sale price.
   */
  if (
    analysis.offer.sale
  ) {

    if (
      fields.salePrice.conflict
    ) {

      decision =
        "REVIEW";

      reasons.push(
        "sale price conflict"
      );
    }

    if (
      fields.salePrice.amount ===
        null &&
      !fields.salePrice.contact
    ) {

      decision =
        "REVIEW";

      reasons.push(
        "missing sale price evidence"
      );
    }
  }


  /*
   * Evidence completeness.
   */
  let required = 0;
  let proven = 0;


  required++;

  if (
    facts.title.trim()
  ) {
    proven++;
  }


  required++;

  if (
    analysis.entity.evidence.length >
      0
  ) {
    proven++;
  }


  required++;

  if (
    analysis.offer.evidence.length >
      0
  ) {
    proven++;
  }


  if (
    analysis.offer.rental
  ) {

    required++;

    if (
      fields.rentalPrice.evidence.length >
        0 ||
      fields.rentalPrice.contact
    ) {
      proven++;
    }
  }


  if (
    analysis.offer.sale
  ) {

    required++;

    if (
      fields.salePrice.evidence.length >
        0 ||
      fields.salePrice.contact
    ) {
      proven++;
    }


    required++;

    if (
      analysis.condition.evidence.length >
        0
    ) {
      proven++;
    }
  }


  const evidenceCoverage =
    required === 0
      ? 0
      : proven / required;


  if (
    evidenceCoverage < 1 &&
    decision === "ACCEPT"
  ) {

    decision =
      "REVIEW";

    reasons.push(
      "required evidence incomplete"
    );
  }


  return {
    decision,

    reasons:
      Array.from(
        new Set(reasons)
      ),

    evidenceCoverage,

    requiredEvidence:
      required,

    provenEvidence:
      proven
  };
}
