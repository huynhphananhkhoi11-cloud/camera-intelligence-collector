import type {
  ProductAnalysis
} from "../evidenceEngine.js";

import type {
  RawProductFacts
} from "../rawProductExtractor.js";

import type {
  ResolvedProductFields
} from "../resolvers/fieldResolvers.js";

import type {
  ConflictRow
} from "../conflicts/conflictEngine.js";


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
  fields: ResolvedProductFields,
  conflicts:
    ConflictRow[] =
      []
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


  /*
   * ==========================================
   * PHASE 9 AUDIT CONFLICTS
   * ==========================================
   *
   * ConflictEngine owns detection/severity.
   * Validator owns the final decision.
   *
   * Conflicts remain visible in audit/reasons.
   * They do not remove a confirmed CAMERA
   * from the market-survey output.
   */
  for (
    const conflict
    of conflicts
  ) {
    if (
      conflict.severity !==
        "HIGH"
    ) {
      continue;
    }

    reasons.push(
      `high severity conflict: ${conflict.field}`
    );
  }


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

    reasons.push(
      "missing product name"
    );
  }


  if (
    !analysis.offer.rental &&
    !analysis.offer.sale
  ) {

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

      reasons.push(
        "sale condition conflict"
      );
    }
    else if (
      analysis.condition.condition ===
        "UNKNOWN"
    ) {

      reasons.push(
        "sale condition unknown"
      );
    }
    else if (
      analysis.condition.condition ===
        "DAMAGED"
    ) {

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

      reasons.push(
        "rental price conflict"
      );
    }

    if (
      fields.rentalPrice.amount ===
        null &&
      !fields.rentalPrice.contact
    ) {

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

      reasons.push(
        "sale price conflict"
      );
    }

    if (
      fields.salePrice.amount ===
        null &&
      !fields.salePrice.contact
    ) {

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
    evidenceCoverage < 1
  ) {

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
