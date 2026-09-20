import type {
  RunState,
  RunUrlState
} from "./runState.js";

export type ResumeAction =
  | "CAPTURE"
  | "AI_EXTRACT"
  | "VALIDATE"
  | "COMMIT"
  | "REVIEW_HOLD"
  | "SKIP_COMMITTED";

export interface ResumeWorkItem {
  readonly index: number;
  readonly url: string;
  readonly action: ResumeAction;
  readonly reuseCapture: boolean;
  readonly captureManifestPath: string | null;
  readonly resultJsonPath: string | null;
  readonly requestPayloadPath: string | null;
}

function requireCapture(
  item: RunUrlState
): void {
  if (!item.captureManifestPath) {
    throw new Error(
      "Durable state invariant violated: " + item.status +
      " requires captureManifestPath for index " + item.index
    );
  }
}

function requireResult(
  item: RunUrlState
): void {
  if (!item.resultJsonPath) {
    throw new Error(
      "Durable state invariant violated: " + item.status +
      " requires resultJsonPath for index " + item.index
    );
  }
}

export function planResumeForItem(
  item: RunUrlState
): ResumeWorkItem {
  switch (item.status) {
    case "PENDING":
      return {
        index: item.index,
        url: item.url,
        action: "CAPTURE",
        reuseCapture: false,
        captureManifestPath: null,
        resultJsonPath: null,
        requestPayloadPath: null
      };

    case "CAPTURED":
    case "AI_IN_FLIGHT":
      requireCapture(item);
      return {
        index: item.index,
        url: item.url,
        action: "AI_EXTRACT",
        reuseCapture: true,
        captureManifestPath: item.captureManifestPath,
        resultJsonPath: item.resultJsonPath,
        requestPayloadPath: item.requestPayloadPath
      };

    case "EXTRACTED":
      requireCapture(item);
      requireResult(item);
      return {
        index: item.index,
        url: item.url,
        action: "VALIDATE",
        reuseCapture: true,
        captureManifestPath: item.captureManifestPath,
        resultJsonPath: item.resultJsonPath,
        requestPayloadPath: item.requestPayloadPath
      };

    case "VALIDATED":
      requireResult(item);
      return {
        index: item.index,
        url: item.url,
        action: item.workbookCommitted ? "SKIP_COMMITTED" : "COMMIT",
        reuseCapture: Boolean(item.captureManifestPath),
        captureManifestPath: item.captureManifestPath,
        resultJsonPath: item.resultJsonPath,
        requestPayloadPath: item.requestPayloadPath
      };

    case "REVIEW":
      return {
        index: item.index,
        url: item.url,
        action: "REVIEW_HOLD",
        reuseCapture: Boolean(item.captureManifestPath),
        captureManifestPath: item.captureManifestPath,
        resultJsonPath: item.resultJsonPath,
        requestPayloadPath: item.requestPayloadPath
      };

    case "COMMITTED":
      return {
        index: item.index,
        url: item.url,
        action: "SKIP_COMMITTED",
        reuseCapture: Boolean(item.captureManifestPath),
        captureManifestPath: item.captureManifestPath,
        resultJsonPath: item.resultJsonPath,
        requestPayloadPath: item.requestPayloadPath
      };
  }
}

export function planResume(
  state: RunState
): readonly ResumeWorkItem[] {
  return state.items.map(planResumeForItem);
}
