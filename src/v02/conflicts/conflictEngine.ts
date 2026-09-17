import type {
  PipelineResult
} from "../pipeline/productPipeline.js";


export interface ConflictRow {
  url: string;
  productName: string;

  field: string;

  severity:
    | "REVIEW"
    | "INFO";

  values: string;

  explanation: string;
}


function rawValues(
  values: Array<{
    raw: string;
  }>
): string {

  return Array.from(
    new Set(
      values
        .map(
          value =>
            value.raw
        )
        .filter(Boolean)
    )
  ).join(" | ");
}


export function detectConflicts(
  result: PipelineResult
): ConflictRow[] {

  const rows: ConflictRow[] = [];

  const base = {
    url:
      result.facts.url,

    productName:
      result.facts.title
  };


  if (
    result.fields.rentalPrice.conflict
  ) {

    rows.push({
      ...base,

      field:
        "RENTAL_PRICE",

      severity:
        "REVIEW",

      values:
        rawValues(
          result.fields.rentalPrice.evidence
        ),

      explanation:
        "Multiple semantically valid rental prices disagree."
    });
  }


  if (
    result.fields.salePrice.conflict
  ) {

    rows.push({
      ...base,

      field:
        "SALE_PRICE",

      severity:
        "REVIEW",

      values:
        rawValues(
          result.fields.salePrice.evidence
        ),

      explanation:
        "Multiple semantically valid sale prices disagree."
    });
  }


  if (
    result.analysis.condition.conflict
  ) {

    rows.push({
      ...base,

      field:
        "CONDITION",

      severity:
        "REVIEW",

      values:
        result.analysis.condition.evidence
          .map(
            evidence =>
              `${evidence.condition}: ${evidence.text}`
          )
          .join(" | "),

      explanation:
        "Strong contradictory condition evidence."
    });
  }


  return rows;
}


export function detectAllConflicts(
  results: PipelineResult[]
): ConflictRow[] {

  return results.flatMap(
    result =>
      detectConflicts(result)
  );
}
