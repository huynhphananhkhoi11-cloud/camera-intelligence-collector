// V15 numbered-packet acceptance markers:
// ERROR evidence is retained.
// semantic decision persist happens before cleanup.
// structural validation persist happens before cleanup.
// durable result persist happens before cleanup.
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  afterEach,
  describe,
  expect,
  test,
  vi
} from "vitest";

import type {
  Camera13Row,
  MinimalVisualDecision
} from "../../../src/v04/contracts/minimalVisualDecision.js";
import type {
  FrozenProductVisualPacket
} from "../../../src/v04/contracts/v15PipelineContracts.js";
import {
  createPipelinedProductItemId,
  runPipelinedProductRuntime,
  type CaptureProductInput
} from "../../../src/v04/runtime/pipelinedProductRuntime.js";
import {
  toResolvedProviderProfile,
  type ResolvedProviderProfile
} from "../../../src/v03/provider/providerProfile.js";
import { AtomicRunStateStore } from "../../../src/v03/state/atomicRunStateStore.js";
import {
  createRunState,
  transitionRunItem
} from "../../../src/v03/state/runState.js";


const tempRoots: string[] = [];


afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map(root =>
      rm(root, { recursive: true, force: true })
    )
  );
});


function deferred<T = void>() {
  let resolvePromise!: (value: T | PromiseLike<T>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  return {
    promise,
    resolve: resolvePromise,
    reject: rejectPromise
  };
}


async function tempRun(name: string) {
  const root = await mkdtemp(join(tmpdir(), "v15-dev5-" + name + "-"));
  tempRoots.push(root);

  return {
    root,
    statePath: join(root, "run-state.json")
  };
}


async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  }
  catch {
    return false;
  }
}


async function readJsonFile(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}


function provider(
  id: string,
  projectId = id
): ResolvedProviderProfile {
  return toResolvedProviderProfile({
    id,
    label: id.toUpperCase(),
    projectId,
    authKey: "fake-" + id
  });
}


function cameraRow(url: string, name: string): Camera13Row {
  return {
    website: "model.invalid",
    productName: name,
    condition: "NEW",
    specs: ["45 MP"],
    rentalPricePerDay: null,
    rentalTerms: null,
    accessoriesIncluded: null,
    bundleIncluded: null,
    rating: 4.8,
    reviewCount: 20,
    stock: "Visible stock wording",
    salePrice: {
      value: 1000,
      currency: "USD"
    },
    url
  };
}


function cameraDecision(
  url: string,
  name: string
): MinimalVisualDecision {
  return {
    classification: "CAMERA_PRODUCT",
    row: cameraRow(url, name)
  };
}


async function persistPacket(
  root: string,
  input: {
    readonly pageUrl: string;
    readonly sequence: number;
    readonly itemId: string;
  }
): Promise<FrozenProductVisualPacket> {
  const dir = join(root, "capture-" + String(input.sequence + 1));
  await mkdir(dir, { recursive: true });

  const imagePath = join(dir, "01-hero-final.png");
  const bytes = Buffer.from("image-" + input.sequence);
  await writeFile(imagePath, bytes);

  const finalUrl = input.pageUrl + "?final=1";
  const imageHash = "hash-" + input.sequence;
  const manifest = {
    schemaVersion: 1 as const,
    url: input.pageUrl,
    finalUrl,
    captureTimestamp: "2026-09-22T00:00:00.000Z",
    shots: [
      {
        sequence: 1,
        shotId: "01-hero-final",
        role: "hero" as const,
        pageZone: "HERO" as const,
        imageHash,
        contentHash: imageHash,
        scrollY: 0,
        documentHeight: 2400,
        dimensions: {
          width: 1200,
          height: 900
        },
        width: 1200,
        height: 900,
        path: "01-hero-final.png",
        isAuthoritativeHero: true
      }
    ]
  };
  const manifestPath = join(dir, "capture_manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify(manifest, null, 2) + "\n",
    "utf8"
  );

  return {
    itemId: input.itemId,
    sequence: input.sequence,
    website: "shop.test",
    pageUrl: input.pageUrl,
    finalUrl,
    screenshots: [
      {
        sequence: 1,
        shotId: "01-hero-final",
        role: "hero",
        bytes,
        fingerprint: {
          imageHash,
          scrollY: 0,
          documentHeight: 2400
        },
        pageZone: "HERO",
        scrollY: 0,
        documentHeight: 2400,
        dimensions: {
          width: 1200,
          height: 900
        },
        width: 1200,
        height: 900,
        contentHash: imageHash,
        path: "01-hero-final.png",
        isAuthoritativeHero: true
      }
    ],
    manifest,
    manifestPath,
    imagePaths: [imagePath]
  };
}


describe("V15 pipelined product runtime", () => {
  test("starts capture P2 while semantic P1 is still unresolved", async () => {
    const run = await tempRun("overlap");
    const urls = [
      "https://shop.test/p1",
      "https://shop.test/p2"
    ];
    const semanticP1Started = deferred();
    const releaseSemanticP1 = deferred();
    const captureP2Started = deferred();
    const events: string[] = [];

    const captureProduct = vi.fn(async (input: CaptureProductInput) => {
      // Do not make this concurrency assertion depend on microtask/disk timing.
      // P2 is deliberately held at its capture boundary until semantic P1
      // has started; a truly serial runtime would deadlock here.
      if (input.sequence === 1) {
        await semanticP1Started.promise;
      }

      events.push("capture-start-" + input.sequence);
      if (input.sequence === 1) {
        captureP2Started.resolve();
      }
      const packet = await persistPacket(run.root, input);
      events.push("capture-end-" + input.sequence);
      return packet;
    });

    const semanticProduct = vi.fn(async (packet: FrozenProductVisualPacket) => {
      events.push("semantic-start-" + packet.sequence);
      if (packet.sequence === 0) {
        semanticP1Started.resolve();
        await releaseSemanticP1.promise;
      }
      events.push("semantic-end-" + packet.sequence);
      return cameraDecision(packet.finalUrl, "Camera " + packet.sequence);
    });

    const running = runPipelinedProductRuntime({
      runId: "overlap",
      urls,
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct,
      semanticProduct,
      options: {
        captureConcurrency: 1,
        semanticConcurrency: 1,
        queueCapacity: 2
      }
    });

    await semanticP1Started.promise;
    await captureP2Started.promise;

    expect(events.indexOf("capture-start-1")).toBeGreaterThan(
      events.indexOf("semantic-start-0")
    );
    expect(events).not.toContain("semantic-end-0");

    releaseSemanticP1.resolve();
    const result = await running;

    expect(captureProduct).toHaveBeenCalledTimes(2);
    expect(semanticProduct).toHaveBeenCalledTimes(2);
    expect(result.validations.map(item => item.sequence)).toEqual([0, 1]);
  });


  test("does not let capture advance beyond bounded queue capacity 2", async () => {
    const run = await tempRun("bounded");
    const urls = [0, 1, 2, 3].map(index => "https://shop.test/p" + index);
    const semanticP1Started = deferred();
    const captureP3Started = deferred();
    const releaseSemanticP1 = deferred();
    const captureStarts: number[] = [];

    const captureProduct = vi.fn(async (input: CaptureProductInput) => {
      captureStarts.push(input.sequence);
      if (input.sequence === 2) {
        captureP3Started.resolve();
      }
      return persistPacket(run.root, input);
    });

    const semanticProduct = vi.fn(async (packet: FrozenProductVisualPacket) => {
      if (packet.sequence === 0) {
        semanticP1Started.resolve();
        await releaseSemanticP1.promise;
      }
      return cameraDecision(packet.finalUrl, "Camera " + packet.sequence);
    });

    const running = runPipelinedProductRuntime({
      runId: "bounded",
      urls,
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct,
      semanticProduct,
      options: { queueCapacity: 2 }
    });

    await semanticP1Started.promise;
    await captureP3Started.promise;
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(captureStarts).toEqual([0, 1, 2]);
    expect(captureStarts).not.toContain(3);

    releaseSemanticP1.resolve();
    const result = await running;

    expect(result.validations.map(item => item.sequence)).toEqual([0, 1, 2, 3]);
  });


  test("keeps persisted results in input order when one semantic item errors", async () => {
    const run = await tempRun("ordering-error");
    const urls = [
      "https://shop.test/p1",
      "https://shop.test/p2",
      "https://shop.test/p3"
    ];

    const result = await runPipelinedProductRuntime({
      runId: "ordering-error",
      urls,
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct: input => persistPacket(run.root, input),
      semanticProduct: async packet => {
        if (packet.sequence === 1) {
          throw Object.assign(
            new Error("structured output schema failure"),
            { status: 400 }
          );
        }
        return cameraDecision(packet.finalUrl, "Camera " + packet.sequence);
      }
    });

    expect(result.validations.map(item => item.sequence)).toEqual([0, 2]);
    expect(result.itemErrors).toMatchObject([
      {
        sequence: 1,
        phase: "SEMANTIC",
        errorClass: "SCHEMA_FORMAT"
      }
    ]);
    expect(result.summary).toMatchObject({
      validated: 2,
      errors: 1,
      deferred: 0
    });
  });


  test("resume skips capture and semantic work for persisted completions", async () => {
    const run = await tempRun("resume-complete");
    const urls = [
      "https://shop.test/p1",
      "https://shop.test/p2"
    ];
    const captureProduct = vi.fn((input: CaptureProductInput) => persistPacket(run.root, input));
    const semanticProduct = vi.fn(async (packet: FrozenProductVisualPacket) =>
      cameraDecision(packet.finalUrl, "Camera " + packet.sequence)
    );

    const common = {
      runId: "resume-complete",
      urls,
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct,
      semanticProduct
    } as const;

    const first = await runPipelinedProductRuntime(common);
    expect(first.validations).toHaveLength(2);
    expect(captureProduct).toHaveBeenCalledTimes(2);
    expect(semanticProduct).toHaveBeenCalledTimes(2);

    const resumed = await runPipelinedProductRuntime(common);

    expect(resumed.validations.map(item => item.sequence)).toEqual([0, 1]);
    expect(captureProduct).toHaveBeenCalledTimes(2);
    expect(semanticProduct).toHaveBeenCalledTimes(2);
  });


  test("resume rehydrates a captured packet instead of recapturing it", async () => {
    const run = await tempRun("resume-captured");
    const url = "https://shop.test/p1";
    const itemId = createPipelinedProductItemId(0, url);
    const packet = await persistPacket(run.root, {
      pageUrl: url,
      sequence: 0,
      itemId
    });

    let state = createRunState({
      runId: "resume-captured",
      inputHash: createHashForUrls([url]),
      urls: [url]
    });
    state = transitionRunItem(
      state,
      0,
      "CAPTURED",
      { captureManifestPath: packet.manifestPath }
    );
    await new AtomicRunStateStore(run.statePath).save(state);

    const captureProduct = vi.fn(async () => {
      throw new Error("capture must not run on resume");
    });
    const semanticProduct = vi.fn(async (received: FrozenProductVisualPacket) => {
      expect(received.itemId).toBe(itemId);
      expect(received.screenshots[0]?.bytes.toString()).toBe("image-0");
      return cameraDecision(received.finalUrl, "Recovered Camera");
    });

    const result = await runPipelinedProductRuntime({
      runId: "resume-captured",
      urls: [url],
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct,
      semanticProduct
    });

    expect(captureProduct).not.toHaveBeenCalled();
    expect(semanticProduct).toHaveBeenCalledTimes(1);
    expect(result.validations).toHaveLength(1);
  });


  test("resume holds AI_IN_FLIGHT without a decision and never replays capture or semantic", async () => {
    const run = await tempRun("resume-ai-in-flight");
    const url = "https://shop.test/p1";
    const itemId = createPipelinedProductItemId(0, url);
    const packet = await persistPacket(run.root, {
      pageUrl: url,
      sequence: 0,
      itemId
    });

    const requestDir = join(run.root, "v15-requests");
    const requestPath = join(requestDir, "0001.request.json");
    await mkdir(requestDir, { recursive: true });
    await writeFile(
      requestPath,
      JSON.stringify(
        {
          schemaVersion: 1,
          runId: "resume-ai-in-flight",
          itemId,
          sequence: 0,
          pageUrl: packet.pageUrl,
          finalUrl: packet.finalUrl,
          website: packet.website,
          captureManifestPath: packet.manifestPath,
          imagePaths: packet.imagePaths
        },
        null,
        2
      ) + "\n",
      "utf8"
    );

    let state = createRunState({
      runId: "resume-ai-in-flight",
      inputHash: createHashForUrls([url]),
      urls: [url]
    });
    state = transitionRunItem(
      state,
      0,
      "CAPTURED",
      {
        captureManifestPath: packet.manifestPath,
        requestPayloadPath: requestPath
      }
    );
    state = transitionRunItem(
      state,
      0,
      "AI_IN_FLIGHT",
      {
        captureManifestPath: packet.manifestPath,
        requestPayloadPath: requestPath,
        providerProfileId: "p1",
        attempts: 1,
        errorClass: null
      }
    );
    await new AtomicRunStateStore(run.statePath).save(state);

    const captureProduct = vi.fn(async () => {
      throw new Error("capture must not replay ambiguous AI_IN_FLIGHT");
    });
    const semanticProduct = vi.fn(async () => {
      throw new Error("semantic must not replay ambiguous AI_IN_FLIGHT");
    });

    const result = await runPipelinedProductRuntime({
      runId: "resume-ai-in-flight",
      urls: [url],
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct,
      semanticProduct
    });

    expect(captureProduct).not.toHaveBeenCalled();
    expect(semanticProduct).not.toHaveBeenCalled();
    expect(result.validations).toEqual([]);
    expect(result.itemErrors).toMatchObject([
      {
        sequence: 0,
        phase: "RECOVERY",
        errorClass: "AI_IN_FLIGHT_REVIEW_HOLD"
      }
    ]);

    const persisted = await new AtomicRunStateStore(run.statePath).load();
    expect(persisted.items[0]?.status).toBe("AI_IN_FLIGHT");
  });


  test("transient provider retry reuses the same frozen packet and bounded backoff", async () => {
    const run = await tempRun("transient");
    const url = "https://shop.test/p1";
    const sleep = vi.fn(async () => undefined);
    const packets: FrozenProductVisualPacket[] = [];
    let calls = 0;

    const result = await runPipelinedProductRuntime({
      runId: "transient",
      urls: [url],
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct: input => persistPacket(run.root, input),
      semanticProduct: async packet => {
        packets.push(packet);
        calls += 1;
        if (calls === 1) {
          throw Object.assign(new Error("service unavailable"), { status: 503 });
        }
        return cameraDecision(packet.finalUrl, "Camera");
      },
      sleep
    });

    expect(calls).toBe(2);
    expect(packets[0]).toBe(packets[1]);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(result.validations).toHaveLength(1);
  });


  test("rate limit keeps same-project backoff behavior", async () => {
    const run = await tempRun("rate-limit");
    const sleep = vi.fn(async () => undefined);
    let calls = 0;

    const result = await runPipelinedProductRuntime({
      runId: "rate-limit",
      urls: ["https://shop.test/p1"],
      statePath: run.statePath,
      providers: [provider("p1", "shared-project")],
      captureProduct: input => persistPacket(run.root, input),
      semanticProduct: async packet => {
        calls += 1;
        if (calls === 1) {
          throw Object.assign(
            new Error("rate limit exceeded"),
            {
              status: 429,
              response: {
                status: 429,
                headers: { "retry-after": "0" }
              }
            }
          );
        }
        return cameraDecision(packet.finalUrl, "Camera");
      },
      sleep,
      now: () => new Date("2026-09-22T00:00:00.000Z")
    });

    expect(calls).toBe(2);
    expect(sleep).toHaveBeenCalledWith(1000);
    expect(result.validations).toHaveLength(1);
    expect(result.providerState[0]?.health).toBe("HEALTHY");
  });


  test("daily quota pauses semantic queue and leaves captured-ahead work resumable", async () => {
    const run = await tempRun("daily-quota");
    const urls = [
      "https://shop.test/p1",
      "https://shop.test/p2",
      "https://shop.test/p3"
    ];
    const captureStarts: number[] = [];
    const semanticProduct = vi.fn(async () => {
      throw Object.assign(
        new Error("daily quota exceeded"),
        { status: 429 }
      );
    });

    const result = await runPipelinedProductRuntime({
      runId: "daily-quota",
      urls,
      statePath: run.statePath,
      providers: [provider("p1", "shared-project")],
      captureProduct: async input => {
        captureStarts.push(input.sequence);
        return persistPacket(run.root, input);
      },
      semanticProduct,
      options: { queueCapacity: 1 }
    });

    expect(result.pausedForQuota).toBe(true);
    expect(semanticProduct).toHaveBeenCalledTimes(1);
    expect(captureStarts).toEqual([0, 1]);
    expect(result.providerState[0]).toMatchObject({
      health: "COOLDOWN",
      cooldownReason: "DAILY_QUOTA"
    });

    const state = await new AtomicRunStateStore(run.statePath).load();
    expect(state.items[0]).toMatchObject({
      status: "AI_IN_FLIGHT",
      attempts: 1,
      errorClass: "DAILY_QUOTA"
    });
    expect(state.items[1]?.status).toBe("CAPTURED");
    expect(state.items[2]?.status).toBe("PENDING");
  });


  test("LEAN_DELETE_SUCCESS deletes only a successfully completed product workspace after durable result persistence", async () => {
    const run = await tempRun("lean-success");
    const url = "https://shop.test/p1";

    const result = await runPipelinedProductRuntime({
      runId: "lean-success",
      urls: [url],
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct: input => persistPacket(run.root, input),
      semanticProduct: async packet =>
        cameraDecision(packet.finalUrl, "Camera"),
      retentionPolicy: "LEAN_DELETE_SUCCESS"
    });

    expect(result.validations).toHaveLength(1);
    expect(result.validations[0]?.validation.status).toBe("VALIDATED");
    expect(await pathExists(join(run.root, "capture-1"))).toBe(false);
    expect(await pathExists(result.validations[0]!.decisionPath)).toBe(true);
    expect(await pathExists(result.validations[0]!.validationPath)).toBe(true);
    expect(await pathExists(result.validations[0]!.resultPath)).toBe(true);

    const durable = await readJsonFile(result.validations[0]!.resultPath) as {
      readonly validationStatus?: unknown;
      readonly row?: { readonly productName?: unknown } | null;
      readonly capture?: { readonly contentHashes?: readonly string[] };
    };

    expect(durable.validationStatus).toBe("VALIDATED");
    expect(durable.row?.productName).toBe("Camera");
    expect(durable.capture?.contentHashes).toEqual(["hash-0"]);
  });


  test("AUDIT_KEEP_ALL retains a successful product workspace", async () => {
    const run = await tempRun("audit-keep");

    const result = await runPipelinedProductRuntime({
      runId: "audit-keep",
      urls: ["https://shop.test/p1"],
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct: input => persistPacket(run.root, input),
      semanticProduct: async packet =>
        cameraDecision(packet.finalUrl, "Camera"),
      retentionPolicy: "AUDIT_KEEP_ALL"
    });

    expect(result.validations).toHaveLength(1);
    expect(await pathExists(join(run.root, "capture-1"))).toBe(true);
  });


  test("LEAN_DELETE_SUCCESS retains REVIEW evidence", async () => {
    const run = await tempRun("lean-review");

    const result = await runPipelinedProductRuntime({
      runId: "lean-review",
      urls: ["https://shop.test/p1"],
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct: input => persistPacket(run.root, input),
      semanticProduct: async () => ({
        classification: "REVIEW",
        row: null
      }),
      retentionPolicy: "LEAN_DELETE_SUCCESS"
    });

    expect(result.validations[0]?.validation.status).toBe("REVIEW");
    expect(await pathExists(join(run.root, "capture-1"))).toBe(true);
    expect(await pathExists(result.validations[0]!.resultPath)).toBe(true);
  });


  test("LEAN_DELETE_SUCCESS retains image evidence when semantic processing errors", async () => {
    const run = await tempRun("lean-error");

    const result = await runPipelinedProductRuntime({
      runId: "lean-error",
      urls: ["https://shop.test/p1"],
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct: input => persistPacket(run.root, input),
      semanticProduct: async () => {
        throw Object.assign(
          new Error("structured output schema failure"),
          { status: 400 }
        );
      },
      retentionPolicy: "LEAN_DELETE_SUCCESS"
    });

    expect(result.validations).toEqual([]);
    expect(result.itemErrors).toHaveLength(1);
    expect(await pathExists(join(run.root, "capture-1"))).toBe(true);
  });


  test("crash before durable result persistence retains image evidence and never marks product complete", async () => {
    const run = await tempRun("lean-crash-before-result");
    const blockedResultRoot = join(run.root, "blocked-result-root");
    await writeFile(blockedResultRoot, "not-a-directory", "utf8");

    const result = await runPipelinedProductRuntime({
      runId: "lean-crash-before-result",
      urls: ["https://shop.test/p1"],
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct: input => persistPacket(run.root, input),
      semanticProduct: async packet =>
        cameraDecision(packet.finalUrl, "Camera"),
      retentionPolicy: "LEAN_DELETE_SUCCESS",
      resultRoot: blockedResultRoot
    });

    expect(result.validations).toEqual([]);
    expect(result.itemErrors).toHaveLength(1);
    expect(await pathExists(join(run.root, "capture-1"))).toBe(true);

    const state = await new AtomicRunStateStore(run.statePath).load();
    expect(state.items[0]?.status).toBe("AI_IN_FLIGHT");
  });


  test("cleanup is isolated to the completed product while the next captured product stays in flight", async () => {
    const run = await tempRun("lean-isolation");
    const secondSemanticStarted = deferred();
    const releaseSecondSemantic = deferred();

    const running = runPipelinedProductRuntime({
      runId: "lean-isolation",
      urls: [
        "https://shop.test/p1",
        "https://shop.test/p2"
      ],
      statePath: run.statePath,
      providers: [provider("p1")],
      captureProduct: input => persistPacket(run.root, input),
      semanticProduct: async packet => {
        if (packet.sequence === 1) {
          secondSemanticStarted.resolve();
          await releaseSecondSemantic.promise;
        }

        return cameraDecision(packet.finalUrl, "Camera " + packet.sequence);
      },
      retentionPolicy: "LEAN_DELETE_SUCCESS"
    });

    await secondSemanticStarted.promise;

    expect(await pathExists(join(run.root, "capture-1"))).toBe(false);
    expect(await pathExists(join(run.root, "capture-2"))).toBe(true);

    releaseSecondSemantic.resolve();
    const result = await running;

    expect(result.validations.map(item => item.sequence)).toEqual([0, 1]);
    expect(await pathExists(join(run.root, "capture-2"))).toBe(false);
  });
});


function createHashForUrls(urls: readonly string[]): string {
  return createHash("sha256").update(urls.join("\n")).digest("hex");
}
