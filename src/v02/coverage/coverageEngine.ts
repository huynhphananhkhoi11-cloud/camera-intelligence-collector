import type {
  PipelineResult
} from "../pipeline/productPipeline.js";


export interface CoverageInput {
  catalogPagesDiscovered: number;
  catalogPagesVisited: number;

  productUrlsDiscovered: number;

  detailPagesAttempted: number;
  detailPagesCompleted: number;

  results: PipelineResult[];
}


export interface CoverageMetric {
  key: string;
  label: string;

  numerator: number;
  denominator: number;

  ratio: number | null;

  status:
    | "PASS"
    | "WARN"
    | "N/A";
}


export interface CoverageReport {
  metrics: CoverageMetric[];

  accepted: number;
  review: number;
  excluded: number;

  totalClassified: number;

  allRequiredEvidenceComplete:
    number;
}


function metric(
  key: string,
  label: string,
  numerator: number,
  denominator: number
): CoverageMetric {

  if (
    denominator <= 0
  ) {
    return {
      key,
      label,
      numerator,
      denominator,
      ratio: null,
      status: "N/A"
    };
  }

  const ratio =
    numerator /
    denominator;

  return {
    key,
    label,
    numerator,
    denominator,
    ratio,
    status:
      ratio >= 1
        ? "PASS"
        : "WARN"
  };
}


export function computeCoverage(
  input: CoverageInput
): CoverageReport {

  const accepted =
    input.results.filter(
      result =>
        result.validation.decision ===
        "ACCEPT"
    ).length;

  const review =
    input.results.filter(
      result =>
        result.validation.decision ===
        "REVIEW"
    ).length;

  const excluded =
    input.results.filter(
      result =>
        result.validation.decision ===
        "EXCLUDE"
    ).length;

  const totalClassified =
    accepted +
    review +
    excluded;

  const evidenceComplete =
    input.results.filter(
      result =>
        result.validation.evidenceCoverage >=
        1
    ).length;

  const metrics: CoverageMetric[] = [

    metric(
      "catalog",
      "Catalog coverage",
      input.catalogPagesVisited,
      input.catalogPagesDiscovered
    ),

    metric(
      "detail",
      "Detail coverage",
      input.detailPagesCompleted,
      input.productUrlsDiscovered
    ),

    metric(
      "classification",
      "Classification coverage",
      totalClassified,
      input.detailPagesCompleted
    ),

    metric(
      "evidence",
      "Evidence coverage",
      evidenceComplete,
      input.results.length
    )
  ];

  return {
    metrics,

    accepted,
    review,
    excluded,

    totalClassified,

    allRequiredEvidenceComplete:
      evidenceComplete
  };
}
