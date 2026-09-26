import type {
  AISemanticDecision,
  SemanticValidationResult
} from "../ai/semanticContracts.js";


export type PageBenchmarkMode =
  | "COMPACT"
  | "FULL_EVIDENCE"
  | "FULL_PAGE";


export interface PageBenchmarkPageStats {
  readonly renderedHtmlBytes:
    number;

  readonly renderedHtmlChars:
    number;

  readonly sanitizedHtmlChars:
    number;

  readonly primaryTextChars:
    number;

  readonly evidenceCount:
    number;

  readonly selectedControlCount:
    number;

  readonly controlCount:
    number;
}


export interface PageBenchmarkRun {
  readonly mode:
    PageBenchmarkMode;

  readonly provider:
    string;

  readonly model:
    string;

  readonly reasoning:
    "LOW" |
    "MEDIUM";

  readonly attempts:
    number;

  readonly inputTokens:
    number |
    null;

  readonly outputTokens:
    number |
    null;

  readonly latencyMs:
    number |
    null;

  readonly validation:
    SemanticValidationResult;

  readonly decision:
    AISemanticDecision;
}


export interface PageBenchmarkResult {
  readonly url:
    string;

  readonly finalUrl:
    string;

  readonly capturedAt:
    string;

  readonly page:
    PageBenchmarkPageStats;

  readonly runs:
    readonly PageBenchmarkRun[];
}