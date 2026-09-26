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

import type {
  RunCounterSnapshot,
  RunEventBus,
  RunEventPayload,
  RunReconciliationSnapshot
} from "./runEventBus.js";


export interface RunCoordinatorOptions {
  timeoutMs?: number;

  now?: () => string;

  eventBus?:
    RunEventBus;

  onEventError?:
    (
      error:
        unknown
    ) =>
      void;
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

  private readonly eventBus:
    RunEventBus |
    null;

  private readonly onEventError:
    ((
      error:
        unknown
    ) =>
      void) |
    null;

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


    this.eventBus =
      options.eventBus ??
      null;

    this.onEventError =
      options.onEventError ??
      null;


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


  private notifyEventError(
    error:
      unknown
  ): void {

    if (
      this.onEventError ===
        null
    ) {
      return;
    }


    try {

      this.onEventError(
        error
      );
    }
    catch {

      /*
       * Observability callbacks are non-authoritative.
       * They cannot alter persistent lifecycle truth.
       */
    }
  }


  private publishEvent(
    payload:
      RunEventPayload
  ): void {

    if (
      this.eventBus ===
        null
    ) {
      return;
    }


    try {

      const report =
        this.eventBus.publish(
          payload
        );


      for (
        const failure
        of report.failures
      ) {

        this.notifyEventError(
          failure.error
        );
      }
    }
    catch (
      error
    ) {

      /*
       * A renderer/logger/event-clock failure must never roll
       * back a transition already committed to SQLite.
       */
      this.notifyEventError(
        error
      );
    }
  }


  private counterSnapshot(
    report:
      RunStoreReconciliationReport
  ): RunCounterSnapshot {

    return {
      accept:
        report.accepted,

      review:
        report.review,

      exclude:
        report.excluded,

      error:
        report.error,

      /*
       * UX "inProgress" means all outstanding run-scope work:
       * queued DISCOVERED + actively IN_PROGRESS.
       */
      inProgress:
        report.pending +
        report.inProgress,

      total:
        report.discovered
    };
  }


  private reconciliationSnapshot(
    report:
      RunStoreReconciliationReport
  ): RunReconciliationSnapshot {

    return {
      discovered:
        report.discovered,

      accept:
        report.accepted,

      review:
        report.review,

      exclude:
        report.excluded,

      error:
        report.error,

      inProgress:
        report.pending +
        report.inProgress,

      balanced:
        report.balanced
    };
  }


  private eventReport(
    runId:
      string
  ): RunStoreReconciliationReport |
    null {

    try {

      return this.runStore
        .getReconciliationReport(
          runId
        );
    }
    catch (
      error
    ) {

      this.notifyEventError(
        error
      );

      return null;
    }
  }


  private emitCounters(
    runId:
      string
  ): void {

    const report =
      this.eventReport(
        runId
      );


    if (
      report ===
        null
    ) {
      return;
    }


    this.publishEvent({
      type:
        "COUNTERS_UPDATED",

      runId,

      counters:
        this.counterSnapshot(
          report
        )
    });
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


    /*
     * SQLite run state and queue are committed before observers
     * receive their first snapshot.
     */
    this.emitCounters(
      runId
    );


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


    /*
     * prepareResume() has already persisted recovery before
     * publishing the resumed outstanding-work snapshot.
     */
    this.emitCounters(
      runId
    );


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


    /*
     * terminalize() persisted first.
     */
    this.emitCounters(
      runId
    );
  }


  reconciliation():
    RunStoreReconciliationReport {

    const runId =
      this.requireActiveRunId();


    const report =
      this.runStore
        .getReconciliationReport(
          runId
        );


    this.publishEvent({
      type:
        "RECONCILIATION_COMPLETED",

      runId,

      report:
        this.reconciliationSnapshot(
          report
        )
    });


    return report;
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

    const report =
      this.eventReport(
        runId
      );


    if (
      report !==
        null &&
      (
        finalized.status ===
          "COMPLETED" ||
        finalized.status ===
          "COMPLETED_WITH_ERRORS"
      )
    ) {

      this.publishEvent({
        type:
          "RUN_COMPLETED",

        runId,

        status:
          finalized.status,

        /*
         * Export path belongs to exporter/orchestration, not the
         * run coordinator. Never fabricate one here.
         */
        outputPath:
          null,

        summary:
          this.counterSnapshot(
            report
          )
      });
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


      const report =
        this.eventReport(
          runId
        );


      this.publishEvent({
        type:
          "RUN_INTERRUPTED",

        runId,

        remaining:
          report ===
            null
            ? null
            : report.pending +
              report.inProgress
      });


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