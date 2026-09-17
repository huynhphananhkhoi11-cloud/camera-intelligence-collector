import type {
  PipelineResult
} from "../pipeline/productPipeline.js";


export interface EvidenceRow {
  url: string;
  productName: string;

  decision: string;

  field: string;

  value: string;

  source: string;

  raw: string;

  weight: number | null;

  confidence: string;
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


export function buildEvidenceRows(
  result:
    PipelineResult
): EvidenceRow[] {

  const rows:
    EvidenceRow[] = [];

  const base = {
    url:
      result.facts.url,

    productName:
      result.facts.title,

    decision:
      result.validation.decision
  };


  for (
    const raw
    of result.analysis.entity.evidence
  ) {

    rows.push({
      ...base,

      field:
        "ENTITY",

      value:
        result.analysis.entity.type,

      source:
        "ENTITY_RULE",

      raw: raw.raw,

      weight:
        null,

      confidence:
        result.analysis.entity.confidence
    });
  }


  for (
    const evidence
    of result.analysis.offer.evidence
  ) {

    rows.push({
      ...base,

      field:
        "OFFER",

      value:
        evidence.kind,

      source:
        evidence.source,

      raw:
        evidence.text,

      weight:
        evidence.weight,

      confidence:
        result.analysis.offer.confidence
    });
  }


  for (
    const evidence
    of result.analysis.condition.evidence
  ) {

    rows.push({
      ...base,

      field:
        "CONDITION",

      value:
        evidence.condition,

      source:
        evidence.source,

      raw:
        evidence.text,

      weight:
        evidence.weight,

      confidence:
        result.analysis.condition.confidence
    });
  }


  const fieldGroups = [
    {
      field:
        "SPECS",

      value:
        result.fields.specs.value,

      evidence:
        result.fields.specs.evidence
    },

    {
      field:
        "RENTAL_PRICE",

      value:
        result.fields.rentalPrice.amount,

      evidence:
        result.fields.rentalPrice.evidence
    },

    {
      field:
        "SALE_PRICE",

      value:
        result.fields.salePrice.amount,

      evidence:
        result.fields.salePrice.evidence
    },

    {
      field:
        "RENTAL_CONDITIONS",

      value:
        result.fields.rentalConditions.value,

      evidence:
        result.fields.rentalConditions.evidence
    },

    {
      field:
        "ACCESSORIES",

      value:
        result.fields.accessories.value,

      evidence:
        result.fields.accessories.evidence
    },

    {
      field:
        "COMBO",

      value:
        result.fields.combo.value,

      evidence:
        result.fields.combo.evidence
    },

    {
      field:
        "RATING",

      value:
        result.fields.rating.value,

      evidence:
        result.fields.rating.evidence
    },

    {
      field:
        "REVIEW_COUNT",

      value:
        result.fields.reviewCount.value,

      evidence:
        result.fields.reviewCount.evidence
    },

    {
      field:
        "STOCK",

      value:
        result.fields.stock.value,

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

      rows.push({
        ...base,

        field:
          group.field,

        value:
          valueText(
            group.value
          ),

        source:
          evidence.source,

        raw:
          evidence.raw,

        weight:
          null,

        confidence:
          ""
      });
    }
  }


  return rows;
}


export function buildAllEvidenceRows(
  results:
    PipelineResult[]
): EvidenceRow[] {

  return results.flatMap(
    result =>
      buildEvidenceRows(
        result
      )
  );
}
