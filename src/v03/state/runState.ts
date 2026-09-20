import type {
  ProviderErrorClass
} from "../provider/errorClassifier.js";

export const RUN_STATE_SCHEMA_VERSION = 1 as const;

export type RunItemStatus =
  | "PENDING"
  | "CAPTURED"
  | "AI_IN_FLIGHT"
  | "EXTRACTED"
  | "VALIDATED"
  | "REVIEW"
  | "COMMITTED";

export interface TokenUsage {
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

export interface RunUrlState {
  readonly index: number;
  readonly url: string;
  readonly status: RunItemStatus;
  readonly captureManifestPath: string | null;
  readonly resultJsonPath: string | null;
  readonly requestPayloadPath: string | null;
  readonly workbookCommitted: boolean;
  readonly providerProfileId: string | null;
  readonly errorClass: ProviderErrorClass | null;
  readonly attempts: number;
  readonly latencyMs: number | null;
  readonly tokenUsage: TokenUsage | null;
  readonly updatedAt: string;
}

export interface RunState {
  readonly schemaVersion: typeof RUN_STATE_SCHEMA_VERSION;
  readonly runId: string;
  readonly inputHash: string;
  readonly currentIndex: number;
  readonly urls: readonly string[];
  readonly items: readonly RunUrlState[];
  readonly lastCommittedIndex: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

const ALLOWED_TRANSITIONS: Readonly<Record<RunItemStatus, readonly RunItemStatus[]>> = {
  PENDING: ["CAPTURED", "REVIEW"],
  CAPTURED: ["AI_IN_FLIGHT", "REVIEW"],
  AI_IN_FLIGHT: ["EXTRACTED", "REVIEW"],
  EXTRACTED: ["VALIDATED", "REVIEW"],
  VALIDATED: ["COMMITTED", "REVIEW"],
  REVIEW: ["COMMITTED"],
  COMMITTED: []
};

export function createRunState(input: {
  readonly runId: string;
  readonly inputHash: string;
  readonly urls: readonly string[];
  readonly now?: Date;
}): RunState {
  const now = (input.now ?? new Date()).toISOString();

  return {
    schemaVersion: RUN_STATE_SCHEMA_VERSION,
    runId: input.runId,
    inputHash: input.inputHash,
    currentIndex: 0,
    urls: [...input.urls],
    items: input.urls.map((url, index) => ({
      index,
      url,
      status: "PENDING",
      captureManifestPath: null,
      resultJsonPath: null,
      requestPayloadPath: null,
      workbookCommitted: false,
      providerProfileId: null,
      errorClass: null,
      attempts: 0,
      latencyMs: null,
      tokenUsage: null,
      updatedAt: now
    })),
    lastCommittedIndex: -1,
    createdAt: now,
    updatedAt: now
  };
}

export function assertRunState(
  value: unknown
): asserts value is RunState {
  if (value === null || typeof value !== "object") {
    throw new Error("Invalid run state: expected object");
  }

  const state = value as Partial<RunState>;

  if (state.schemaVersion !== RUN_STATE_SCHEMA_VERSION) {
    throw new Error(
      "Unsupported run state schemaVersion: " + String(state.schemaVersion)
    );
  }

  if (
    typeof state.runId !== "string" ||
    typeof state.inputHash !== "string" ||
    !Array.isArray(state.urls) ||
    !Array.isArray(state.items)
  ) {
    throw new Error("Invalid run state shape");
  }

  if (state.urls.length !== state.items.length) {
    throw new Error("Run state URL/item length mismatch");
  }

  for (let index = 0; index < state.items.length; index += 1) {
    const item = state.items[index] as Partial<RunUrlState>;
    if (
      item.index !== index ||
      item.url !== state.urls[index] ||
      typeof item.status !== "string" ||
      !Object.prototype.hasOwnProperty.call(ALLOWED_TRANSITIONS, item.status)
    ) {
      throw new Error("Invalid run state item at index " + index);
    }
  }
}

export function transitionRunItem(
  state: RunState,
  index: number,
  nextStatus: RunItemStatus,
  patch: Partial<Omit<RunUrlState, "index" | "url" | "status">> = {},
  now = new Date()
): RunState {
  const current = state.items[index];
  if (!current) {
    throw new Error("Unknown run item index: " + index);
  }

  if (current.status !== nextStatus) {
    const allowed = ALLOWED_TRANSITIONS[current.status];
    if (!allowed.includes(nextStatus)) {
      throw new Error(
        "Invalid run state transition: " + current.status + " -> " + nextStatus
      );
    }
  }

  const updatedAt = now.toISOString();
  const nextItem: RunUrlState = {
    ...current,
    ...patch,
    status: nextStatus,
    workbookCommitted:
      nextStatus === "COMMITTED"
        ? true
        : patch.workbookCommitted ?? current.workbookCommitted,
    updatedAt
  };

  const items = [...state.items];
  items[index] = nextItem;

  const committedIndexes = items
    .filter(item => item.status === "COMMITTED" || item.workbookCommitted)
    .map(item => item.index);

  return {
    ...state,
    currentIndex: Math.min(index, Math.max(0, state.urls.length - 1)),
    items,
    lastCommittedIndex:
      committedIndexes.length > 0
        ? Math.max(...committedIndexes)
        : -1,
    updatedAt
  };
}
