export type RunTerminalState =
  | "ACCEPT"
  | "REVIEW"
  | "EXCLUDE"
  | "ERROR";


export type RunUrlState =
  | "IN_PROGRESS"
  | RunTerminalState;


export interface RunUrlRecord {
  runId:
    string;

  url:
    string;

  state:
    RunUrlState;
}


export interface RunErrorInput {
  stage:
    string;

  errorClass:
    string;

  message:
    string;

  attempts:
    number;

  lastStatus:
    number | null;

  retriable:
    boolean;

  diagnosticPath?:
    string | null;
}


export interface RunErrorRow {
  runId:
    string;

  url:
    string;

  stage:
    string;

  errorClass:
    string;

  message:
    string;

  attempts:
    number;

  lastStatus:
    number | null;

  retriable:
    boolean;

  diagnosticPath:
    string | null;
}


export interface RunReconciliationReport {
  runId:
    string;

  discovered:
    number;

  accepted:
    number;

  review:
    number;

  excluded:
    number;

  error:
    number;

  inProgress:
    number;

  accounted:
    number;

  balanced:
    boolean;

  complete:
    boolean;
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


function validAttempts(
  attempts:
    number
): number {

  if (
    !Number.isInteger(
      attempts
    ) ||
    attempts < 1
  ) {
    throw new Error(
      "attempts must be a positive integer."
    );
  }

  return attempts;
}


function validStatus(
  status:
    number | null
): number | null {

  if (
    status ===
      null
  ) {
    return null;
  }

  if (
    !Number.isInteger(
      status
    ) ||
    status < 0
  ) {
    throw new Error(
      "lastStatus must be null or a non-negative integer."
    );
  }

  return status;
}


/**
 * Phase 9 in-memory reconciliation contract.
 *
 * Important distinction:
 *
 * - `discovered` in RunReconciliationReport is the total number
 *   of run-scope URLs registered before detail processing.
 *
 * - Each registered URL begins as IN_PROGRESS so the Phase 9
 *   invariant is:
 *
 *     discovered =
 *       ACCEPT +
 *       REVIEW +
 *       EXCLUDE +
 *       ERROR +
 *       IN_PROGRESS
 *
 * - Persistent DISCOVERED state, retry queue and resume belong
 *   to the Phase 10 SQLite run ledger.
 */
export class RunReconciliation {

  private readonly runId:
    string;

  private readonly records =
    new Map<
      string,
      RunUrlRecord
    >();

  private readonly errors:
    RunErrorRow[] = [];


  constructor(
    runId:
      string,
    urls:
      readonly string[]
  ) {

    this.runId =
      requiredText(
        runId,
        "runId"
      );

    for (
      const rawUrl
      of urls
    ) {
      const url =
        requiredText(
          rawUrl,
          "url"
        );

      if (
        this.records.has(
          url
        )
      ) {
        continue;
      }

      this.records.set(
        url,
        {
          runId:
            this.runId,

          url,

          state:
            "IN_PROGRESS"
        }
      );
    }
  }


  private requireRecord(
    rawUrl:
      string
  ): RunUrlRecord {

    const url =
      requiredText(
        rawUrl,
        "url"
      );

    const record =
      this.records.get(
        url
      );

    if (!record) {
      throw new Error(
        `URL was not registered for reconciliation: ${url}`
      );
    }

    return record;
  }


  private transition(
    rawUrl:
      string,
    state:
      RunTerminalState
  ): void {

    const record =
      this.requireRecord(
        rawUrl
      );

    if (
      record.state !==
        "IN_PROGRESS"
    ) {
      throw new Error(
        `URL already reached terminal state ${record.state}: ${record.url}`
      );
    }

    record.state =
      state;
  }


  markDecision(
    url:
      string,
    decision:
      Exclude<
        RunTerminalState,
        "ERROR"
      >
  ): void {

    this.transition(
      url,
      decision
    );
  }


  markError(
    url:
      string,
    input:
      RunErrorInput
  ): void {

    const stage =
      requiredText(
        input.stage,
        "error stage"
      );

    const errorClass =
      requiredText(
        input.errorClass,
        "error class"
      );

    const message =
      requiredText(
        input.message,
        "error message"
      );

    const attempts =
      validAttempts(
        input.attempts
      );

    const lastStatus =
      validStatus(
        input.lastStatus
      );

    const diagnosticPath =
      input.diagnosticPath
        ? input.diagnosticPath.trim() ||
          null
        : null;

    /*
     * Validate the entire Error ledger row BEFORE the state
     * transition. A malformed error must not partially mutate
     * the URL lifecycle.
     */
    this.transition(
      url,
      "ERROR"
    );

    const record =
      this.requireRecord(
        url
      );

    this.errors.push({
      runId:
        this.runId,

      url:
        record.url,

      stage,

      errorClass,

      message,

      attempts,

      lastStatus,

      retriable:
        input.retriable,

      diagnosticPath
    });
  }


  rows():
    RunUrlRecord[] {

    return Array.from(
      this.records.values(),
      record => ({
        ...record
      })
    );
  }


  errorRows():
    RunErrorRow[] {

    return this.errors.map(
      error => ({
        ...error
      })
    );
  }


  report():
    RunReconciliationReport {

    let accepted =
      0;

    let review =
      0;

    let excluded =
      0;

    let error =
      0;

    let inProgress =
      0;


    for (
      const record
      of this.records.values()
    ) {
      switch (
        record.state
      ) {
        case "ACCEPT":
          accepted++;
          break;

        case "REVIEW":
          review++;
          break;

        case "EXCLUDE":
          excluded++;
          break;

        case "ERROR":
          error++;
          break;

        case "IN_PROGRESS":
          inProgress++;
          break;
      }
    }


    const discovered =
      this.records.size;

    const accounted =
      accepted +
      review +
      excluded +
      error +
      inProgress;

    const balanced =
      discovered ===
      accounted;

    const complete =
      balanced &&
      inProgress ===
        0;


    return {
      runId:
        this.runId,

      discovered,

      accepted,

      review,

      excluded,

      error,

      inProgress,

      accounted,

      balanced,

      complete
    };
  }


  assertComplete():
    RunReconciliationReport {

    const report =
      this.report();

    if (
      !report.complete
    ) {
      throw new Error(
        [
          "Run reconciliation incomplete:",
          `discovered=${report.discovered}`,
          `accepted=${report.accepted}`,
          `review=${report.review}`,
          `excluded=${report.excluded}`,
          `error=${report.error}`,
          `inProgress=${report.inProgress}`,
          `accounted=${report.accounted}`
        ].join(
          " "
        )
      );
    }

    return report;
  }
}