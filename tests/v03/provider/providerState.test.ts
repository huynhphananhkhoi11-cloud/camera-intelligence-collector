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
  transitionRunItem
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
  it("resumes CAPTURED using existing images without recapture", () => {
    const initial = createRunState({
      runId: "run-1",
      inputHash: "hash",
      urls: ["https://example.test/camera"]
    });

    const captured = transitionRunItem(
      initial,
      0,
      "CAPTURED",
      {
        captureManifestPath: "spool/run-1/0/capture_manifest.json",
        requestPayloadPath: "spool/run-1/0/request.json"
      }
    );

    const work = planResumeForItem(captured.items[0]!);
    expect(work.action).toBe("AI_EXTRACT");
    expect(work.reuseCapture).toBe(true);
  });

  it("resumes VALIDATED at commit and never requests another AI call", () => {
    let state = createRunState({
      runId: "run-2",
      inputHash: "hash",
      urls: ["https://example.test/camera"]
    });

    state = transitionRunItem(state, 0, "CAPTURED", {
      captureManifestPath: "capture.json"
    });
    state = transitionRunItem(state, 0, "AI_IN_FLIGHT", {
      providerProfileId: "primary",
      attempts: 1
    });
    state = transitionRunItem(state, 0, "EXTRACTED", {
      resultJsonPath: "result.json"
    });
    state = transitionRunItem(state, 0, "VALIDATED");

    expect(planResumeForItem(state.items[0]!).action).toBe("COMMIT");
  });

  it("writes state atomically and rejects incompatible schema versions", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "camintel-state-"));
    const filePath = path.join(dir, "run-state.json");
    const store = new AtomicRunStateStore(filePath);

    const state = createRunState({
      runId: "run-3",
      inputHash: "hash",
      urls: ["https://example.test/camera"]
    });

    await store.save(state);
    expect((await store.load()).runId).toBe("run-3");

    const raw = JSON.parse(await readFile(filePath, "utf8"));
    raw.schemaVersion = 99;
    await import("node:fs/promises").then(fs =>
      fs.writeFile(filePath, JSON.stringify(raw), "utf8")
    );

    await expect(store.load()).rejects.toThrow(/schemaVersion/i);
  });
});
