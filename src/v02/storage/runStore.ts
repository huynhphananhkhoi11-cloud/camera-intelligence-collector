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


export interface RunStoreReconciliationReport {
  runId: string;

  /*
   * Total run-scope product URLs registered in persistent storage.
   * This preserves the Phase 9 meaning of "discovered" as a total,
   * while `pending` counts the Phase 10 DISCOVERED queue state.
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
 * RunStore only persists and retrieves lifecycle state.
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

  beginAttempt(
    runId:
      string,
    canonicalUrl:
      string
  ): void;

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