export type CollectorDisposition =
  | "CAMERA"
  | "NON_CAMERA"
  | "REVIEW"
  | "AI_PENDING";


export type CollectorReasoningProfile =
  | "LOW"
  | "MEDIUM";


export type CollectorEvent =
  | {
      readonly type:
        "RUN_STARTED";

      readonly at:
        number;

      readonly runId:
        string;

      readonly rootUrl:
        string;
    }

  | {
      readonly type:
        "URL_DISCOVERED";

      readonly at:
        number;

      readonly url:
        string;
    }

  | {
      readonly type:
        "BROWSER_OPEN";

      readonly at:
        number;

      readonly url:
        string;
    }

  | {
      readonly type:
        "BROWSER_SCROLL";

      readonly at:
        number;

      readonly url:
        string;

      readonly target?:
        string;
    }

  | {
      readonly type:
        "BROWSER_HIGHLIGHT";

      readonly at:
        number;

      readonly url:
        string;

      readonly target:
        string;

      readonly label?:
        string;
    }

  | {
      readonly type:
        "EVIDENCE_FOUND";

      readonly at:
        number;

      readonly url:
        string;

      readonly evidenceId:
        string;

      readonly fieldHint:
        string;

      readonly rawValue:
        string;
    }

  | {
      readonly type:
        "AI_ATTEMPT_STARTED";

      readonly at:
        number;

      readonly url:
        string;

      readonly provider:
        string;

      readonly model:
        string;

      readonly reasoning:
        CollectorReasoningProfile;

      readonly attempt:
        number;
    }

  | {
      readonly type:
        "AI_ATTEMPT_COMPLETED";

      readonly at:
        number;

      readonly url:
        string;

      readonly provider:
        string;

      readonly model:
        string;

      readonly reasoning:
        CollectorReasoningProfile;

      readonly attempt:
        number;

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

  | {
      readonly type:
        "VALIDATION_COMPLETED";

      readonly at:
        number;

      readonly url:
        string;

      readonly status:
        string;

      readonly issues:
        readonly string[];
    }

  | {
      readonly type:
        "BROWSER_CLOSE";

      readonly at:
        number;

      readonly url:
        string;
    }

  | {
      readonly type:
        "URL_COMPLETED";

      readonly at:
        number;

      readonly url:
        string;

      readonly disposition:
        CollectorDisposition;
    }

  | {
      readonly type:
        "RUN_COMPLETED";

      readonly at:
        number;

      readonly runId:
        string;
    }

  | {
      readonly type:
        "RUN_FAILED";

      readonly at:
        number;

      readonly runId:
        string;

      readonly message:
        string;
    };


export type CollectorEventSink =
  (
    event:
      CollectorEvent
  ) =>
    void;


export const NOOP_COLLECTOR_EVENT_SINK:
  CollectorEventSink =
    () => {
      // Intentionally empty.
    };


export function emitCollectorEvent(
  sink:
    CollectorEventSink |
    undefined,

  event:
    CollectorEvent
): void {

  (
    sink ??
    NOOP_COLLECTOR_EVENT_SINK
  )(
    event
  );
}