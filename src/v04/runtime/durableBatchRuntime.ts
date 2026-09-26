import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import {
  dirname,
  join,
  resolve
} from "node:path";

import type {
  Camera13Row,
  MinimalVisualDecision
} from "../contracts/minimalVisualDecision.js";

import {
  validateVisualDecision,
  type ValidationResult
} from "../validation/structuralValidator.js";

import {
  computeBoundedBackoffMs
} from "../../v03/provider/backoff.js";
import {
  ProviderPool,
  type ProviderRuntimeSnapshot
} from "../../v03/provider/providerPool.js";
import type {
  ResolvedProviderProfile
} from "../../v03/provider/providerProfile.js";
import {
  AtomicRunStateStore
} from "../../v03/state/atomicRunStateStore.js";
import {
  createRunState,
  transitionRunItem,
  type RunState,
  type RunUrlState
} from "../../v03/state/runState.js";


export interface BatchSummary {
  readonly total: number;
  readonly validated: number;
  readonly review: number;
  readonly skippedNonCamera: number;
  readonly errors: number;
}


export type DurableBatchProgressEvent =
  | {
      readonly type: "ITEM_START";
      readonly index: number;
      readonly total: number;
      readonly url: string;
    }
  | {
      readonly type: "CAPTURE_START";
      readonly index: number;
      readonly total: number;
      readonly url: string;
    }
  | {
      readonly type: "CAPTURED";
      readonly index: number;
      readonly total: number;
      readonly url: string;
    }
  | {
      readonly type: "GEMINI_ATTEMPT";
      readonly index: number;
      readonly total: number;
      readonly url: string;
      readonly attempt: number;
      readonly providerProfileId: string;
    }
  | {
      readonly type: "ITEM_DONE";
      readonly index: number;
      readonly total: number;
      readonly url: string;
      readonly status: ValidationResult["status"];
      readonly attempts: number;
    }
  | {
      readonly type: "ITEM_ERROR";
      readonly index: number;
      readonly total: number;
      readonly url: string;
      readonly errorClass: string;
      readonly message: string;
    };


export interface SemanticRequest {
  /**
   * Final browser URL after navigation. Runtime may authoritatively overwrite
   * only row.website and row.url from this value.
   */
  readonly authoritativeUrl: string;

  /** Durable capture artifact produced before the semantic request. */
  readonly captureManifestPath: string;

  /** Durable serialized provider request/checkpoint owned by the pipeline. */
  readonly requestPayloadPath: string;

  /**
   * Execute the same semantic request against one resolved provider profile.
   * Retries call execute again, but createSemanticRequest is not called again.
   */
  execute(
    profile: ResolvedProviderProfile
  ): Promise<MinimalVisualDecision>;
}


export interface DurableWorkbookSink {
  /** Replace the authoritative workbook row set; never append incrementally. */
  replaceRows(
    rows: readonly Camera13Row[]
  ): Promise<void>;
}


export interface DurableBatchItemError {
  readonly index: number;
  readonly url: string;
  readonly errorClass: string;
  readonly message: string;
}


export interface DurableBatchRuntimeResult {
  readonly runId: string;
  readonly statePath: string;
  readonly summary: BatchSummary;
  readonly pausedForQuota: boolean;
  readonly itemErrors: readonly DurableBatchItemError[];
  readonly providerState: readonly ProviderRuntimeSnapshot[];
}


export interface RunDurableBatchInput {
  readonly runId: string;
  readonly urls: readonly string[];
  readonly statePath: string;
  readonly providers: readonly ResolvedProviderProfile[];
  readonly createSemanticRequest: (
    input: {
      readonly index: number;
      readonly url: string;
    }
  ) => Promise<SemanticRequest>;
  readonly workbookSink: DurableWorkbookSink;
  readonly decisionRoot?: string;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
  readonly onProgress?: (
    event: DurableBatchProgressEvent
  ) => void;
}


interface SemanticExecutionResult {
  readonly decision: MinimalVisualDecision;
  readonly providerProfileId: string;
  readonly attempts: number;
}


class QuotaPauseError extends Error {
  public readonly errorClass = "DAILY_QUOTA";

  public constructor(
    message: string
  ) {
    super(message);
    this.name = "QuotaPauseError";
  }
}


function errorMessage(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


function errorClass(
  error: unknown
): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "errorClass" in error &&
    typeof (error as { errorClass?: unknown }).errorClass === "string"
  ) {
    return (error as { errorClass: string }).errorClass;
  }

  return "UNKNOWN";
}


function sha256(
  value: string
): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}


function inputHash(
  urls: readonly string[]
): string {
  return sha256(
    urls.join("\n")
  );
}


function sameUrls(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (value, index) =>
        value === right[index]
    )
  );
}


async function exists(
  filePath: string
): Promise<boolean> {
  try {
    await access(
      filePath,
      constants.F_OK
    );
    return true;
  }
  catch {
    return false;
  }
}


async function writeJsonAtomic(
  filePath: string,
  value: unknown
): Promise<void> {
  await mkdir(
    dirname(filePath),
    {
      recursive: true
    }
  );

  const tempPath =
    filePath +
    "." +
    process.pid +
    "." +
    Date.now() +
    ".tmp";

  try {
    await writeFile(
      tempPath,
      JSON.stringify(
        value,
        null,
        2
      ) + "\n",
      "utf8"
    );

    await rename(
      tempPath,
      filePath
    );
  }
  catch (error) {
    await rm(
      tempPath,
      {
        force: true
      }
    ).catch(
      () => undefined
    );

    throw error;
  }
}


async function readDecision(
  filePath: string
): Promise<unknown> {
  return JSON.parse(
    await readFile(
      filePath,
      "utf8"
    )
  ) as unknown;
}


function authoritativeDecision(
  decision: MinimalVisualDecision,
  authoritativeUrl: string
): MinimalVisualDecision {
  if (!decision.row) {
    return decision;
  }

  const finalUrl =
    new URL(
      authoritativeUrl
    ).toString();

  const website =
    new URL(
      finalUrl
    ).hostname
      .toLowerCase()
      .replace(
        /^www\./u,
        ""
      );

  return {
    ...decision,
    row: {
      ...decision.row,
      website,
      url: finalUrl
    }
  };
}


function decisionPathFor(
  decisionRoot: string,
  index: number
): string {
  return join(
    decisionRoot,
    String(
      index + 1
    ).padStart(
      4,
      "0"
    ) + ".decision.json"
  );
}


function rowsInOrder(
  validations: ReadonlyMap<number, ValidationResult>
): readonly Camera13Row[] {
  return [...validations.entries()]
    .sort(
      ([left], [right]) =>
        left - right
    )
    .flatMap(
      ([, validation]) =>
        validation.status === "VALIDATED"
          ? [validation.row]
          : []
    );
}


function summaryFor(
  urls: readonly string[],
  validations: ReadonlyMap<number, ValidationResult>,
  itemErrors: readonly DurableBatchItemError[]
): BatchSummary {
  const statuses =
    [...validations.values()].map(
      validation =>
        validation.status
    );

  return {
    total: urls.length,
    validated:
      statuses.filter(
        status =>
          status === "VALIDATED"
      ).length,
    review:
      statuses.filter(
        status =>
          status === "REVIEW"
      ).length,
    skippedNonCamera:
      statuses.filter(
        status =>
          status === "SKIPPED_NON_CAMERA"
      ).length,
    errors: itemErrors.length
  };
}


async function loadOrCreateState(
  input: RunDurableBatchInput,
  store: AtomicRunStateStore
): Promise<RunState> {
  const expectedHash =
    inputHash(
      input.urls
    );

  if (
    await exists(
      input.statePath
    )
  ) {
    const state =
      await store.load();

    if (
      state.runId !== input.runId ||
      state.inputHash !== expectedHash ||
      !sameUrls(
        state.urls,
        input.urls
      )
    ) {
      throw new Error(
        "Resume input does not match persisted V04 run state."
      );
    }

    return state;
  }

  const state =
    createRunState({
      runId: input.runId,
      inputHash: expectedHash,
      urls: input.urls,
      now: input.now?.()
    });

  await store.save(
    state
  );

  return state;
}


function transitionPersistedDecision(
  state: RunState,
  index: number,
  input: {
    readonly validation: ValidationResult;
    readonly decisionPath: string;
    readonly captureManifestPath: string;
    readonly requestPayloadPath: string | null;
    readonly providerProfileId: string | null;
    readonly attempts: number;
    readonly now: Date;
  }
): RunState {
  let next = state;
  let item = next.items[index]!;

  if (item.status === "PENDING") {
    next = transitionRunItem(
      next,
      index,
      "CAPTURED",
      {
        captureManifestPath:
          input.captureManifestPath,
        requestPayloadPath:
          input.requestPayloadPath
      },
      input.now
    );
    item = next.items[index]!;
  }

  if (item.status === "CAPTURED") {
    next = transitionRunItem(
      next,
      index,
      "AI_IN_FLIGHT",
      {
        providerProfileId:
          input.providerProfileId,
        attempts:
          Math.max(
            item.attempts,
            input.attempts
          ),
        errorClass: null
      },
      input.now
    );
    item = next.items[index]!;
  }

  if (item.status === "AI_IN_FLIGHT") {
    next = transitionRunItem(
      next,
      index,
      "EXTRACTED",
      {
        resultJsonPath:
          input.decisionPath,
        providerProfileId:
          input.providerProfileId ??
          item.providerProfileId,
        attempts:
          Math.max(
            item.attempts,
            input.attempts
          ),
        errorClass: null
      },
      input.now
    );
    item = next.items[index]!;
  }

  if (item.status === "EXTRACTED") {
    next = transitionRunItem(
      next,
      index,
      input.validation.status === "REVIEW"
        ? "REVIEW"
        : "VALIDATED",
      {},
      input.now
    );
    item = next.items[index]!;
  }

  if (item.status === "VALIDATED") {
    next = transitionRunItem(
      next,
      index,
      "COMMITTED",
      {},
      input.now
    );
  }

  return next;
}


function nextHealthyProfile(
  pool: ProviderPool,
  profiles: readonly ResolvedProviderProfile[],
  excluded: ReadonlySet<string>
): ResolvedProviderProfile | null {
  const health =
    new Map(
      pool.snapshot().map(
        item => [
          item.profileId,
          item.health
        ] as const
      )
    );

  for (const profile of profiles) {
    if (
      !excluded.has(
        profile.profile.id
      ) &&
      health.get(
        profile.profile.id
      ) === "HEALTHY"
    ) {
      return profile;
    }
  }

  return null;
}


async function executeSemanticRequest(
  request: SemanticRequest,
  pool: ProviderPool,
  profiles: readonly ResolvedProviderProfile[],
  options: {
    readonly sleep: (ms: number) => Promise<void>;
    readonly now: () => Date;
    readonly persistAttempt: (
      checkpoint: {
        readonly providerProfileId: string;
        readonly attempts: number;
        readonly errorClass: RunUrlState["errorClass"];
      }
    ) => Promise<void>;
  }
): Promise<SemanticExecutionResult> {
  let profile =
    pool.selectEligibleProfile();

  if (!profile) {
    throw new Error(
      "No eligible provider profile is available."
    );
  }

  const exhaustedTransient =
    new Set<string>();

  const retriedTransient =
    new Set<string>();

  const retriedRateLimit =
    new Set<string>();

  let attempts = 0;

  while (profile) {
    attempts += 1;

    await options.persistAttempt({
      providerProfileId:
        profile.profile.id,
      attempts,
      errorClass: null
    });

    try {
      return {
        decision:
          await request.execute(
            profile
          ),
        providerProfileId:
          profile.profile.id,
        attempts
      };
    }
    catch (error) {
      const decision =
        pool.handleFailure(
          profile.profile.id,
          error,
          {
            now: options.now()
          }
        );

      await options.persistAttempt({
        providerProfileId:
          profile.profile.id,
        attempts,
        errorClass:
          decision.classification.errorClass
      });

      switch (decision.action) {
        case "FAILOVER_CREDENTIAL": {
          const excluded =
            new Set<string>([
              profile.profile.id,
              ...exhaustedTransient
            ]);

          const next =
            nextHealthyProfile(
              pool,
              profiles,
              excluded
            );

          if (!next) {
            throw error;
          }

          profile = next;
          continue;
        }

        case "RETRY_ONCE_THEN_FAILOVER": {
          if (
            !retriedTransient.has(
              profile.profile.id
            )
          ) {
            retriedTransient.add(
              profile.profile.id
            );

            await options.sleep(
              computeBoundedBackoffMs({
                attempt: 1,
                retryAfterMs:
                  decision.retryAfterMs,
                jitterRatio: 0
              })
            );

            continue;
          }

          exhaustedTransient.add(
            profile.profile.id
          );

          const next =
            nextHealthyProfile(
              pool,
              profiles,
              exhaustedTransient
            );

          if (!next) {
            throw error;
          }

          profile = next;
          continue;
        }

        case "BACKOFF_SAME_PROJECT": {
          if (
            retriedRateLimit.has(
              profile.profile.id
            )
          ) {
            throw error;
          }

          retriedRateLimit.add(
            profile.profile.id
          );

          const startedAt =
            options.now();

          const delay =
            computeBoundedBackoffMs({
              attempt: 1,
              retryAfterMs:
                decision.retryAfterMs,
              jitterRatio: 0
            });

          await options.sleep(
            delay
          );

          pool.clearCooldowns(
            new Date(
              startedAt.getTime() +
              delay +
              1
            )
          );

          const sameProfile =
            pool.getProfile(
              profile.profile.id
            );

          if (!sameProfile) {
            throw error;
          }

          profile = sameProfile;
          continue;
        }

        case "PAUSE_AI_QUEUE":
          throw new QuotaPauseError(
            errorMessage(
              error
            )
          );

        case "REVIEW":
        default:
          throw Object.assign(
            error instanceof Error
              ? error
              : new Error(
                  errorMessage(
                    error
                  )
                ),
            {
              errorClass:
                decision
                  .classification
                  .errorClass
            }
          );
      }
    }
  }

  throw new Error(
    "No eligible provider profile is available."
  );
}


async function recoverPersistedDecision(
  item: RunUrlState,
  fallbackPath: string
): Promise<{
  readonly path: string;
  readonly decision: unknown;
} | null> {
  const candidates =
    [
      item.resultJsonPath,
      fallbackPath
    ].filter(
      (value): value is string =>
        Boolean(value)
    );

  for (const candidate of candidates) {
    if (
      await exists(
        candidate
      )
    ) {
      return {
        path: candidate,
        decision:
          await readDecision(
            candidate
          )
      };
    }
  }

  return null;
}


function emitProgress(
  input: RunDurableBatchInput,
  event: DurableBatchProgressEvent
): void {
  try {
    input.onProgress?.(
      event
    );
  }
  catch {
    // Progress rendering is observational and must never break collection.
  }
}


export async function runDurableBatch(
  input: RunDurableBatchInput
): Promise<DurableBatchRuntimeResult> {
  const statePath =
    resolve(
      input.statePath
    );

  const decisionRoot =
    resolve(
      input.decisionRoot ??
      join(
        dirname(
          statePath
        ),
        "v04-decisions"
      )
    );

  const sleep =
    input.sleep ??
    (
      (ms: number) =>
        new Promise<void>(
          resolvePromise => {
            setTimeout(
              resolvePromise,
              ms
            );
          }
        )
    );

  const now =
    input.now ??
    (() => new Date());

  const store =
    new AtomicRunStateStore(
      statePath
    );

  let state =
    await loadOrCreateState(
      {
        ...input,
        statePath
      },
      store
    );

  const pool =
    new ProviderPool(
      input.providers
    );

  const validations =
    new Map<number, ValidationResult>();

  const itemErrors:
    DurableBatchItemError[] = [];

  let pausedForQuota = false;

  for (
    let index = 0;
    index < input.urls.length;
    index += 1
  ) {
    if (pausedForQuota) {
      break;
    }

    const url =
      input.urls[index]!;

    emitProgress(
      input,
      {
        type: "ITEM_START",
        index,
        total: input.urls.length,
        url
      }
    );

    const decisionPath =
      decisionPathFor(
        decisionRoot,
        index
      );

    const recovered =
      await recoverPersistedDecision(
        state.items[index]!,
        decisionPath
      );

    if (recovered) {
      const item =
        state.items[index]!;

      if (!item.captureManifestPath) {
        itemErrors.push({
          index,
          url,
          errorClass:
            "MISSING_CAPTURE_CHECKPOINT",
          message:
            "Persisted decision exists without a durable capture checkpoint."
        });

        continue;
      }

      const validation =
        validateVisualDecision(
          recovered.decision
        );

      validations.set(
        index,
        validation
      );

      state =
        transitionPersistedDecision(
          state,
          index,
          {
            validation,
            decisionPath:
              recovered.path,
            captureManifestPath:
              item.captureManifestPath,
            requestPayloadPath:
              item.requestPayloadPath,
            providerProfileId:
              item.providerProfileId,
            attempts:
              item.attempts,
            now: now()
          }
        );

      await store.save(
        state
      );

      emitProgress(
        input,
        {
          type: "ITEM_DONE",
          index,
          total: input.urls.length,
          url,
          status: validation.status,
          attempts: item.attempts
        }
      );

      continue;
    }

    try {
      emitProgress(
        input,
        {
          type: "CAPTURE_START",
          index,
          total: input.urls.length,
          url
        }
      );

      const request =
        await input.createSemanticRequest({
          index,
          url
        });

      const captureCheckpoint =
        state.items[index]!;

      state =
        transitionRunItem(
          state,
          index,
          captureCheckpoint.status ===
            "PENDING"
            ? "CAPTURED"
            : captureCheckpoint.status,
          {
            captureManifestPath:
              request.captureManifestPath,
            requestPayloadPath:
              request.requestPayloadPath
          },
          now()
        );

      await store.save(
        state
      );

      emitProgress(
        input,
        {
          type: "CAPTURED",
          index,
          total: input.urls.length,
          url
        }
      );

      const executed =
        await executeSemanticRequest(
          request,
          pool,
          input.providers,
          {
            sleep,
            now,
            persistAttempt:
              async checkpoint => {
                const current =
                  state.items[index]!;

                if (
                  current.status !==
                    "CAPTURED" &&
                  current.status !==
                    "AI_IN_FLIGHT"
                ) {
                  throw new Error(
                    "Provider attempt checkpoint requires CAPTURED or AI_IN_FLIGHT state."
                  );
                }

                state =
                  transitionRunItem(
                    state,
                    index,
                    "AI_IN_FLIGHT",
                    {
                      providerProfileId:
                        checkpoint.providerProfileId,
                      attempts:
                        Math.max(
                          current.attempts,
                          checkpoint.attempts
                        ),
                      errorClass:
                        checkpoint.errorClass
                    },
                    now()
                  );

                await store.save(
                  state
                );

                emitProgress(
                  input,
                  {
                    type: "GEMINI_ATTEMPT",
                    index,
                    total: input.urls.length,
                    url,
                    attempt: checkpoint.attempts,
                    providerProfileId:
                      checkpoint.providerProfileId
                  }
                );
              }
          }
        );

      const decision =
        authoritativeDecision(
          executed.decision,
          request.authoritativeUrl
        );

      const validation =
        validateVisualDecision(
          decision
        );

      await writeJsonAtomic(
        decisionPath,
        decision
      );

      validations.set(
        index,
        validation
      );

      state =
        transitionPersistedDecision(
          state,
          index,
          {
            validation,
            decisionPath,
            captureManifestPath:
              request.captureManifestPath,
            requestPayloadPath:
              request.requestPayloadPath,
            providerProfileId:
              executed.providerProfileId,
            attempts:
              executed.attempts,
            now: now()
          }
        );

      await store.save(
        state
      );

      emitProgress(
        input,
        {
          type: "ITEM_DONE",
          index,
          total: input.urls.length,
          url,
          status: validation.status,
          attempts: executed.attempts
        }
      );
    }
    catch (error) {
      const currentErrorClass =
        errorClass(
          error
        );

      const message =
        errorMessage(
          error
        );

      itemErrors.push({
        index,
        url,
        errorClass:
          currentErrorClass,
        message
      });

      emitProgress(
        input,
        {
          type: "ITEM_ERROR",
          index,
          total: input.urls.length,
          url,
          errorClass:
            currentErrorClass,
          message
        }
      );

      if (
        currentErrorClass ===
        "DAILY_QUOTA"
      ) {
        pausedForQuota = true;
      }
    }
  }

  await input.workbookSink.replaceRows(
    rowsInOrder(
      validations
    )
  );

  return {
    runId: input.runId,
    statePath,
    summary:
      summaryFor(
        input.urls,
        validations,
        itemErrors
      ),
    pausedForQuota,
    itemErrors,
    providerState:
      pool.snapshot()
  };
}
