import {
  mkdtemp,
  readFile
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  describe,
  expect,
  it
} from "vitest";

import {
  computeBoundedBackoffMs
} from "../../../src/v03/provider/backoff.js";
import {
  classifyProviderError
} from "../../../src/v03/provider/errorClassifier.js";
import {
  loadProviderProfiles,
  saveProviderProfiles
} from "../../../src/v03/provider/localProfileStore.js";
import {
  ProviderPool
} from "../../../src/v03/provider/providerPool.js";
import {
  toResolvedProviderProfile
} from "../../../src/v03/provider/providerProfile.js";
import {
  AtomicRunStateStore
} from "../../../src/v03/state/atomicRunStateStore.js";
import {
  createRunState,
  transitionRunItem,
  type RunState
} from "../../../src/v03/state/runState.js";
import {
  planResumeForItem
} from "../../../src/v03/state/resumePlanner.js";

const profile = (
  id: string,
  projectId: string,
  authKey = "secret-" + id
) => toResolvedProviderProfile({
  id,
  label: id.toUpperCase(),
  projectId,
  authKey
});

function capturedState(
  runId: string
): RunState {
  const initial = createRunState({
    runId,
    inputHash: "hash",
    urls: ["https://example.test/camera"]
  });

  return transitionRunItem(
    initial,
    0,
    "CAPTURED",
    {
      captureManifestPath: "spool/" + runId + "/0/capture_manifest.json",
      requestPayloadPath: "spool/" + runId + "/0/request.json"
    }
  );
}

function extractedState(
  runId: string
): RunState {
  let state = capturedState(runId);

  state = transitionRunItem(state, 0, "AI_IN_FLIGHT", {
    providerProfileId: "primary",
    attempts: 1
  });

  return transitionRunItem(state, 0, "EXTRACTED", {
    resultJsonPath: "spool/" + runId + "/0/result.json",
    latencyMs: 125
  });
}

describe("provider backoff", () => {
  it("uses bounded exponential backoff with jitter and honors Retry-After", () => {
    expect(computeBoundedBackoffMs({
      attempt: 3,
      baseMs: 1_000,
      maxMs: 30_000,
      jitterRatio: 0.2,
      random: () => 0.5
    })).toBe(4_000);

    expect(computeBoundedBackoffMs({
      attempt: 1,
      retryAfterMs: 5_000,
      random: () => 0.5
    })).toBe(5_000);
  });
});

describe("provider error classification", () => {
  it("distinguishes per-minute rate limit from daily quota", () => {
    expect(classifyProviderError({
      response: {
        status: 429,
        data: { error: { status: "rate_limit_exceeded" } }
      }
    }).errorClass).toBe("RATE_LIMIT");

    expect(classifyProviderError({
      response: {
        status: 429,
        data: { error: { status: "quota_exceeded", message: "daily quota exceeded" } }
      }
    }).errorClass).toBe("DAILY_QUOTA");
  });
});

describe("provider pool", () => {
  it("groups same-project profiles into one quota bucket", () => {
    const a = profile("a", "Project-One");
    const b = profile("b", "project-one");
    const c = profile("c", "project-two");

    expect(a.profile.quotaBucketId).toBe(b.profile.quotaBucketId);
    expect(a.profile.quotaBucketId).not.toBe(c.profile.quotaBucketId);
  });

  it("fails over on invalid credential without exposing secret state", () => {
    const pool = new ProviderPool([
      profile("primary", "project-one"),
      profile("backup", "project-two")
    ]);

    const decision = pool.handleFailure(
      "primary",
      { response: { status: 401, data: { error: { status: "UNAUTHENTICATED" } } } }
    );

    expect(decision.action).toBe("FAILOVER_CREDENTIAL");
    expect(decision.nextProfileId).toBe("backup");
    expect(JSON.stringify(pool.snapshot())).not.toContain("secret-primary");
  });

  it("pauses the project bucket on daily quota and does not account-hop", () => {
    const pool = new ProviderPool([
      profile("a", "project-one"),
      profile("b", "project-one"),
      profile("c", "project-two")
    ]);

    const decision = pool.handleFailure(
      "a",
      {
        response: {
          status: 429,
          data: { error: { status: "quota_exceeded", message: "daily quota exceeded" } }
        }
      }
    );

    expect(decision.action).toBe("PAUSE_AI_QUEUE");
    expect(decision.nextProfileId).toBeNull();

    const snapshots = pool.snapshot();
    expect(snapshots.find(item => item.profileId === "a")?.health).toBe("COOLDOWN");
    expect(snapshots.find(item => item.profileId === "b")?.health).toBe("COOLDOWN");
    expect(snapshots.find(item => item.profileId === "c")?.health).toBe("HEALTHY");
  });
});

describe("local provider store", () => {
  it("persists secrets locally but returns a separated public profile", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "camintel-profile-"));
    const filePath = path.join(dir, "profiles.json");

    await saveProviderProfiles([
      {
        id: "primary",
        label: "PRIMARY",
        projectId: "project-one",
        authKey: "super-secret-key"
      }
    ], filePath);

    const raw = await readFile(filePath, "utf8");
    expect(raw).toContain("super-secret-key");

    const loaded = await loadProviderProfiles(filePath);
    expect(loaded[0]?.profile).toEqual({
      id: "primary",
      label: "PRIMARY",
      projectId: "project-one",
      quotaBucketId: "gemini-project:project-one"
    });
    expect(JSON.stringify(loaded[0]?.profile)).not.toContain("super-secret-key");
  });
});

describe("checkpoint and resume", () => {
  it("CAPTURED resumes AI extraction using existing capture", () => {
    const state = capturedState("run-captured");
    const work = planResumeForItem(state.items[0]!);

    expect(work.action).toBe("AI_EXTRACT");
    expect(work.reuseCapture).toBe(true);
    expect(work.captureManifestPath).toBe(
      "spool/run-captured/0/capture_manifest.json"
    );
    expect(work.requestPayloadPath).toBe(
      "spool/run-captured/0/request.json"
    );
  });

  it("AI_IN_FLIGHT blocks automatic Gemini retry and preserves artifacts", () => {
    let state = capturedState("run-inflight");

    state = transitionRunItem(state, 0, "AI_IN_FLIGHT", {
      providerProfileId: "primary",
      errorClass: "UNKNOWN",
      attempts: 1,
      resultJsonPath: "spool/run-inflight/0/partial-result.json"
    });

    const before = JSON.stringify(state.items[0]);
    const work = planResumeForItem(state.items[0]!);

    expect(work.action).toBe("REVIEW_HOLD");
    expect(work.action).not.toBe("AI_EXTRACT");
    expect(work.reuseCapture).toBe(true);
    expect(work.captureManifestPath).toBe(
      "spool/run-inflight/0/capture_manifest.json"
    );
    expect(work.requestPayloadPath).toBe(
      "spool/run-inflight/0/request.json"
    );
    expect(work.resultJsonPath).toBe(
      "spool/run-inflight/0/partial-result.json"
    );

    expect(state.items[0]?.providerProfileId).toBe("primary");
    expect(state.items[0]?.errorClass).toBe("UNKNOWN");
    expect(JSON.stringify(state.items[0])).toBe(before);
  });

  it("EXTRACTED resumes validation and reuses capture/result", () => {
    const state = extractedState("run-extracted");
    const work = planResumeForItem(state.items[0]!);

    expect(work.action).toBe("VALIDATE");
    expect(work.reuseCapture).toBe(true);
    expect(work.captureManifestPath).toBe(
      "spool/run-extracted/0/capture_manifest.json"
    );
    expect(work.resultJsonPath).toBe(
      "spool/run-extracted/0/result.json"
    );
  });

  it("VALIDATED without workbook commit resumes COMMIT", () => {
    let state = extractedState("run-validated");

    state = transitionRunItem(state, 0, "VALIDATED");

    const work = planResumeForItem(state.items[0]!);
    expect(work.action).toBe("COMMIT");
    expect(work.reuseCapture).toBe(true);
  });

  it("VALIDATED with workbook commit skips duplicate row", () => {
    let state = extractedState("run-validated-committed");

    state = transitionRunItem(state, 0, "VALIDATED", {
      workbookCommitted: true
    });

    const work = planResumeForItem(state.items[0]!);
    expect(work.action).toBe("SKIP_COMMITTED");
    expect(work.action).not.toBe("AI_EXTRACT");
  });

  it("COMMITTED skips AI, recapture and duplicate workbook row", () => {
    let state = extractedState("run-committed");

    state = transitionRunItem(state, 0, "VALIDATED");
    state = transitionRunItem(state, 0, "COMMITTED");

    const work = planResumeForItem(state.items[0]!);
    expect(work.action).toBe("SKIP_COMMITTED");
    expect(work.action).not.toBe("AI_EXTRACT");
    expect(work.reuseCapture).toBe(true);
    expect(state.items[0]?.workbookCommitted).toBe(true);
  });

  it("REVIEW remains on REVIEW_HOLD", () => {
    let state = capturedState("run-review");

    state = transitionRunItem(state, 0, "REVIEW", {
      providerProfileId: "primary",
      errorClass: "UNKNOWN"
    });

    const work = planResumeForItem(state.items[0]!);
    expect(work.action).toBe("REVIEW_HOLD");
    expect(work.action).not.toBe("AI_EXTRACT");
    expect(work.reuseCapture).toBe(true);
  });

  it("writes state atomically and rejects incompatible schema versions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "camintel-state-"));
    const filePath = path.join(dir, "run-state.json");
    const store = new AtomicRunStateStore(filePath);

    const state = createRunState({
      runId: "run-atomic",
      inputHash: "hash",
      urls: ["https://example.test/camera"]
    });

    await store.save(state);
    expect((await store.load()).runId).toBe("run-atomic");

    const raw = JSON.parse(await readFile(filePath, "utf8"));
    raw.schemaVersion = 99;
    await import("node:fs/promises").then(fs =>
      fs.writeFile(filePath, JSON.stringify(raw), "utf8")
    );

    await expect(store.load()).rejects.toThrow(/schemaVersion/i);
  });
});
