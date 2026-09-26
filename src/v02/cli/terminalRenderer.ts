import type {
  RunCounterSnapshot,
  RunEvent,
  RunEventListener,
  RunStage
} from "../runtime/runEventBus.js";


export type TerminalStageStatus =
  | "PENDING"
  | "ACTIVE"
  | "DONE"
  | "FAILED";


export interface TerminalStageSnapshot {
  readonly stage:
    RunStage;

  readonly status:
    TerminalStageStatus;
}


export type TerminalRunStatus =
  | "IDLE"
  | "RUNNING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "INTERRUPTED"
  | "FAILED";


export type TerminalReconciliationStatus =
  | "UNKNOWN"
  | "PASS"
  | "FAIL";


export interface TerminalRendererSnapshot {
  readonly runId:
    string |
    null;

  readonly website:
    string |
    null;

  readonly mode:
    "NEW" |
    "RESUME" |
    null;

  readonly browserMode:
    "VISIBLE" |
    "HEADLESS" |
    null;

  readonly workers:
    number |
    null;

  readonly outputPath:
    string |
    null;

  readonly runStatus:
    TerminalRunStatus;

  readonly stages:
    readonly TerminalStageSnapshot[];

  readonly counters:
    RunCounterSnapshot;

  readonly detailCompleted:
    number;

  readonly detailTotal:
    number;

  readonly detailPercent:
    number |
    null;

  readonly currentVisible:
    string |
    null;

  readonly reconciliation:
    TerminalReconciliationStatus;

  readonly elapsedMs:
    number;

  readonly failureMessage:
    string |
    null;
}


export interface TerminalRendererOutput {
  readonly isTTY:
    boolean;

  readonly columns?:
    number;

  write(
    chunk:
      string
  ): void;

  cursorTo?(
    x:
      number
  ): void;

  moveCursor?(
    dx:
      number,
    dy:
      number
  ): void;

  clearScreenDown?():
    void;
}


export interface TerminalRendererOptions {
  readonly output?:
    TerminalRendererOutput;

  readonly now?:
    () =>
      number;

  readonly plainIntervalMs?:
    number;
}


const EMPTY_COUNTERS:
  RunCounterSnapshot = {
    accept:
      0,

    review:
      0,

    exclude:
      0,

    error:
      0,

    inProgress:
      0,

    total:
      0
  };


const STAGE_ORDER:
  readonly RunStage[] = [
    "BOOTSTRAP",
    "SITE_PROFILING",
    "ROOT_DISCOVERY",
    "PRODUCT_DISCOVERY",
    "DETAIL_COLLECTION",
    "AUDIT_RECONCILE",
    "EXCEL_EXPORT"
  ];


const STAGE_LABEL:
  Readonly<
    Record<
      RunStage,
      string
    >
  > = {
    BOOTSTRAP:
      "Bootstrap",

    SITE_PROFILING:
      "Site profiling",

    ROOT_DISCOVERY:
      "Root discovery",

    PRODUCT_DISCOVERY:
      "Product discovery",

    DETAIL_COLLECTION:
      "Detail collection",

    AUDIT_RECONCILE:
      "Audit & reconcile",

    EXCEL_EXPORT:
      "Excel export"
  };


function processOutput():
  TerminalRendererOutput {

  const output =
    process.stdout;


  return {
    isTTY:
      output.isTTY ===
        true,

    columns:
      output.columns,

    write:
      chunk => {
        output.write(
          chunk
        );
      },

    cursorTo:
      typeof output.cursorTo ===
        "function"
        ? x => {
            output.cursorTo(
              x
            );
          }
        : undefined,

    moveCursor:
      typeof output.moveCursor ===
        "function"
        ? (
            dx,
            dy
          ) => {
            output.moveCursor(
              dx,
              dy
            );
          }
        : undefined,

    clearScreenDown:
      typeof output.clearScreenDown ===
        "function"
        ? () => {
            output.clearScreenDown();
          }
        : undefined
  };
}


function hostOf(
  inputUrl:
    string
): string {

  try {

    return new URL(
      inputUrl
    )
      .hostname
      .replace(
        /^www\./,
        ""
      );
  }
  catch {

    return inputUrl;
  }
}


function terminalCount(
  counters:
    RunCounterSnapshot
): number {

  return (
    counters.accept +
    counters.review +
    counters.exclude +
    counters.error
  );
}


function percent(
  completed:
    number,
  total:
    number
): number |
  null {

  if (
    total <=
      0
  ) {
    return null;
  }


  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        completed /
        total *
        100
      )
    )
  );
}


function durationText(
  milliseconds:
    number
): string {

  const seconds =
    Math.max(
      0,
      Math.floor(
        milliseconds /
        1000
      )
    );


  const hours =
    Math.floor(
      seconds /
      3600
    );


  const minutes =
    Math.floor(
      (
        seconds %
        3600
      ) /
      60
    );


  const remaining =
    seconds %
    60;


  return [
    hours,
    minutes,
    remaining
  ]
    .map(
      value =>
        value
          .toString()
          .padStart(
            2,
            "0"
          )
    )
    .join(
      ":"
    );
}


function stageMarker(
  status:
    TerminalStageStatus
): string {

  switch (
    status
  ) {

    case "ACTIVE":
      return "[>]";

    case "DONE":
      return "[OK]";

    case "FAILED":
      return "[FAIL]";

    default:
      return "[ ]";
  }
}


function clipLine(
  line:
    string,
  columns:
    number |
    undefined
): string {

  if (
    columns ===
      undefined ||
    columns <
      24
  ) {
    return line;
  }


  const limit =
    columns -
    1;


  if (
    line.length <=
      limit
  ) {
    return line;
  }


  if (
    limit <=
      3
  ) {
    return line.slice(
      0,
      limit
    );
  }


  return (
    line.slice(
      0,
      limit -
      3
    ) +
    "..."
  );
}


interface ActiveDetail {
  readonly url:
    string;

  readonly index:
    number;

  readonly total:
    number;
}


export class TerminalRenderer {
  private readonly output:
    TerminalRendererOutput;

  private readonly now:
    () =>
      number;

  private readonly plainIntervalMs:
    number;

  private readonly repaintMode:
    boolean;


  private hasRunStarted =
    false;

  private runId:
    string |
    null =
      null;

  private website:
    string |
    null =
      null;

  private mode:
    "NEW" |
    "RESUME" |
    null =
      null;

  private browserMode:
    "VISIBLE" |
    "HEADLESS" |
    null =
      null;

  private workers:
    number |
    null =
      null;

  private outputPath:
    string |
    null =
      null;

  private runStatus:
    TerminalRunStatus =
      "IDLE";

  private reconciliation:
    TerminalReconciliationStatus =
      "UNKNOWN";

  private counters:
    RunCounterSnapshot = {
      ...EMPTY_COUNTERS
    };

  private readonly stages =
    new Map<
      RunStage,
      TerminalStageStatus
    >();

  private readonly activeDetails =
    new Map<
      number,
      ActiveDetail
    >();

  private startedAtMs:
    number |
    null =
      null;

  private renderedLineCount =
    0;

  private lastPlainProgressAt =
    Number.NEGATIVE_INFINITY;

  private lastPlainProgressSignature:
    string |
    null =
      null;

  private failureMessage:
    string |
    null =
      null;


  constructor(
    options:
      TerminalRendererOptions = {}
  ) {

    this.output =
      options.output ??
      processOutput();

    this.now =
      options.now ??
      (() =>
        Date.now()
      );

    this.plainIntervalMs =
      Math.max(
        0,
        options.plainIntervalMs ??
        5000
      );


    this.repaintMode =
      this.output.isTTY ===
        true &&
      typeof this.output.cursorTo ===
        "function" &&
      typeof this.output.moveCursor ===
        "function" &&
      typeof this.output.clearScreenDown ===
        "function";
  }


  readonly onEvent:
    RunEventListener =
      event => {

        this.apply(
          event
        );


        const visibleTerminalEvent =
          event.type ===
            "RUN_FAILED" ||
          event.type ===
            "RUN_INTERRUPTED";


        /*
         * Coordinator initial counters can legitimately arrive
         * before orchestration RUN_STARTED. Keep the state but do
         * not print an orphan progress line/frame.
         */
        if (
          !this.hasRunStarted &&
          !visibleTerminalEvent
        ) {
          return;
        }


        if (
          this.repaintMode
        ) {

          this.repaint();

          return;
        }


        this.renderPlain(
          event
        );
      };


  isRepaintMode():
    boolean {

    return this.repaintMode;
  }


  snapshot():
    TerminalRendererSnapshot {

    const detailCompleted =
      terminalCount(
        this.counters
      );


    const stages =
      STAGE_ORDER
        .filter(
          stage =>
            this.stages.has(
              stage
            )
        )
        .map(
          stage => ({
            stage,

            status:
              this.stages.get(
                stage
              )!
          })
        );


    return {
      runId:
        this.runId,

      website:
        this.website,

      mode:
        this.mode,

      browserMode:
        this.browserMode,

      workers:
        this.workers,

      outputPath:
        this.outputPath,

      runStatus:
        this.runStatus,

      stages,

      counters: {
        ...this.counters
      },

      detailCompleted,

      detailTotal:
        this.counters.total,

      detailPercent:
        percent(
          detailCompleted,
          this.counters.total
        ),

      currentVisible:
        this.currentVisible(),

      reconciliation:
        this.reconciliation,

      elapsedMs:
        this.elapsed(),

      failureMessage:
        this.failureMessage
    };
  }


  frame():
    string {

    const snapshot =
      this.snapshot();


    const lines:
      string[] = [
        "CAMERA INTELLIGENCE COLLECTOR",

        `Run: ${snapshot.runId ?? "-"}`,

        `Website: ${snapshot.website ?? "-"}`,

        [
          `Browser: ${snapshot.browserMode ?? "-"}`,
          `Workers: ${snapshot.workers ?? "-"}`,
          `Output: ${snapshot.outputPath ?? "AUTO"}`
        ].join(
          " | "
        ),

        `Status: ${snapshot.runStatus}`
      ];


    for (
      const stage
      of snapshot.stages
    ) {

      let suffix =
        "";


      if (
        stage.stage ===
          "DETAIL_COLLECTION"
      ) {

        const progress =
          snapshot.detailPercent ===
            null
            ? "N/A"
            : `${snapshot.detailPercent}%`;


        suffix =
          ` ${snapshot.detailCompleted} / ${snapshot.detailTotal} (${progress})`;
      }


      lines.push(
        `${stageMarker(stage.status)} ${STAGE_LABEL[stage.stage]}${suffix}`
      );
    }


    lines.push(
      [
        `ACCEPT ${snapshot.counters.accept}`,
        `REVIEW ${snapshot.counters.review}`,
        `EXCLUDE ${snapshot.counters.exclude}`,
        `ERROR ${snapshot.counters.error}`,
        `IN_PROGRESS ${snapshot.counters.inProgress}`
      ].join(
        " "
      )
    );


    lines.push(
      `Current visible: ${snapshot.currentVisible ?? "-"}`
    );


    lines.push(
      `Reconciliation: ${snapshot.reconciliation}`
    );


    lines.push(
      `Elapsed: ${durationText(snapshot.elapsedMs)}`
    );


    if (
      snapshot.failureMessage !==
        null
    ) {

      lines.push(
        `Failure: ${snapshot.failureMessage}`
      );
    }


    return lines.join(
      "\n"
    );
  }


  private apply(
    event:
      RunEvent
  ): void {

    switch (
      event.type
    ) {

      case "RUN_STARTED": {

        this.hasRunStarted =
          true;

        this.runId =
          event.runId;

        this.website =
          hostOf(
            event.inputUrl
          );

        this.mode =
          event.mode;

        this.browserMode =
          event.options.headless
            ? "HEADLESS"
            : "VISIBLE";

        this.workers =
          event.options.workers;

        this.outputPath =
          event.options.outputPath;

        this.runStatus =
          "RUNNING";

        this.failureMessage =
          null;


        const parsed =
          Date.parse(
            event.timestamp
          );


        this.startedAtMs =
          Number.isFinite(
            parsed
          )
            ? parsed
            : this.now();

        break;
      }


      case "STAGE_STARTED":

        this.stages.set(
          event.stage,
          "ACTIVE"
        );

        break;


      case "STAGE_COMPLETED":

        this.stages.set(
          event.stage,
          "DONE"
        );

        break;


      case "DETAIL_STARTED":

        this.stages.set(
          "DETAIL_COLLECTION",
          this.stages.get(
            "DETAIL_COLLECTION"
          ) ??
          "ACTIVE"
        );

        this.activeDetails.set(
          event.workerId,
          {
            url:
              event.url,

            index:
              event.index,

            total:
              event.total
          }
        );

        break;


      case "DETAIL_FINISHED": {

        const active =
          this.activeDetails.get(
            event.workerId
          );


        if (
          active?.url ===
            event.url
        ) {

          this.activeDetails.delete(
            event.workerId
          );
        }

        break;
      }


      case "COUNTERS_UPDATED":

        this.counters = {
          ...event.counters
        };

        break;


      case "RECONCILIATION_COMPLETED":

        this.stages.set(
          "AUDIT_RECONCILE",
          this.stages.get(
            "AUDIT_RECONCILE"
          ) ??
          "DONE"
        );


        this.reconciliation =
          event.report.balanced &&
          event.report.inProgress ===
            0
            ? "PASS"
            : "FAIL";

        break;


      case "EXPORT_STARTED":

        this.stages.set(
          "EXCEL_EXPORT",
          this.stages.get(
            "EXCEL_EXPORT"
          ) ??
          "ACTIVE"
        );

        this.outputPath =
          event.targetPath;

        break;


      case "EXPORT_COMPLETED":

        this.outputPath =
          event.targetPath;

        break;


      case "RUN_COMPLETED":

        this.runId =
          event.runId;

        this.runStatus =
          event.status;

        this.counters = {
          ...event.summary
        };


        if (
          event.outputPath !==
            null
        ) {

          this.outputPath =
            event.outputPath;
        }

        break;


      case "RUN_INTERRUPTED":

        this.runId =
          event.runId;

        this.runStatus =
          "INTERRUPTED";

        break;


      case "RUN_FAILED":

        if (
          event.runId !==
            null
        ) {

          this.runId =
            event.runId;
        }


        this.runStatus =
          "FAILED";

        this.failureMessage =
          `${event.errorClass}: ${event.message}`;


        for (
          const [
            stage,
            status
          ]
          of this.stages
        ) {

          if (
            status ===
              "ACTIVE"
          ) {

            this.stages.set(
              stage,
              "FAILED"
            );
          }
        }

        break;


      default:
        break;
    }
  }


  private currentVisible():
    string |
    null {

    const observer =
      this.activeDetails.get(
        1
      );


    if (observer) {
      return observer.url;
    }


    const workerIds =
      [
        ...this.activeDetails.keys()
      ]
        .sort(
          (
            left,
            right
          ) =>
            left -
            right
        );


    const first =
      workerIds[0];


    if (
      first ===
        undefined
    ) {
      return null;
    }


    return (
      this.activeDetails.get(
        first
      )?.url ??
      null
    );
  }


  private elapsed():
    number {

    if (
      this.startedAtMs ===
        null
    ) {
      return 0;
    }


    return Math.max(
      0,
      this.now() -
      this.startedAtMs
    );
  }


  private repaint():
    void {

    const lines =
      this.frame()
        .split(
          "\n"
        )
        .map(
          line =>
            clipLine(
              line,
              this.output.columns
            )
        );


    if (
      this.renderedLineCount >
        0
    ) {

      this.output.cursorTo!(
        0
      );

      this.output.moveCursor!(
        0,
        -this.renderedLineCount
      );

      this.output.clearScreenDown!();
    }


    this.output.write(
      lines.join(
        "\n"
      ) +
      "\n"
    );


    this.renderedLineCount =
      lines.length;
  }


  private renderPlain(
    event:
      RunEvent
  ): void {

    switch (
      event.type
    ) {

      case "RUN_STARTED":

        this.writePlain(
          [
            "[RUN]",
            event.runId,
            this.website ??
              event.inputUrl,
            `Browser=${this.browserMode ?? "-"}`,
            `Workers=${this.workers ?? "-"}`,
            `Output=${this.outputPath ?? "AUTO"}`
          ].join(
            " "
          )
        );

        return;


      case "STAGE_STARTED":

        this.writePlain(
          `[STAGE] ${event.stage} START`
        );

        return;


      case "STAGE_COMPLETED":

        this.writePlain(
          `[STAGE] ${event.stage} DONE ${event.durationMs}ms`
        );

        return;


      case "RECONCILIATION_COMPLETED":

        this.writePlain(
          `[RECONCILE] ${this.reconciliation}`
        );

        return;


      case "EXPORT_COMPLETED":

        this.writePlain(
          `[EXPORT] saved ${event.targetPath}`
        );

        return;


      case "RUN_COMPLETED": {

        const snapshot =
          this.snapshot();


        this.writePlain(
          [
            "[RUN]",
            event.status,
            `run=${event.runId}`,
            `ACCEPT=${snapshot.counters.accept}`,
            `REVIEW=${snapshot.counters.review}`,
            `EXCLUDE=${snapshot.counters.exclude}`,
            `ERROR=${snapshot.counters.error}`,
            `IN_PROGRESS=${snapshot.counters.inProgress}`,
            `output=${snapshot.outputPath ?? "AUTO"}`
          ].join(
            " "
          )
        );

        return;
      }


      case "RUN_INTERRUPTED":

        this.writePlain(
          [
            "[RUN]",
            "INTERRUPTED",
            `run=${event.runId}`,
            `remaining=${event.remaining ?? "UNKNOWN"}`
          ].join(
            " "
          )
        );

        return;


      case "RUN_FAILED":

        this.writePlain(
          `[RUN] FAILED ${event.errorClass}: ${event.message}`
        );

        return;


      case "COUNTERS_UPDATED":
      case "DETAIL_STARTED":
      case "DETAIL_FINISHED":
      case "ERROR_RECORDED":

        this.maybeWritePlainProgress();

        return;


      default:
        return;
    }
  }


  private maybeWritePlainProgress():
    void {

    const snapshot =
      this.snapshot();


    const detailProgress =
      snapshot.detailPercent ===
        null
        ? "N/A"
        : `${snapshot.detailPercent}%`;


    const signature =
      [
        snapshot.detailCompleted,
        snapshot.detailTotal,
        snapshot.counters.accept,
        snapshot.counters.review,
        snapshot.counters.exclude,
        snapshot.counters.error,
        snapshot.counters.inProgress
      ].join(
        ":"
      );


    if (
      signature ===
        this.lastPlainProgressSignature
    ) {
      return;
    }


    const now =
      this.now();


    if (
      now -
      this.lastPlainProgressAt <
      this.plainIntervalMs
    ) {
      return;
    }


    this.lastPlainProgressAt =
      now;

    this.lastPlainProgressSignature =
      signature;


    this.writePlain(
      [
        "[PROGRESS]",
        `detail ${snapshot.detailCompleted}/${snapshot.detailTotal}`,
        `(${detailProgress})`,
        `ACCEPT=${snapshot.counters.accept}`,
        `REVIEW=${snapshot.counters.review}`,
        `EXCLUDE=${snapshot.counters.exclude}`,
        `ERROR=${snapshot.counters.error}`,
        `IN_PROGRESS=${snapshot.counters.inProgress}`
      ].join(
        " "
      )
    );
  }


  private writePlain(
    line:
      string
  ): void {

    this.output.write(
      clipLine(
        line,
        this.output.columns
      ) +
      "\n"
    );
  }
}