export type RunStage =
  | "BOOTSTRAP"
  | "SITE_PROFILING"
  | "ROOT_DISCOVERY"
  | "PRODUCT_DISCOVERY"
  | "DETAIL_COLLECTION"
  | "AUDIT_RECONCILE"
  | "EXCEL_EXPORT";


export type RunDecision =
  | "ACCEPT"
  | "REVIEW"
  | "EXCLUDE"
  | "ERROR";


export interface RunStartOptionsSnapshot {
  readonly headless:
    boolean;

  readonly workers:
    number;

  readonly fresh:
    boolean;

  readonly outputPath:
    string |
    null;
}


export interface RunCounterSnapshot {
  readonly accept:
    number;

  readonly review:
    number;

  readonly exclude:
    number;

  readonly error:
    number;

  readonly inProgress:
    number;

  readonly total:
    number;
}


export interface RunReconciliationSnapshot {
  readonly discovered:
    number;

  readonly accept:
    number;

  readonly review:
    number;

  readonly exclude:
    number;

  readonly error:
    number;

  readonly inProgress:
    number;

  readonly balanced:
    boolean;
}


export type RunEventSummary =
  Readonly<
    Record<
      string,
      string |
      number |
      boolean |
      null
    >
  >;


export type RunEventPayload =
  | {
      readonly type:
        "RUN_STARTED";

      readonly runId:
        string;

      readonly inputUrl:
        string;

      readonly mode:
        "NEW" |
        "RESUME";

      readonly options:
        RunStartOptionsSnapshot;
    }

  | {
      readonly type:
        "STAGE_STARTED";

      readonly runId:
        string;

      readonly stage:
        RunStage;
    }

  | {
      readonly type:
        "STAGE_COMPLETED";

      readonly runId:
        string;

      readonly stage:
        RunStage;

      readonly durationMs:
        number;

      readonly summary:
        RunEventSummary;
    }

  | {
      readonly type:
        "ROOT_FOUND";

      readonly runId:
        string;

      readonly url:
        string;

      readonly score:
        number |
        null;

      readonly evidenceSummary:
        readonly string[];
    }

  | {
      readonly type:
        "PRODUCT_DISCOVERED";

      readonly runId:
        string;

      readonly canonicalUrl:
        string;

      readonly source:
        string;

      readonly discoveredCount:
        number;
    }

  | {
      readonly type:
        "DETAIL_STARTED";

      readonly runId:
        string;

      readonly url:
        string;

      readonly workerId:
        number;

      readonly index:
        number;

      readonly total:
        number;
    }

  | {
      readonly type:
        "DETAIL_FINISHED";

      readonly runId:
        string;

      readonly url:
        string;

      readonly workerId:
        number;

      readonly decision:
        RunDecision;

      readonly durationMs:
        number;
    }

  | {
      readonly type:
        "ERROR_RECORDED";

      readonly runId:
        string;

      readonly url:
        string |
        null;

      readonly stage:
        string;

      readonly errorClass:
        string;

      readonly retriable:
        boolean;

      readonly attempts:
        number;
    }

  | {
      readonly type:
        "COUNTERS_UPDATED";

      readonly runId:
        string;

      readonly counters:
        RunCounterSnapshot;
    }

  | {
      readonly type:
        "RETRY_SCHEDULED";

      readonly runId:
        string;

      readonly url:
        string;

      readonly attempt:
        number;

      readonly delayMs:
        number;

      readonly reason:
        string;
    }

  | {
      readonly type:
        "RECONCILIATION_COMPLETED";

      readonly runId:
        string;

      readonly report:
        RunReconciliationSnapshot;
    }

  | {
      readonly type:
        "EXPORT_STARTED";

      readonly runId:
        string;

      readonly targetPath:
        string;
    }

  | {
      readonly type:
        "EXPORT_COMPLETED";

      readonly runId:
        string;

      readonly targetPath:
        string;

      readonly fileHash:
        string |
        null;

      readonly fileSize:
        number |
        null;
    }

  | {
      readonly type:
        "RUN_COMPLETED";

      readonly runId:
        string;

      readonly status:
        "COMPLETED";

      readonly outputPath:
        string |
        null;

      readonly summary:
        RunCounterSnapshot;
    }

  | {
      readonly type:
        "RUN_INTERRUPTED";

      readonly runId:
        string;

      readonly remaining:
        number |
        null;
    }

  | {
      readonly type:
        "RUN_FAILED";

      readonly runId:
        string |
        null;

      readonly errorClass:
        string;

      readonly message:
        string;
    };


export type RunEvent =
  RunEventPayload &
  Readonly<{
    sequence:
      number;

    timestamp:
      string;
  }>;


export type RunEventListener =
  (
    event:
      RunEvent
  ) =>
    void;


export interface RunEventDeliveryFailure {
  readonly listenerIndex:
    number;

  readonly error:
    unknown;
}


export interface RunEventDeliveryReport {
  readonly event:
    RunEvent;

  readonly delivered:
    number;

  readonly failed:
    number;

  readonly failures:
    readonly RunEventDeliveryFailure[];
}


export interface RunEventBusOptions {
  readonly now?:
    () =>
      string;
}


export type UnsubscribeRunEvent =
  () =>
    void;

function deepFreeze<
  T
>(
  value:
    T
): T {

  if (
    value ===
      null ||
    typeof value !==
      "object" ||
    Object.isFrozen(
      value
    )
  ) {
    return value;
  }


  for (
    const nested
    of Object.values(
      value as
        Record<
          string,
          unknown
        >
    )
  ) {
    deepFreeze(
      nested
    );
  }


  Object.freeze(
    value
  );


  return value;
}


interface ListenerRegistration {
  readonly id:
    number;

  readonly listener:
    RunEventListener;
}


export class RunEventBus {
  private readonly now:
    () =>
      string;


  private listeners:
    ListenerRegistration[] =
      [];


  private nextListenerId =
    1;


  private nextSequence =
    1;


  constructor(
    options:
      RunEventBusOptions = {}
  ) {
    this.now =
      options.now ??
      (() =>
        new Date()
          .toISOString()
      );
  }


  subscribe(
    listener:
      RunEventListener
  ): UnsubscribeRunEvent {

    if (
      typeof listener !==
        "function"
    ) {
      throw new Error(
        "RunEvent listener must be a function."
      );
    }


    const id =
      this.nextListenerId;


    this.nextListenerId +=
      1;


    this.listeners.push({
      id,
      listener
    });


    let active =
      true;


    return () => {

      if (
        !active
      ) {
        return;
      }


      active =
        false;


      this.listeners =
        this.listeners.filter(
          registration =>
            registration.id !==
            id
        );
    };
  }


  publish(
    payload:
      RunEventPayload
  ): RunEventDeliveryReport {

    /*
     * Detach from caller-owned mutable data first.
     *
     * UI/logging subscribers therefore observe the exact snapshot
     * that existed when publish() was called.
     */
    const clonedPayload =
      structuredClone(
        payload
      );


    /*
     * Evaluate the clock before consuming a sequence number.
     *
     * A faulty injected clock therefore cannot create a phantom
     * sequence gap.
     */
    const timestamp =
      this.now();


    const sequence =
      this.nextSequence;


    const event =
      deepFreeze({
        ...clonedPayload,

        sequence,

        timestamp
      }) as
        RunEvent;


    this.nextSequence =
      sequence +
      1;


    /*
     * Freeze membership for THIS delivery.
     *
     * subscribe()/unsubscribe() invoked from inside a listener
     * affect subsequent events, not an event already in flight.
     */
    const recipients =
      [
        ...this.listeners
      ];


    const failures:
      RunEventDeliveryFailure[] =
        [];


    let delivered =
      0;


    for (
      let index =
        0;
      index <
        recipients.length;
      index +=
        1
    ) {

      const registration =
        recipients[index]!;


      try {

        registration.listener(
          event
        );


        delivered +=
          1;
      }
      catch (
        error
      ) {

        /*
         * Event consumers are observability/UI infrastructure.
         * They must not mutate business truth or abort persisted
         * runtime transitions.
         */
        failures.push({
          listenerIndex:
            index,

          error
        });
      }
    }


    return deepFreeze({
      event,

      delivered,

      failed:
        failures.length,

      failures
    });
  }
}
