import { describe, expect, test, vi } from "vitest";

import {
  GEMINI_KEY_CONTINUATION_PROMPT,
  acquireNextUsableGeminiKey,
  type GeminiKeyPrompter
} from "../../../src/v16/credentials/interactiveGeminiKeyLoop.js";

describe("V16 interactive Gemini key loop", () => {
  test("uses the frozen Y/N prompt text", () => {
    expect(GEMINI_KEY_CONTINUATION_PROMPT).toBe(
      "Do you have another Gemini API key? (Y/N)"
    );
  });

  test("keeps asking after invalid or exhausted keys until usable", async () => {
    const answers = [true, true, true];
    const keys = ["KEY_B_BAD", "KEY_C_EXHAUSTED", "KEY_D_GOOD"];
    const prompter: GeminiKeyPrompter = {
      askHasAnotherKey: vi.fn(async () => answers.shift() ?? false),
      readApiKey: vi.fn(async () => keys.shift() ?? "")
    };

    const result = await acquireNextUsableGeminiKey({
      prompter,
      validateCredential: vi.fn(async (key: string) => {
        if (key === "KEY_B_BAD") return { status: "AUTH_INVALID" as const };
        if (key === "KEY_C_EXHAUSTED") return { status: "DAILY_QUOTA" as const };
        return { status: "USABLE" as const };
      })
    });

    expect(result.status).toBe("KEY_READY");
    if (result.status === "KEY_READY") {
      expect(result.credential.reveal()).toBe("KEY_D_GOOD");
      expect(JSON.stringify(result.credential)).not.toContain("KEY_D_GOOD");
    }
    expect(prompter.askHasAnotherKey).toHaveBeenCalledTimes(3);
  });

  test("N returns USER_DECLINED_NEW_KEY without requesting secret input", async () => {
    const prompter: GeminiKeyPrompter = {
      askHasAnotherKey: vi.fn(async () => false),
      readApiKey: vi.fn(async () => "SHOULD_NOT_BE_READ")
    };

    const result = await acquireNextUsableGeminiKey({
      prompter,
      validateCredential: vi.fn()
    });

    expect(result).toEqual({ status: "USER_DECLINED_NEW_KEY" });
    expect(prompter.readApiKey).not.toHaveBeenCalled();
  });
});
