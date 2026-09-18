export type RunStatus =
  | "CREATED"
  | "RUNNING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "INTERRUPTED"
  | "FAILED_INVARIANT"
  | "FAILED_FATAL";


export type ProductTerminalState =
  | "ACCEPT"
  | "REVIEW"
  | "EXCLUDE"
  | "ERROR";


export type ProductUrlState =
  | "DISCOVERED"
  | "IN_PROGRESS"
  | ProductTerminalState;


export type DetailFetchStatus =
  | "STARTED"
  | "SUCCEEDED"
  | "FAILED";


export type DetailFetchTerminalStatus =
  | "SUCCEEDED"
  | "FAILED";


export interface CreateRunInput {
  runId: string;

  inputUrl: string;

  canonicalOrigin: string;

  startedAt: string;

  codeVersion: string;

  configHash: string;
}


export interface RunRecord {
  runId: string;

  inputUrl: string;

  canonicalOrigin: string;

  startedAt: string;

  finishedAt:
    string |
    null;

  codeVersion: string;

  configHash: string;

  status:
    RunStatus;
}


export interface RegisterProductUrlInput {
  canonicalUrl: string;

  discoveryScore:
    number |
    null;

  /*
   * JSON text keeps the storage boundary independent
   * from discovery-layer object shapes.
   */
  sourcesJson: string;
}


export interface ProductUrlRecord {
  runId: string;

  canonicalUrl: string;

  discoveryScore:
    number |
    null;

  sourcesJson: string;

  state:
    ProductUrlState;

  attempts: number;

  discoveredAt: string;

  updatedAt: string;
}


export interface DetailFetchRecord {
  fetchId: number;

  runId: string;

  canonicalUrl: string;

  /*
   * Acquisition attempt number for this URL.
   *
   * This is intentionally independent from product_urls.attempts:
   * one product-processing attempt may contain multiple network
   * acquisition retries.
   */
  attempt: number;

  startedAt: string;

  finishedAt:
    string |
    null;

  finalUrl:
    string |
    null;

  status:
    DetailFetchStatus;

  httpStatus:
    number |
    null;

  durationMs:
    number |
    null;

  errorClass:
    string |
    null;

  errorMessage:
    string |
    null;

  contentHash:
    string |
    null;

  snapshotPath:
    string |
    null;
}


export interface RawFactsInput {
  contentHash: string;

  extractorVersion: string;

  /*
   * Opaque replay payload.
   *
   * Storage validates JSON syntax only; acquisition/extraction owns
   * the actual replay schema and business meaning.
   */
  factsJson: string;

  snapshotPath:
    string |
    null;
}


export interface RawFactsRecord
extends RawFactsInput {
  rawFactId: number;

  runId: string;

  canonicalUrl: string;

  capturedAt: string;
}


export interface FinishDetailFetchInput {
  status:
    DetailFetchTerminalStatus;

  finalUrl:
    string |
    null;

  httpStatus:
    number |
    null;

  durationMs: number;

  errorClass:
    string |
    null;

  errorMessage:
    string |
    null;

  contentHash:
    string |
    null;

  snapshotPath:
    string |
    null;

  rawFacts:
    RawFactsInput |
    null;
}


export interface RunStoreReconciliationReport {
  runId: string;

  /*
   * Total run-scope product URLs registered in persistent storage.
   * `pending` is the Phase 10 DISCOVERED queue state.
   */
  discovered: number;

  pending: number;

  accepted: number;

  review: number;

  excluded: number;

  error: number;

  inProgress: number;

  accounted: number;

  balanced: boolean;

  complete: boolean;
}


/**
 * Phase 10 persistence contract.
 *
 * Business truth remains outside the store:
 * acquisition gathers facts,
 * classifiers classify,
 * resolvers resolve,
 * validator decides.
 *
 * RunStore persists lifecycle/audit state only.
 */
export interface RunStore {
  createRun(
    input:
      CreateRunInput
  ): void;

  getRun(
    runId:
      string
  ): RunRecord | null;

  startRun(
    runId:
      string
  ): void;

  interruptRun(
    runId:
      string
  ): void;

  registerProductUrls(
    runId:
      string,
    urls:
      readonly RegisterProductUrlInput[]
  ): void;

  listProductUrls(
    runId:
      string
  ): ProductUrlRecord[];

  /*
   * Begins one product-processing attempt.
   * Network/acquisition retries are recorded separately by
   * startDetailFetch().
   */
  beginAttempt(
    runId:
      string,
    canonicalUrl:
      string
  ): void;

  startDetailFetch(
    runId:
      string,
    canonicalUrl:
      string
  ): DetailFetchRecord;

  finishDetailFetch(
    runId:
      string,
    canonicalUrl:
      string,
    input:
      FinishDetailFetchInput
  ): DetailFetchRecord;

  listDetailFetches(
    runId:
      string,
    canonicalUrl:
      string
  ): DetailFetchRecord[];

  listRawFacts(
    runId:
      string,
    canonicalUrl:
      string
  ): RawFactsRecord[];

  terminalize(
    runId:
      string,
    canonicalUrl:
      string,
    state:
      ProductTerminalState
  ): void;

  getReconciliationReport(
    runId:
      string
  ): RunStoreReconciliationReport;

  completeRun(
    runId:
      string
  ): void;

  close(): void;
}