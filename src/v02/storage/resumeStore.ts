import type {
  RunRecord
} from "./runStore.js";


export interface ResumePlan {
  runId: string;

  /*
   * Exact product URLs eligible for another worker attempt.
   * Terminal ACCEPT/REVIEW/EXCLUDE and non-retriable ERROR
   * must never appear here.
   */
  queuedUrls: string[];

  /*
   * URLs that were already waiting in DISCOVERED before
   * recovery began.
   */
  alreadyDiscovered: number;

  /*
   * Stale product-level IN_PROGRESS rows moved back to
   * DISCOVERED.
   */
  recoveredInProgress: number;

  /*
   * ERROR rows whose latest URL-scoped technical error is
   * explicitly retriable.
   */
  requeuedRetriableErrors: number;

  /*
   * Acquisition attempts left STARTED by a crash and closed
   * as FAILED/ResumeRecovery during recovery.
   */
  staleFetchesRecovered: number;

  /*
   * ACCEPT + REVIEW + EXCLUDE + non-retriable ERROR after
   * recovery. These remain outside the resume queue.
   */
  skippedTerminal: number;
}


export interface ResumeStore {
  findLatestIncompleteRun(
    canonicalOrigin:
      string
  ): RunRecord | null;

  prepareResume(
    runId:
      string
  ): ResumePlan;

  close(): void;
}