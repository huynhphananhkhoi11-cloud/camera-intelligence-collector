import type {
  AISemanticDecision,
  SemanticValidationResult
} from "../ai/semanticContracts.js";


export type SemanticBatchDisposition =
  | "CAMERA"
  | "NON_CAMERA"
  | "REVIEW"
  | "AI_PENDING"
  | "ERROR";


export type SemanticBatchPath =
  | "FAST"
  | "SLOW"
  | "NONE";


export interface SemanticBatchItemResult {
  readonly url:
    string;

  readonly disposition:
    SemanticBatchDisposition;

  readonly path:
    SemanticBatchPath;

  readonly model:
    string |
    null;

  readonly decision:
    AISemanticDecision |
    null;

  readonly validation:
    SemanticValidationResult |
    null;

  readonly reason:
    string |
    null;

  readonly haltBatch:
    boolean;

  readonly inputTokens:
    number |
    null;

  readonly outputTokens:
    number |
    null;

  readonly latencyMs:
    number |
    null;
}


export type SemanticUrlProcessor =
  (
    url:
      string
  ) => Promise<
    SemanticBatchItemResult
  >;


export interface SemanticBatchSummary {
  readonly inputUrls:
    number;

  readonly uniqueUrls:
    number;

  readonly attempted:
    number;

  readonly camera:
    number;

  readonly nonCamera:
    number;

  readonly review:
    number;

  readonly aiPending:
    number;

  readonly errors:
    number;

  readonly halted:
    boolean;
}


export interface SemanticBatchReport {
  readonly items:
    readonly SemanticBatchItemResult[];

  readonly summary:
    SemanticBatchSummary;
}


export interface SemanticBatchRunnerOptions {
  readonly minGapMs?:
    number;
}
