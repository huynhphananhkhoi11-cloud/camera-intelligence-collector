export type BrowserAgentField =
  | "PRODUCT"
  | "CURRENT_PRICE"
  | "OLD_PRICE"
  | "STOCK"
  | "CONDITION"
  | "VARIANT"
  | "SPECS"
  | "RATING"
  | "REVIEWS";


export type BrowserAgentActionType =
  | "SCROLL_TO"
  | "CLICK"
  | "SELECT"
  | "INSPECT"
  | "WAIT"
  | "FINISH";


export interface BrowserAgentCandidate {
  readonly id:
    string;

  readonly tag:
    string;

  readonly role:
    string |
    null;

  readonly text:
    string;

  readonly value:
    string |
    null;

  readonly selected:
    boolean;

  readonly href:
    string |
    null;
}


export interface BrowserAgentObservation {
  readonly url:
    string;

  readonly title:
    string;

  readonly viewportText:
    string;

  readonly candidates:
    readonly BrowserAgentCandidate[];
}


export interface BrowserAgentAction {
  readonly action:
    BrowserAgentActionType;

  readonly targetId:
    string |
    null;

  readonly field:
    BrowserAgentField |
    null;

  readonly value:
    string |
    null;

  /*
   * Short observable explanation for UI.
   * This is NOT model chain-of-thought.
   */
  readonly reason:
    string;
}


export interface BrowserAgentPlan {
  readonly summary:
    string;

  readonly actions:
    readonly BrowserAgentAction[];

  readonly unresolvedFields:
    readonly BrowserAgentField[];
}


export interface BrowserPlannerUsage {
  readonly inputTokens:
    number;

  readonly outputTokens:
    number;

  readonly thoughtTokens:
    number;

  readonly cachedTokens:
    number;

  readonly totalTokens:
    number;

  readonly toolUseTokens:
    number;

  readonly latencyMs:
    number;
}


export interface BrowserPlannerResult {
  readonly interactionId:
    string |
    null;

  readonly plan:
    BrowserAgentPlan;

  readonly usage:
    BrowserPlannerUsage;
}


export type BrowserAgentEvent =
  | {
      readonly type:
        "SESSION_STARTED";

      readonly url:
        string;
    }

  | {
      readonly type:
        "PLANNER_STARTED";

      readonly turn:
        number;

      readonly estimatedInputTokens:
        number;
    }

  | {
      readonly type:
        "PLANNER_WAITING";

      readonly turn:
        number;

      readonly elapsedMs:
        number;
    }

  | {
      readonly type:
        "PLANNER_COMPLETED";

      readonly turn:
        number;

      readonly usage:
        BrowserPlannerUsage;
    }

  | {
      readonly type:
        "ACTION_STARTED";

      readonly action:
        BrowserAgentAction;
    }

  | {
      readonly type:
        "ACTION_COMPLETED";

      readonly action:
        BrowserAgentAction;

      readonly detail:
        string;
    }

  | {
      readonly type:
        "BUDGET_UPDATED";

      readonly inputTokens:
        number;

      readonly remainingInputTokens:
        number;

      readonly level:
        string;
    }

  | {
      readonly type:
        "SESSION_COMPLETED";

      readonly url:
        string;
    };


export type BrowserAgentEventSink =
  (
    event:
      BrowserAgentEvent
  ) =>
    void;