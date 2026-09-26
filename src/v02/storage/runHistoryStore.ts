import type {
  RunStatus
} from "./runStore.js";


export interface RunHistoryRecord {
  readonly runId:
    string;

  readonly inputUrl:
    string;

  readonly canonicalOrigin:
    string;

  readonly startedAt:
    string;

  readonly finishedAt:
    string |
    null;

  readonly status:
    RunStatus;

  /*
   * Persisted outstanding work only:
   *
   *   DISCOVERED + IN_PROGRESS
   *
   * This is intentionally the same meaning used by
   * RUN_INTERRUPTED.remaining.
   *
   * Retriable ERROR is not predicted here because retry eligibility
   * belongs to prepareResume(), which is a mutating recovery action.
   */
  readonly remaining:
    number;

  readonly resumable:
    boolean;
}


export interface RunHistoryStore {
  listRecentRuns(
    limit?:
      number
  ): readonly RunHistoryRecord[];

  close():
    void;
}


/*
 * Must stay aligned with SQLiteResumeStore.prepareResume().
 *
 * CREATED:
 *   URLs may already be durable before workers begin.
 *
 * RUNNING:
 *   may represent crash residue.
 *
 * INTERRUPTED:
 *   graceful cancellation.
 */
export function isResumableRunStatus(
  status:
    RunStatus
): boolean {

  return (
    status ===
      "CREATED" ||
    status ===
      "RUNNING" ||
    status ===
      "INTERRUPTED"
  );
}