import { createInterface } from "node:readline/promises";

import {
  computeBoundedBackoffMs
} from "../../v03/provider/backoff.js";

export const GEMINI_KEY_CONTINUATION_PROMPT =
  "Do you have another Gemini API key? (Y/N)" as const;

export interface GeminiKeyPrompter {
  askHasAnotherKey(): Promise<boolean>;
  readApiKey(): Promise<string>;
}

export type GeminiCredentialValidation =
  | { readonly status: "USABLE" }
  | { readonly status: "AUTH_INVALID" }
  | { readonly status: "DAILY_QUOTA" }
  | {
      readonly status: "RATE_LIMIT";
      readonly retryAfterMs?: number | null;
    };

export type ValidateGeminiCredential = (
  apiKey: string
) => Promise<GeminiCredentialValidation>;

export interface InMemoryGeminiCredential {
  readonly reveal: () => string;
}

export function createInMemoryGeminiCredential(
  apiKey: string
): InMemoryGeminiCredential {
  const secret = apiKey;
  return Object.freeze({
    reveal: () => secret
  });
}

export type AcquireGeminiKeyResult =
  | {
      readonly status: "KEY_READY";
      readonly credential: InMemoryGeminiCredential;
    }
  | {
      readonly status: "USER_DECLINED_NEW_KEY";
    };

export interface AcquireGeminiKeyInput {
  readonly prompter: GeminiKeyPrompter;
  readonly validateCredential: ValidateGeminiCredential;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise(resolvePromise => {
    setTimeout(resolvePromise, ms);
  });
}

export async function acquireNextUsableGeminiKey(
  input: AcquireGeminiKeyInput
): Promise<AcquireGeminiKeyResult> {
  const sleep = input.sleep ?? defaultSleep;
  const random = input.random ?? Math.random;

  while (true) {
    if (!(await input.prompter.askHasAnotherKey())) {
      return { status: "USER_DECLINED_NEW_KEY" };
    }

    const apiKey = (await input.prompter.readApiKey()).trim();

    if (!apiKey) {
      continue;
    }

    let validation = await input.validateCredential(apiKey);

    if (validation.status === "RATE_LIMIT") {
      const delayMs = computeBoundedBackoffMs({
        attempt: 1,
        retryAfterMs: validation.retryAfterMs ?? null,
        random
      });

      await sleep(delayMs);
      validation = await input.validateCredential(apiKey);
    }

    if (validation.status === "USABLE") {
      return {
        status: "KEY_READY",
        credential: createInMemoryGeminiCredential(apiKey)
      };
    }
  }
}

export interface InteractiveGeminiPrompterOptions {
  readonly input?: NodeJS.ReadStream;
  readonly output?: NodeJS.WriteStream;
}

async function readSecretLine(
  input: NodeJS.ReadStream,
  output: NodeJS.WriteStream
): Promise<string> {
  if (
    !input.isTTY ||
    typeof input.setRawMode !== "function"
  ) {
    throw new Error(
      "Secure Gemini API-key input requires an interactive TTY."
    );
  }

  const setRawMode = input.setRawMode.bind(input);

  output.write("Gemini API key: ");
  setRawMode(true);
  input.resume();

  return new Promise<string>((resolvePromise, rejectPromise) => {
    let secret = "";

    const cleanup = (): void => {
      input.off("data", onData);
      setRawMode(false);
    };

    const onData = (chunk: Buffer | string): void => {
      const text = typeof chunk === "string"
        ? chunk
        : chunk.toString("utf8");

      for (const character of text) {
        if (character === "\u0003") {
          cleanup();
          output.write("\n");
          rejectPromise(new Error("Gemini API-key input cancelled."));
          return;
        }

        if (character === "\r" || character === "\n") {
          cleanup();
          output.write("\n");
          resolvePromise(secret.trim());
          return;
        }

        if (character === "\u007f" || character === "\b") {
          secret = secret.slice(0, -1);
          continue;
        }

        secret += character;
      }
    };

    input.on("data", onData);
  });
}

export function createInteractiveGeminiKeyPrompter(
  options: InteractiveGeminiPrompterOptions = {}
): GeminiKeyPrompter {
  const input = options.input ?? process.stdin;
  const output = options.output ?? process.stdout;

  return {
    async askHasAnotherKey(): Promise<boolean> {
      while (true) {
        const rl = createInterface({ input, output });
        const answer = (
          await rl.question(GEMINI_KEY_CONTINUATION_PROMPT + " ")
        )
          .trim()
          .toUpperCase();
        rl.close();

        if (answer === "Y" || answer === "YES") {
          return true;
        }

        if (answer === "N" || answer === "NO") {
          return false;
        }

        output.write("Please answer Y or N.\n");
      }
    },

    async readApiKey(): Promise<string> {
      return readSecretLine(input, output);
    }
  };
}
