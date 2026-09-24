import { describe, expect, test, vi } from "vitest";

import {
  LiveBatchProgress
} from "../../../src/v04/cli/liveBatchProgress.js";

describe("V04 live batch progress UI", () => {
  test("shows immediate stage changes and heartbeat for long-running work", () => {
    let nowMs = 1_000;
    const lines: string[] = [];

    const ui = new LiveBatchProgress({
      total: 4,
      write: line => lines.push(line),
      now: () => nowMs
    });

    ui.onEvent({
      type: "ITEM_START",
      index: 0,
      total: 4,
      url: "https://shop.example/camera/a"
    });

    ui.onEvent({
      type: "CAPTURE_START",
      index: 0,
      total: 4,
      url: "https://shop.example/camera/a"
    });

    nowMs = 21_000;
    ui.heartbeat();

    ui.onEvent({
      type: "GEMINI_ATTEMPT",
      index: 0,
      total: 4,
      url: "https://shop.example/camera/a",
      attempt: 1,
      providerProfileId: "gemini-primary"
    });

    nowMs = 53_000;
    ui.heartbeat();

    ui.onEvent({
      type: "ITEM_DONE",
      index: 0,
      total: 4,
      url: "https://shop.example/camera/a",
      status: "VALIDATED",
      attempts: 1
    });

    expect(lines).toEqual([
      "[1/4] START   https://shop.example/camera/a",
      "[1/4] CAPTURE browser exploring...",
      "[1/4] ... still CAPTURE after 20s",
      "[1/4] GEMINI  attempt 1 via gemini-primary",
      "[1/4] ... still GEMINI after 52s",
      "[1/4] DONE    VALIDATED attempts=1 elapsed=52s"
    ]);
  });

  test("does not emit heartbeat before an item starts", () => {
    const write = vi.fn();
    const ui = new LiveBatchProgress({
      total: 4,
      write,
      now: () => 1_000
    });

    ui.heartbeat();

    expect(write).not.toHaveBeenCalled();
  });
});
