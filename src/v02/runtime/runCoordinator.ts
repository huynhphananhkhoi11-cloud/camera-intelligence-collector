import {
  SQLiteRunStore
} from "../storage/sqliteRunStore.js";

import {
  SQLiteResumeStore
} from "../storage/sqliteResumeStore.js";

import type {
  CreateRunInput,
  ProductTerminalState,
  RegisterProductUrlInput,
  RunRecord,
  RunStoreReconciliationReport
} from "../storage/runStore.js";

import type {
  ResumePlan
} from "../storage/resumeStore.js";


export interface RunCoordinatorOptions {
  timeoutMs?: number;

  now?: () => string;
}


export interface StartNewRunInput {
  run: CreateRunInput;

  productUrls:
    readonly RegisterProductUrlInput[];
}


export interface StartNewRunResult {
  runId: string;

  queuedUrls: string[];
}


export interface InterruptResult {
  runId:
    string |
    null;

  interrupted: boolean;

  status:
    RunRecord["status"] |
    null;
}


function requiredText(
  value:
    string,
  label:
    string
): string {
  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${label} must not be blank.`
    );
  }

  return normalized;
}


/**
 * Phase 10I orchestration boundary.
 *
 * Responsibilities:
 * - create/start persistent runs;
 * - resume persistent queues;
 * - delegate product lifecycle transitions;
 * - expose persisted reconciliation;
 * - coordinate graceful interruption/finalization.
 *
 * It intentionally does NOT:
 * - discover URLs;
 * - open browser pages;
 * - classify/resolve/validate products;
 * - decide cache hits;
 * - export workbooks.
 */
export class RunCoordinator {

  private readonly runStore:
    SQLiteRunStore;

  private readonly resumeStore:
    SQLiteResumeStore;

  private activeRunId:
    string |
    null =
      null;

  private interruptionRequested =
    false;

  private closed =
    false;


  constructor(
    databasePath:
      string,
    options:
      RunCoordinatorOptions = {}
  ) {
    const path =
      requiredText(
        databasePath,
        "databasePath"
      );

    this.runStore =
      new SQLiteRunStore(
        path,
        {
          timeoutMs:
            options.timeoutMs,

          now:
            options.now
        }
      );

    try {
      this.resumeStore =
        new SQLiteResumeStore(
          path,
          {
            timeoutMs:
              options.timeoutMs,

            now:
              options.now
          }
        );
    }
    catch (error) {
      this.runStore.close();

      throw error;
    }
  }


  private ensureOpen():
    void {
    if (
      this.closed
    ) {
      throw new Error(
        "RunCoordinator is closed."
      );
    }
  }


  private ensureNoActiveRun():
    void {
    if (
      this.activeRunId !==
      null
    ) {
      throw new Error(
        `RunCoordinator already owns active run: ${this.activeRunId}`
      );
    }
  }


  private requireActiveRunId():
    string {
    this.ensureOpen();

    if (
      this.activeRunId ===
      null
    ) {
      throw new Error(
        "RunCoordinator has no active run."
      );
    }

    return this.activeRunId;
  }


  private requireSchedulable():
    string {
    const runId =
      this.requireActiveRunId();

    if (
      this.interruptionRequested
    ) {
      throw new Error(
        `Run interruption/cancellation requested; no new product work may start: ${runId}`
      );
    }

    const run =
      this.runStore.getRun(
        runId
      );

    if (!run) {
      throw new Error(
        `Active run disappeared from persistent store: ${runId}`
      );
    }

    if (
      run.status !==
      "RUNNING"
    ) {
      throw new Error(
        `Active run is not RUNNING: ${runId}; status=${run.status}`
      );
    }

    return runId;
  }


  startNewRun(
    input:
      StartNewRunInput
  ): StartNewRunResult {
    this.ensureOpen();

    this.ensureNoActiveRun();


    const runId =
      requiredText(
        input.run.runId,
        "runId"
      );


    /*
     * Persist queue BEFORE workers are allowed to start.
     *
     * If the process dies after registration but before startRun(),
     * the CREATED run remains resumable.
     */
    this.runStore.createRun(
      input.run
    );

    this.runStore.registerProductUrls(
      runId,
      input.productUrls
    );

    this.runStore.startRun(
      runId
    );


    const queuedUrls =
      this.runStore
        .listProductUrls(
          runId
        )
        .filter(
          row =>
            row.state ===
            "DISCOVERED"
        )
        .map(
          row =>
            row.canonicalUrl
        )
        .sort();


    this.activeRunId =
      runId;

    this.interruptionRequested =
      false;


    return {
      runId,

      queuedUrls
    };
  }


  resumeRun(
    rawRunId:
      string
  ): ResumePlan {
    this.ensureOpen();

    this.ensureNoActiveRun();


    const runId =
      requiredText(
        rawRunId,
        "runId"
      );


    const plan =
      this.resumeStore.prepareResume(
        runId
      );


    this.activeRunId =
      runId;

    this.interruptionRequested =
      false;


    return plan;
  }


  getActiveRun():
    RunRecord | null {
    this.ensureOpen();

    if (
      this.activeRunId ===
      null
    ) {
      return null;
    }

    return this.runStore.getRun(
      this.activeRunId
    );
  }


  beginProduct(
    rawCanonicalUrl:
      string
  ): void {
    const runId =
      this.requireSchedulable();

    const canonicalUrl =
      requiredText(
        rawCanonicalUrl,
        "canonicalUrl"
      );

    this.runStore.beginAttempt(
      runId,
      canonicalUrl
    );
  }


  terminalizeProduct(
    rawCanonicalUrl:
      string,
    state:
      ProductTerminalState
  ): void {
    const runId =
      this.requireActiveRunId();

    const canonicalUrl =
      requiredText(
        rawCanonicalUrl,
        "canonicalUrl"
      );

    /*
     * Terminalization remains legal for in-flight work even after
     * an interruption request. What interruption blocks is NEW
     * scheduling, not a result already obtained by a worker.
     */
    this.runStore.terminalize(
      runId,
      canonicalUrl,
      state
    );
  }


  reconciliation():
    RunStoreReconciliationReport {
    const runId =
      this.requireActiveRunId();

    return this.runStore.getReconciliationReport(
      runId
    );
  }


  finalizeRun():
    RunRecord {
    const runId =
      this.requireActiveRunId();

    if (
      this.interruptionRequested
    ) {
      throw new Error(
        `Interrupted run cannot be finalized as completed: ${runId}`
      );
    }


    this.runStore.completeRun(
      runId
    );


    const finalized =
      this.runStore.getRun(
        runId
      );

    if (!finalized) {
      throw new Error(
        `Finalized run disappeared from persistent store: ${runId}`
      );
    }

    return finalized;
  }


  interruptActiveRun():
    InterruptResult {
    this.ensureOpen();


    if (
      this.activeRunId ===
      null
    ) {
      return {
        runId:
          null,

        interrupted:
          false,

        status:
          null
      };
    }


    const runId =
      this.activeRunId;

    const current =
      this.runStore.getRun(
        runId
      );


    if (!current) {
      throw new Error(
        `Active run disappeared from persistent store: ${runId}`
      );
    }


    if (
      current.status ===
      "RUNNING"
    ) {
      this.runStore.interruptRun(
        runId
      );

      this.interruptionRequested =
        true;

      return {
        runId,

        interrupted:
          true,

        status:
          "INTERRUPTED"
      };
    }


    if (
      current.status ===
      "INTERRUPTED"
    ) {
      this.interruptionRequested =
        true;

      return {
        runId,

        interrupted:
          false,

        status:
          "INTERRUPTED"
      };
    }


    return {
      runId,

      interrupted:
        false,

      status:
        current.status
    };
  }


  isInterruptionRequested():
    boolean {
    this.ensureOpen();

    return this.interruptionRequested;
  }


  close():
    void {
    if (
      this.closed
    ) {
      return;
    }


    let firstError:
      unknown =
        null;


    try {
      this.resumeStore.close();
    }
    catch (error) {
      firstError =
        error;
    }


    try {
      this.runStore.close();
    }
    catch (error) {
      if (
        firstError ===
        null
      ) {
        firstError =
          error;
      }
    }


    this.closed =
      true;


    if (
      firstError !==
      null
    ) {
      throw firstError;
    }
  }
}