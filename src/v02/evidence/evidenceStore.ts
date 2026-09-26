import type {
  PipelineResult
} from "../pipeline/productPipeline.js";


export type EvidenceConfidence =
  | string
  | number;


export interface EvidenceRow {
  runId: string;

  url: string;

  productName: string;

  decision: string;

  field: string;

  /*
   * Canonical Phase 9 name.
   */
  selectedValue: string;

  /*
   * Compatibility alias for the current Excel V2
   * evidence sheet. Phase 11 may migrate the sheet
   * to selectedValue without changing audit semantics.
   */
  value: string;

  source: string;

  raw: string;

  weight:
    number |
    null;

  confidence:
    EvidenceConfidence;

  ruleId: string;
}


interface EvidenceBase {
  runId: string;
  url: string;
  productName: string;
  decision: string;
}


interface ResolverEvidence {
  source: string;
  raw: string;
}


interface ResolverGroup {
  field: string;
  selectedValue: unknown;
  confidence: number;
  evidence: ResolverEvidence[];
}


function valueText(
  value:
    unknown
): string {

  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  if (
    Array.isArray(
      value
    )
  ) {
    return value.join(
      " + "
    );
  }

  return String(
    value
  );
}


function ruleToken(
  value:
    string
): string {

  return value
    .toUpperCase()
    .replace(
      /[^A-Z0-9]+/g,
      "_"
    )
    .replace(
      /^_+|_+$/g,
      ""
    );
}


function resolverRuleId(
  field:
    string,
  source:
    string
): string {

  return [
    "RESOLVE",
    ruleToken(field),
    ruleToken(source)
  ]
    .filter(Boolean)
    .join("_");
}


function offerSelectedValue(
  result:
    PipelineResult
): string {

  const values:
    string[] = [];

  if (
    result.analysis.offer.rental
  ) {
    values.push(
      "RENTAL"
    );
  }

  if (
    result.analysis.offer.sale
  ) {
    values.push(
      "SALE"
    );
  }

  return values.join(
    "+"
  );
}


function makeRow(
  base:
    EvidenceBase,
  field:
    string,
  selectedValue:
    unknown,
  source:
    string,
  raw:
    string,
  weight:
    number |
    null,
  confidence:
    EvidenceConfidence,
  ruleId:
    string
): EvidenceRow {

  const selected =
    valueText(
      selectedValue
    );

  return {
    ...base,

    field,

    selectedValue:
      selected,

    value:
      selected,

    source,

    raw,

    weight,

    confidence,

    ruleId
  };
}


export function buildEvidenceRows(
  result:
    PipelineResult,
  runId:
    string =
      ""
): EvidenceRow[] {

  const rows:
    EvidenceRow[] = [];

  const base:
    EvidenceBase = {

      runId,

      url:
        result.facts.url,

      productName:
        result.facts.title,

      decision:
        result.validation.decision
  };


  /*
   * ==========================================
   * CLASSIFIER EVIDENCE
   * ==========================================
   */

  for (
    const evidence
    of result.analysis.entity.evidence
  ) {
    rows.push(
      makeRow(
        base,
        "ENTITY",
        result.analysis.entity.type,
        "ENTITY_RULE",
        evidence.raw,
        null,
        result.analysis.entity.confidence,
        "ENTITY_CLASSIFIER"
      )
    );
  }


  const offerValue =
    offerSelectedValue(
      result
    );

  for (
    const evidence
    of result.analysis.offer.evidence
  ) {
    rows.push(
      makeRow(
        base,
        "OFFER",
        offerValue,
        evidence.source,
        evidence.text,
        evidence.weight,
        result.analysis.offer.confidence,
        [
          "OFFER",
          ruleToken(
            evidence.kind
          ),
          ruleToken(
            evidence.source
          )
        ]
          .filter(Boolean)
          .join("_")
      )
    );
  }


  for (
    const evidence
    of result.analysis.condition.evidence
  ) {
    rows.push(
      makeRow(
        base,
        "CONDITION",
        result.analysis.condition.condition,
        evidence.source,
        evidence.text,
        evidence.weight,
        result.analysis.condition.confidence,
        [
          "CONDITION",
          ruleToken(
            evidence.condition
          ),
          ruleToken(
            evidence.source
          )
        ]
          .filter(Boolean)
          .join("_")
      )
    );
  }


  /*
   * ==========================================
   * RESOLVER EVIDENCE
   * ==========================================
   *
   * The selected value is repeated on every
   * supporting/counter evidence row.
   *
   * This is intentional:
   * one row describes one evidence item,
   * while selectedValue describes the value
   * the resolver ultimately chose.
   */

  const fieldGroups:
    ResolverGroup[] = [

      {
        field:
          "SPECS",

        selectedValue:
          result.fields.specs.value,

        confidence:
          result.fields.specs.confidence,

        evidence:
          result.fields.specs.evidence
      },

      {
        field:
          "RENTAL_PRICE",

        selectedValue:
          result.fields.rentalPrice.amount,

        confidence:
          result.fields.rentalPrice.confidence,

        evidence:
          result.fields.rentalPrice.evidence
      },

      {
        field:
          "SALE_PRICE",

        selectedValue:
          result.fields.salePrice.amount,

        confidence:
          result.fields.salePrice.confidence,

        evidence:
          result.fields.salePrice.evidence
      },

      {
        field:
          "RENTAL_CONDITIONS",

        selectedValue:
          result.fields.rentalConditions.value,

        confidence:
          result.fields.rentalConditions.confidence,

        evidence:
          result.fields.rentalConditions.evidence
      },

      {
        field:
          "ACCESSORIES",

        selectedValue:
          result.fields.accessories.value,

        confidence:
          result.fields.accessories.confidence,

        evidence:
          result.fields.accessories.evidence
      },

      {
        field:
          "COMBO",

        selectedValue:
          result.fields.combo.value,

        confidence:
          result.fields.combo.confidence,

        evidence:
          result.fields.combo.evidence
      },

      {
        field:
          "RATING",

        selectedValue:
          result.fields.rating.value,

        confidence:
          result.fields.rating.confidence,

        evidence:
          result.fields.rating.evidence
      },

      {
        field:
          "REVIEW_COUNT",

        selectedValue:
          result.fields.reviewCount.value,

        confidence:
          result.fields.reviewCount.confidence,

        evidence:
          result.fields.reviewCount.evidence
      },

      {
        field:
          "STOCK",

        selectedValue:
          result.fields.stock.value,

        confidence:
          result.fields.stock.confidence,

        evidence:
          result.fields.stock.evidence
      }
    ];


  for (
    const group
    of fieldGroups
  ) {
    for (
      const evidence
      of group.evidence
    ) {
      rows.push(
        makeRow(
          base,
          group.field,
          group.selectedValue,
          evidence.source,
          evidence.raw,
          null,
          group.confidence,
          resolverRuleId(
            group.field,
            evidence.source
          )
        )
      );
    }
  }


  return rows;
}


export function buildAllEvidenceRows(
  results:
    PipelineResult[],
  runId:
    string =
      ""
): EvidenceRow[] {

  return results.flatMap(
    result =>
      buildEvidenceRows(
        result,
        runId
      )
  );
}