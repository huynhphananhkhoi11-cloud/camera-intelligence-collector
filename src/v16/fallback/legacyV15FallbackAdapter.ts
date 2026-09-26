import {
  computeBoundedBackoffMs
} from "../../v03/provider/backoff.js";
import {
  classifyProviderError,
  type ProviderErrorClass
} from "../../v03/provider/errorClassifier.js";

import {
  acquireNextUsableGeminiKey,
  createInMemoryGeminiCredential,
  type GeminiKeyPrompter,
  type InMemoryGeminiCredential,
  type ValidateGeminiCredential
} from "../credentials/interactiveGeminiKeyLoop.js";

export type LegacyFallbackTrigger =
  | "NEEDS_LEGACY_SCOPE_FALLBACK"
  | "DIRECT_UNUSABLE";

export function shouldInvokeLegacyFallback(
  reason: string
): reason is LegacyFallbackTrigger {
  return (
    reason === "NEEDS_LEGACY_SCOPE_FALLBACK" ||
    reason === "DIRECT_UNUSABLE"
  );
}

export interface LegacyFallbackInvocation<TPayload = unknown> {
  readonly itemId: string;
  readonly url: string;
  readonly trigger: LegacyFallbackTrigger;
  readonly payload: TPayload;
}

export interface LegacyFallbackCheckpoint {
  readonly itemId: string;
  readonly url: string;
  readonly trigger: LegacyFallbackTrigger;
  readonly legacyCheckpointRef: string | null;
}

export type LegacyV15Attempt<TValue> =
  | {
      readonly status: "SUCCESS";
      readonly value: TValue;
      readonly checkpoint: LegacyFallbackCheckpoint;
    }
  | {
      readonly status: "PROVIDER_ERROR";
      readonly error: unknown;
      readonly checkpoint: LegacyFallbackCheckpoint;
    };

export interface LegacyV15ExecutionContext {
  readonly credential: InMemoryGeminiCredential;
  readonly checkpoint: LegacyFallbackCheckpoint | null;
}

export interface LegacyV15Bridge<TPayload = unknown, TValue = unknown> {
  execute(
    invocation: LegacyFallbackInvocation<TPayload>,
    context: LegacyV15ExecutionContext
  ): Promise<LegacyV15Attempt<TValue>>;
}

export type FallbackPromptReason =
  | "NO_CREDENTIAL"
  | "AUTH_INVALID"
  | "DAILY_QUOTA"
  | "RATE_LIMIT_UNAVAILABLE";

export interface LegacyFallbackCheckpointSnapshot {
  readonly schemaVersion: 1;
  readonly itemId: string;
  readonly url: string;
  readonly trigger: LegacyFallbackTrigger;
  readonly phase: "WAITING_FOR_KEY";
  readonly reason: FallbackPromptReason;
  readonly legacyCheckpointRef: string | null;
}

export interface LegacyFallbackCheckpointSink {
  save(snapshot: LegacyFallbackCheckpointSnapshot): Promise<void>;
}

export type LegacyFallbackControlResult<TValue> =
  | {
      readonly status: "COMPLETED";
      readonly itemId: string;
      readonly url: string;
      readonly trigger: LegacyFallbackTrigger;
      readonly value: TValue;
      readonly checkpoint: LegacyFallbackCheckpoint;
    }
  | {
      readonly status: "USER_DECLINED_NEW_KEY";
      readonly itemId: string;
      readonly url: string;
      readonly trigger: LegacyFallbackTrigger;
      readonly checkpoint: LegacyFallbackCheckpoint;
    }
  | {
      readonly status: "REVIEW";
      readonly itemId: string;
      readonly url: string;
      readonly trigger: LegacyFallbackTrigger;
      readonly errorClass: ProviderErrorClass;
      readonly checkpoint: LegacyFallbackCheckpoint;
    };

export interface RunLegacyV15FallbackInput<TPayload, TValue> {
  readonly invocation: LegacyFallbackInvocation<TPayload>;
  readonly currentApiKey?: string | null;
  readonly bridge: LegacyV15Bridge<TPayload, TValue>;
  readonly prompter: GeminiKeyPrompter;
  readonly validateCredential: ValidateGeminiCredential;
  readonly checkpointSink: LegacyFallbackCheckpointSink;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
  readonly log?: (line: string) => void;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolvePromise => {
    setTimeout(resolvePromise, ms);
  });
}

function initialCheckpoint<TPayload>(
  invocation: LegacyFallbackInvocation<TPayload>
): LegacyFallbackCheckpoint {
  return {
    itemId: invocation.itemId,
    url: invocation.url,
    trigger: invocation.trigger,
    legacyCheckpointRef: null
  };
}

function assertCheckpointIdentity<TPayload>(
  invocation: LegacyFallbackInvocation<TPayload>,
  checkpoint: LegacyFallbackCheckpoint
): void {
  if (
    checkpoint.itemId !== invocation.itemId ||
    checkpoint.url !== invocation.url ||
    checkpoint.trigger !== invocation.trigger
  ) {
    throw new Error(
      "Legacy fallback checkpoint identity does not match the exact V16 item."
    );
  }
}

function checkpointSnapshot(
  checkpoint: LegacyFallbackCheckpoint,
  reason: FallbackPromptReason
): LegacyFallbackCheckpointSnapshot {
  return {
    schemaVersion: 1,
    itemId: checkpoint.itemId,
    url: checkpoint.url,
    trigger: checkpoint.trigger,
    phase: "WAITING_FOR_KEY",
    reason,
    legacyCheckpointRef: checkpoint.legacyCheckpointRef
  };
}

function assertKnownSecretsAbsent(
  value: unknown,
  knownSecrets: readonly string[]
): void {
  const serialized = JSON.stringify(value);

  for (const secret of knownSecrets) {
    if (secret && serialized.includes(secret)) {
      throw new Error(
        "Refusing to persist fallback checkpoint containing a Gemini credential."
      );
    }
  }
}

async function saveBeforePrompt(
  checkpoint: LegacyFallbackCheckpoint,
  reason: FallbackPromptReason,
  sink: LegacyFallbackCheckpointSink,
  knownSecrets: readonly string[]
): Promise<void> {
  const snapshot = checkpointSnapshot(checkpoint, reason);
  assertKnownSecretsAbsent(snapshot, knownSecrets);
  await sink.save(snapshot);
}

function reviewResult<TPayload, TValue>(
  invocation: LegacyFallbackInvocation<TPayload>,
  checkpoint: LegacyFallbackCheckpoint,
  errorClass: ProviderErrorClass
): LegacyFallbackControlResult<TValue> {
  return {
    status: "REVIEW",
    itemId: invocation.itemId,
    url: invocation.url,
    trigger: invocation.trigger,
    errorClass,
    checkpoint
  };
}

export async function runLegacyV15Fallback<TPayload, TValue>(
  input: RunLegacyV15FallbackInput<TPayload, TValue>
): Promise<LegacyFallbackControlResult<TValue>> {
  const sleep = input.sleep ?? defaultSleep;
  const random = input.random ?? Math.random;
  const log = input.log ?? (() => undefined);
  const knownSecrets: string[] = [];

  let apiKey = input.currentApiKey?.trim() ?? "";
  if (apiKey) {
    knownSecrets.push(apiKey);
  }

  let checkpoint: LegacyFallbackCheckpoint =
    initialCheckpoint(input.invocation);
  let rateLimitRetryUsed = false;
  let transientRetryUsed = false;

  const acquireReplacementKey = async (
    reason: FallbackPromptReason
  ): Promise<string | null> => {
    await saveBeforePrompt(
      checkpoint,
      reason,
      input.checkpointSink,
      knownSecrets
    );

    log(
      `[QUOTA] item=${input.invocation.itemId} reason=${reason} action=ASK_NEW_KEY`
    );

    const acquired = await acquireNextUsableGeminiKey({
      prompter: input.prompter,
      validateCredential: input.validateCredential,
      sleep,
      random
    });

    if (acquired.status === "USER_DECLINED_NEW_KEY") {
      return null;
    }

    const replacement = acquired.credential.reveal();
    knownSecrets.push(replacement);
    return replacement;
  };

  if (!apiKey) {
    const replacement = await acquireReplacementKey("NO_CREDENTIAL");

    if (replacement === null) {
      return {
        status: "USER_DECLINED_NEW_KEY",
        itemId: input.invocation.itemId,
        url: input.invocation.url,
        trigger: input.invocation.trigger,
        checkpoint
      };
    }

    apiKey = replacement;
  }

  while (true) {
    const attempt = await input.bridge.execute(
      input.invocation,
      {
        credential: createInMemoryGeminiCredential(apiKey),
        checkpoint
      }
    );

    assertCheckpointIdentity(input.invocation, attempt.checkpoint);
    assertKnownSecretsAbsent(attempt.checkpoint, knownSecrets);
    checkpoint = attempt.checkpoint;

    if (attempt.status === "SUCCESS") {
      assertKnownSecretsAbsent(attempt.value, knownSecrets);

      return {
        status: "COMPLETED",
        itemId: input.invocation.itemId,
        url: input.invocation.url,
        trigger: input.invocation.trigger,
        value: attempt.value,
        checkpoint
      };
    }

    const classification = classifyProviderError(attempt.error);

    switch (classification.errorClass) {
      case "AUTH_INVALID": {
        const replacement = await acquireReplacementKey("AUTH_INVALID");

        if (replacement === null) {
          return {
            status: "USER_DECLINED_NEW_KEY",
            itemId: input.invocation.itemId,
            url: input.invocation.url,
            trigger: input.invocation.trigger,
            checkpoint
          };
        }

        apiKey = replacement;
        rateLimitRetryUsed = false;
        transientRetryUsed = false;
        continue;
      }

      case "DAILY_QUOTA": {
        const replacement = await acquireReplacementKey("DAILY_QUOTA");

        if (replacement === null) {
          return {
            status: "USER_DECLINED_NEW_KEY",
            itemId: input.invocation.itemId,
            url: input.invocation.url,
            trigger: input.invocation.trigger,
            checkpoint
          };
        }

        apiKey = replacement;
        rateLimitRetryUsed = false;
        transientRetryUsed = false;
        continue;
      }

      case "RATE_LIMIT": {
        if (!rateLimitRetryUsed) {
          const delayMs = computeBoundedBackoffMs({
            attempt: 1,
            retryAfterMs: classification.retryAfterMs,
            random
          });

          rateLimitRetryUsed = true;
          log(
            `[QUOTA] item=${input.invocation.itemId} reason=RATE_LIMIT action=BACKOFF_RETRY`
          );
          await sleep(delayMs);
          continue;
        }

        const replacement = await acquireReplacementKey(
          "RATE_LIMIT_UNAVAILABLE"
        );

        if (replacement === null) {
          return {
            status: "USER_DECLINED_NEW_KEY",
            itemId: input.invocation.itemId,
            url: input.invocation.url,
            trigger: input.invocation.trigger,
            checkpoint
          };
        }

        apiKey = replacement;
        rateLimitRetryUsed = false;
        transientRetryUsed = false;
        continue;
      }

      case "TRANSIENT_PROVIDER": {
        if (!transientRetryUsed) {
          const delayMs = computeBoundedBackoffMs({
            attempt: 1,
            retryAfterMs: classification.retryAfterMs,
            random
          });

          transientRetryUsed = true;
          await sleep(delayMs);
          continue;
        }

        return reviewResult(
          input.invocation,
          checkpoint,
          classification.errorClass
        );
      }

      case "SCHEMA_FORMAT":
      case "UNKNOWN":
      default:
        return reviewResult(
          input.invocation,
          checkpoint,
          classification.errorClass
        );
    }
  }
}
