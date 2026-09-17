import type {
  NetworkObserverSnapshot
} from "../network/networkObserver.js";

export type AcquisitionStage =
  | "NAVIGATION"
  | "SETTLE"
  | "NETWORK"
  | "DOM"
  | "INTERACTION"
  | "SNAPSHOT";

export type InteractionKind =
  | "CLICK"
  | "TAB"
  | "ACCORDION"
  | "LOAD_MORE"
  | "SCROLL"
  | "OTHER";

export type InteractionOutcome =
  | "SUCCESS"
  | "NO_CHANGE"
  | "SKIPPED"
  | "ERROR";

export interface AcquisitionError {
  stage: AcquisitionStage;

  code: string;

  message: string;

  retriable: boolean;

  status: number | null;

  timestamp: string;
}

export interface InteractionEvent {
  kind: InteractionKind;

  target: string;

  outcome: InteractionOutcome;

  startedAt: string;

  finishedAt: string;

  detail: string | null;
}

export interface DetailAcquisitionTiming {
  navigationMs: number;

  settleMs: number;

  interactionMs: number;

  totalMs: number;
}

/**
 * Technical acquisition result for one product-detail URL.
 *
 * This contract intentionally does not contain resolved business
 * values such as product entity, transaction type, price, stock,
 * rating or condition.
 *
 * Acquisition observes and preserves evidence. Classification,
 * resolution and validation remain downstream responsibilities.
 */
export interface DetailAcquisitionResult {
  requestedUrl: string;

  finalUrl: string;

  canonicalUrl: string;

  html: string;

  networkSnapshot:
    NetworkObserverSnapshot;

  interactions:
    InteractionEvent[];

  timing:
    DetailAcquisitionTiming;

  errors:
    AcquisitionError[];
}

export function hasRetriableAcquisitionError(
  result: Pick<
    DetailAcquisitionResult,
    "errors"
  >
): boolean {
  return result.errors.some(
    error => error.retriable
  );
}

export function hasNonRetriableAcquisitionError(
  result: Pick<
    DetailAcquisitionResult,
    "errors"
  >
): boolean {
  return result.errors.some(
    error => !error.retriable
  );
}

export function isValidAcquisitionTiming(
  timing: DetailAcquisitionTiming
): boolean {
  return [
    timing.navigationMs,
    timing.settleMs,
    timing.interactionMs,
    timing.totalMs
  ].every(
    value =>
      Number.isFinite(value) &&
      value >= 0
  );
}