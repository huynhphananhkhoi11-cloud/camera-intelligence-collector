import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test, vi } from "vitest";

import {
  runLegacyV15Fallback,
  shouldInvokeLegacyFallback,
  type LegacyFallbackCheckpoint,
  type LegacyFallbackCheckpointSnapshot,
  type LegacyV15Bridge
} from "../../../src/v16/fallback/legacyV15FallbackAdapter.js";
import type {
  GeminiKeyPrompter,
  ValidateGeminiCredential
} from "../../../src/v16/credentials/interactiveGeminiKeyLoop.js";

function checkpoint(
  itemId: string,
  url = "https://shop.test/camera-39",
  ref = "runs/r1/item-39/state.json"
): LegacyFallbackCheckpoint {
  return {
    itemId,
    url,
    trigger: "DIRECT_UNUSABLE",
    legacyCheckpointRef: ref
  };
}

function promptSequence(
  answers: readonly boolean[],
  keys: readonly string[]
): GeminiKeyPrompter & {
  readonly askHasAnotherKey: ReturnType<typeof vi.fn>;
  readonly readApiKey: ReturnType<typeof vi.fn>;
} {
  const answerQueue = [...answers];
  const keyQueue = [...keys];

  return {
    askHasAnotherKey: vi.fn(async () => answerQueue.shift() ?? false),
    readApiKey: vi.fn(async () => keyQueue.shift() ?? "")
  };
}

describe("V16 legacy fallback adapter", () => {
  test("only the two frozen fallback triggers invoke legacy", () => {
    expect(shouldInvokeLegacyFallback("NEEDS_LEGACY_SCOPE_FALLBACK")).toBe(true);
    expect(shouldInvokeLegacyFallback("DIRECT_UNUSABLE")).toBe(true);
    expect(shouldInvokeLegacyFallback("OPTIONAL_FIELD_BLANK")).toBe(false);
    expect(shouldInvokeLegacyFallback("")).toBe(false);
  });

  test("A exhausted -> Y -> B valid resumes the exact same fallback item", async () => {
    const itemId = "product-0039";
    const first = checkpoint(itemId);
    const second = checkpoint(itemId, first.url, "runs/r1/item-39/after-b.json");
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        status: "PROVIDER_ERROR" as const,
        error: Object.assign(new Error("requests per day quota exceeded"), { status: 429 }),
        checkpoint: first
      })
      .mockResolvedValueOnce({
        status: "SUCCESS" as const,
        value: { classification: "CAMERA_PRODUCT" },
        checkpoint: second
      });
    const bridge: LegacyV15Bridge<unknown, { classification: string }> = { execute };
    const prompter = promptSequence([true], ["KEY_B_VALID"]);
    const validateCredential: ValidateGeminiCredential = vi.fn(async (key: string) => ({
      status: key === "KEY_B_VALID" ? "USABLE" as const : "AUTH_INVALID" as const
    }));
    const persisted: LegacyFallbackCheckpointSnapshot[] = [];

    const result = await runLegacyV15Fallback({
      invocation: {
        itemId,
        url: first.url,
        trigger: "DIRECT_UNUSABLE",
        payload: { opaque: true }
      },
      currentApiKey: "KEY_A_EXHAUSTED",
      bridge,
      prompter,
      validateCredential,
      checkpointSink: {
        save: async value => { persisted.push(value); }
      },
      sleep: async () => undefined,
      random: () => 0.5
    });

    expect(result.status).toBe("COMPLETED");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[0]?.[0].itemId).toBe(itemId);
    expect(execute.mock.calls[1]?.[0].itemId).toBe(itemId);
    expect(execute.mock.calls[1]?.[1].checkpoint).toEqual(first);
    expect(execute.mock.calls[1]?.[1].credential.reveal()).toBe("KEY_B_VALID");
    expect(persisted.at(-1)).toMatchObject({
      itemId,
      phase: "WAITING_FOR_KEY",
      reason: "DAILY_QUOTA",
      legacyCheckpointRef: first.legacyCheckpointRef
    });
  });

  test("invalid replacement key asks Y/N again until a usable key is entered", async () => {
    const itemId = "product-0039";
    const first = checkpoint(itemId);
    const bridge: LegacyV15Bridge<unknown, string> = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          status: "PROVIDER_ERROR" as const,
          error: Object.assign(new Error("invalid api key"), { status: 401 }),
          checkpoint: first
        })
        .mockResolvedValueOnce({
          status: "SUCCESS" as const,
          value: "ok",
          checkpoint: first
        })
    };
    const prompter = promptSequence([true, true], ["KEY_B_BAD", "KEY_C_GOOD"]);
    const validateCredential: ValidateGeminiCredential = vi.fn(async (key: string) => ({
      status: key === "KEY_C_GOOD" ? "USABLE" as const : "AUTH_INVALID" as const
    }));

    const result = await runLegacyV15Fallback({
      invocation: {
        itemId,
        url: first.url,
        trigger: "DIRECT_UNUSABLE",
        payload: null
      },
      currentApiKey: "KEY_A_BAD",
      bridge,
      prompter,
      validateCredential,
      checkpointSink: { save: async () => undefined }
    });

    expect(result.status).toBe("COMPLETED");
    expect(prompter.askHasAnotherKey).toHaveBeenCalledTimes(2);
    expect(prompter.readApiKey).toHaveBeenCalledTimes(2);
  });

  test("a newly supplied exhausted key prompts again without a loop limit", async () => {
    const itemId = "product-0039";
    const first = checkpoint(itemId);
    const bridge: LegacyV15Bridge<unknown, string> = {
      execute: vi
        .fn()
        .mockResolvedValueOnce({
          status: "PROVIDER_ERROR" as const,
          error: Object.assign(new Error("daily quota exceeded"), { status: 429 }),
          checkpoint: first
        })
        .mockResolvedValueOnce({
          status: "SUCCESS" as const,
          value: "ok",
          checkpoint: first
        })
    };
    const prompter = promptSequence(
      [true, true, true],
      ["KEY_B_BAD", "KEY_C_EXHAUSTED", "KEY_D_GOOD"]
    );
    const validateCredential: ValidateGeminiCredential = vi.fn(async (key: string) => {
      if (key === "KEY_B_BAD") return { status: "AUTH_INVALID" as const };
      if (key === "KEY_C_EXHAUSTED") return { status: "DAILY_QUOTA" as const };
      return { status: "USABLE" as const };
    });

    const result = await runLegacyV15Fallback({
      invocation: {
        itemId,
        url: first.url,
        trigger: "DIRECT_UNUSABLE",
        payload: null
      },
      currentApiKey: "KEY_A_EXHAUSTED",
      bridge,
      prompter,
      validateCredential,
      checkpointSink: { save: async () => undefined }
    });

    expect(result.status).toBe("COMPLETED");
    expect(prompter.askHasAnotherKey).toHaveBeenCalledTimes(3);
  });

  test("N returns USER_DECLINED_NEW_KEY and preserves the exact checkpoint", async () => {
    const itemId = "scope-root";
    const first: LegacyFallbackCheckpoint = {
      itemId,
      url: "https://shop.test/",
      trigger: "NEEDS_LEGACY_SCOPE_FALLBACK",
      legacyCheckpointRef: "runs/r1/scope/state.json"
    };
    const bridge: LegacyV15Bridge<unknown, string> = {
      execute: vi.fn(async () => ({
        status: "PROVIDER_ERROR" as const,
        error: Object.assign(new Error("invalid api key"), { status: 401 }),
        checkpoint: first
      }))
    };
    const prompter = promptSequence([false], []);

    const result = await runLegacyV15Fallback({
      invocation: {
        itemId,
        url: first.url,
        trigger: first.trigger,
        payload: null
      },
      currentApiKey: "KEY_A_BAD",
      bridge,
      prompter,
      validateCredential: vi.fn(),
      checkpointSink: { save: async () => undefined }
    });

    expect(result).toEqual({
      status: "USER_DECLINED_NEW_KEY",
      itemId,
      url: first.url,
      trigger: first.trigger,
      checkpoint: first
    });
  });

  test("RPM/TPM rate limit backs off and retries the current key before prompting", async () => {
    const itemId = "product-0039";
    const first = checkpoint(itemId);
    const execute = vi
      .fn()
      .mockResolvedValueOnce({
        status: "PROVIDER_ERROR" as const,
        error: {
          status: 429,
          message: "rate limit exceeded",
          response: { headers: { "retry-after": "0.25" } }
        },
        checkpoint: first
      })
      .mockResolvedValueOnce({
        status: "SUCCESS" as const,
        value: "ok",
        checkpoint: first
      });
    const prompter = promptSequence([], []);
    const sleep = vi.fn(async (_ms: number) => undefined);

    const result = await runLegacyV15Fallback({
      invocation: {
        itemId,
        url: first.url,
        trigger: "DIRECT_UNUSABLE",
        payload: null
      },
      currentApiKey: "KEY_A_RATE_LIMITED",
      bridge: { execute },
      prompter,
      validateCredential: vi.fn(),
      checkpointSink: { save: async () => undefined },
      sleep,
      random: () => 0.5
    });

    expect(result.status).toBe("COMPLETED");
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute.mock.calls[1]?.[1].credential.reveal()).toBe("KEY_A_RATE_LIMITED");
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(250);
    expect(prompter.askHasAnotherKey).not.toHaveBeenCalled();
  });

  test("daily quota checkpoints before the Y/N prompt", async () => {
    const itemId = "product-0039";
    const first = checkpoint(itemId);
    const order: string[] = [];
    const bridge: LegacyV15Bridge<unknown, string> = {
      execute: vi.fn(async () => {
        order.push("execute");
        return {
          status: "PROVIDER_ERROR" as const,
          error: Object.assign(new Error("requests per day quota exceeded"), { status: 429 }),
          checkpoint: first
        };
      })
    };
    const prompter: GeminiKeyPrompter = {
      askHasAnotherKey: async () => {
        order.push("prompt");
        return false;
      },
      readApiKey: async () => ""
    };

    await runLegacyV15Fallback({
      invocation: {
        itemId,
        url: first.url,
        trigger: "DIRECT_UNUSABLE",
        payload: null
      },
      currentApiKey: "KEY_A_EXHAUSTED",
      bridge,
      prompter,
      validateCredential: vi.fn(),
      checkpointSink: {
        save: async () => { order.push("checkpoint"); }
      }
    });

    expect(order).toEqual(["execute", "checkpoint", "prompt"]);
  });

  test("known dummy secrets never appear in persisted adapter artifacts, logs, or control JSON", async () => {
    const root = await mkdtemp(join(tmpdir(), "v16-dev5-secret-"));
    const secret = "DUMMY_GEMINI_SECRET_ABC123";
    const itemId = "product-0039";
    const first = checkpoint(itemId);
    const logLines: string[] = [];
    const artifactPaths = [
      join(root, "request.json"),
      join(root, "decision.json"),
      join(root, "result.json")
    ];

    const bridge: LegacyV15Bridge<{ artifactPaths: readonly string[] }, string> = {
      execute: vi.fn(async (invocation: { itemId: string; payload: { artifactPaths: readonly string[] } }, context: { credential: { reveal(): string } }) => {
        expect(JSON.stringify(context)).not.toContain(secret);
        expect(context.credential.reveal()).toBe(secret);
        for (const path of invocation.payload.artifactPaths) {
          await writeFile(path, JSON.stringify({ itemId: invocation.itemId }) + "\n", "utf8");
        }
        return {
          status: "PROVIDER_ERROR" as const,
          error: Object.assign(new Error("invalid api key"), { status: 401 }),
          checkpoint: first
        };
      })
    };
    const checkpointPath = join(root, "checkpoint.json");

    const result = await runLegacyV15Fallback({
      invocation: {
        itemId,
        url: first.url,
        trigger: "DIRECT_UNUSABLE",
        payload: { artifactPaths }
      },
      currentApiKey: secret,
      bridge,
      prompter: promptSequence([false], []),
      validateCredential: vi.fn(),
      checkpointSink: {
        save: async value => {
          await writeFile(checkpointPath, JSON.stringify(value, null, 2) + "\n", "utf8");
        }
      },
      log: line => { logLines.push(line); }
    });

    const files = await readdir(root);
    const persisted = await Promise.all(
      files.map(async (name: string) => readFile(join(root, name), "utf8"))
    );
    const searchable = [
      ...persisted,
      ...logLines,
      JSON.stringify(result)
    ].join("\n");

    expect(searchable).not.toContain(secret);
  });
  test("refuses a legacy checkpoint/result that contains a known Gemini credential", async () => {
    const secret = "DUMMY_GEMINI_SECRET_IN_CHECKPOINT";
    const itemId = "product-0039";
    const contaminated = checkpoint(
      itemId,
      "https://shop.test/camera-39",
      "runs/" + secret + "/state.json"
    );

    await expect(
      runLegacyV15Fallback({
        invocation: {
          itemId,
          url: contaminated.url,
          trigger: "DIRECT_UNUSABLE",
          payload: null
        },
        currentApiKey: secret,
        bridge: {
          execute: async () => ({
            status: "SUCCESS" as const,
            value: { ok: true },
            checkpoint: contaminated
          })
        },
        prompter: promptSequence([], []),
        validateCredential: vi.fn(),
        checkpointSink: { save: async () => undefined }
      })
    ).rejects.toThrow(/Gemini credential/);
  });

});
