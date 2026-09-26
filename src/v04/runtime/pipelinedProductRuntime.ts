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
  isAbsolute,
  join,
  relative,
  resolve
} from "node:path";

import type {
  MinimalVisualDecision
} from "../contracts/minimalVisualDecision.js";
import type {
  FrozenProductVisualPacket,
  NumberedCaptureManifest,
  NumberedProductScreenshot,
  ProductEvidenceRetentionPolicy,
  ProductPageZone
} from "../contracts/v15PipelineContracts.js";
import {
  validateVisualDecision,
  type ValidationResult
} from "../validation/structuralValidator.js";
import type {
  AdaptiveScreenshot,
  CaptureManifest
} from "../vision/adaptiveCapture.js";

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


export interface PipelinedRuntimeOptions {
  readonly captureConcurrency?: 1;
  readonly semanticConcurrency?: 1;
  readonly queueCapacity?: 1 | 2;
}


export const DEFAULT_PIPELINED_RUNTIME_OPTIONS = {
  captureConcurrency: 1,
  semanticConcurrency: 1,
  queueCapacity: 2
} as const;


export interface CaptureProductInput {
  readonly pageUrl: string;
  readonly sequence: number;
  readonly itemId: string;
}


export type ProductCaptureFunction = (
  input: CaptureProductInput
) => Promise<FrozenProductVisualPacket>;


export type ProductSemanticFunction = (
  packet: FrozenProductVisualPacket,
  provider: ResolvedProviderProfile
) => Promise<MinimalVisualDecision>;


export interface PersistedProductValidation {
  readonly itemId: string;
  readonly sequence: number;
  readonly url: string;
  readonly decisionPath: string;
  readonly validationPath: string;
  readonly resultPath: string;
  readonly validation: ValidationResult;
}


export interface PipelinedProductError {
  readonly itemId: string;
  readonly sequence: number;
  readonly url: string;
  readonly phase: "CAPTURE" | "RECOVERY" | "SEMANTIC" | "RETENTION";
  readonly errorClass: string;
  readonly message: string;
}


export interface PipelinedRuntimeSummary {
  readonly total: number;
  readonly validated: number;
  readonly review: number;
  readonly skippedNonCamera: number;
  readonly errors: number;
  readonly deferred: number;
}


export interface RunPipelinedProductRuntimeInput {
  readonly runId: string;
  readonly urls: readonly string[];
  readonly statePath: string;
  readonly providers: readonly ResolvedProviderProfile[];
  readonly captureProduct: ProductCaptureFunction;
  readonly semanticProduct: ProductSemanticFunction;
  readonly options?: PipelinedRuntimeOptions;
  readonly decisionRoot?: string;
  readonly requestRoot?: string;
  readonly resultRoot?: string;
  readonly retentionPolicy?: ProductEvidenceRetentionPolicy;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
}


export interface PipelinedProductRuntimeResult {
  readonly runId: string;
  readonly statePath: string;
  readonly validations: readonly PersistedProductValidation[];
  readonly itemErrors: readonly PipelinedProductError[];
  readonly summary: PipelinedRuntimeSummary;
  readonly pausedForQuota: boolean;
  readonly providerState: readonly ProviderRuntimeSnapshot[];
}


interface SemanticExecutionResult {
  readonly decision: MinimalVisualDecision;
  readonly providerProfileId: string;
  readonly attempts: number;
}


interface QueuedProductWork {
  readonly itemId: string;
  readonly sequence: number;
  readonly packet: FrozenProductVisualPacket;
}


class QuotaPauseError extends Error {
  public readonly errorClass = "DAILY_QUOTA";

  public constructor(message: string) {
    super(message);
    this.name = "QuotaPauseError";
  }
}


class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  public async runExclusive<T>(
    operation: () => Promise<T> | T
  ): Promise<T> {
    let release!: () => void;
    const previous = this.tail;

    this.tail = new Promise<void>(resolvePromise => {
      release = resolvePromise;
    });

    await previous;

    try {
      return await operation();
    }
    finally {
      release();
    }
  }
}


class BoundedPacketQueue<T> {
  private readonly items: T[] = [];
  private readonly slotWaiters: Array<(granted: boolean) => void> = [];
  private readonly itemWaiters: Array<(item: T | null) => void> = [];
  private occupancy = 0;
  private accepting = true;
  private producerClosed = false;

  public constructor(
    private readonly capacity: number
  ) {}

  public async reserveSlot(): Promise<boolean> {
    if (!this.accepting) {
      return false;
    }

    if (this.occupancy < this.capacity) {
      this.occupancy += 1;
      return true;
    }

    return new Promise<boolean>(resolvePromise => {
      this.slotWaiters.push(resolvePromise);
    });
  }

  public enqueueReserved(item: T): void {
    const waiter = this.itemWaiters.shift();

    if (waiter) {
      this.occupancy -= 1;
      waiter(item);
      this.wakeSlotWaiter();
      return;
    }

    this.items.push(item);
  }

  public releaseReservation(): void {
    this.occupancy = Math.max(0, this.occupancy - 1);
    this.wakeSlotWaiter();
    this.flushClosedConsumersIfEmpty();
  }

  public async dequeue(): Promise<T | null> {
    const item = this.items.shift();

    if (item !== undefined) {
      this.occupancy -= 1;
      this.wakeSlotWaiter();
      this.flushClosedConsumersIfEmpty();
      return item;
    }

    if (this.producerClosed) {
      return null;
    }

    return new Promise<T | null>(resolvePromise => {
      this.itemWaiters.push(resolvePromise);
    });
  }

  public stopAccepting(): void {
    this.accepting = false;

    while (this.slotWaiters.length > 0) {
      this.slotWaiters.shift()!(false);
    }
  }

  public closeProducer(): void {
    this.accepting = false;
    this.producerClosed = true;

    while (this.slotWaiters.length > 0) {
      this.slotWaiters.shift()!(false);
    }

    this.flushClosedConsumersIfEmpty();
  }

  private wakeSlotWaiter(): void {
    if (!this.accepting) {
      return;
    }

    if (
      this.occupancy < this.capacity &&
      this.slotWaiters.length > 0
    ) {
      this.occupancy += 1;
      this.slotWaiters.shift()!(true);
    }
  }

  private flushClosedConsumersIfEmpty(): void {
    if (
      this.producerClosed &&
      this.items.length === 0
    ) {
      while (this.itemWaiters.length > 0) {
        this.itemWaiters.shift()!(null);
      }
    }
  }
}


function validateOptions(
  options: PipelinedRuntimeOptions | undefined
): Required<PipelinedRuntimeOptions> {
  const resolved = {
    ...DEFAULT_PIPELINED_RUNTIME_OPTIONS,
    ...options
  };

  if (resolved.captureConcurrency !== 1) {
    throw new Error("V15 captureConcurrency must remain 1.");
  }

  if (resolved.semanticConcurrency !== 1) {
    throw new Error("V15 semanticConcurrency must remain 1.");
  }

  if (
    resolved.queueCapacity !== 1 &&
    resolved.queueCapacity !== 2
  ) {
    throw new Error("V15 queueCapacity must be 1 or 2.");
  }

  return resolved;
}


function sha256(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}


export function createPipelinedProductItemId(
  sequence: number,
  url: string
): string {
  return (
    "product-" +
    String(sequence + 1).padStart(4, "0") +
    "-" +
    sha256(sequence + "\n" + url).slice(0, 12)
  );
}


function inputHash(urls: readonly string[]): string {
  return sha256(urls.join("\n"));
}


function sameUrls(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}


async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
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
  await mkdir(dirname(filePath), { recursive: true });

  const tempPath =
    filePath + "." + process.pid + "." + Date.now() + ".tmp";

  try {
    await writeFile(
      tempPath,
      JSON.stringify(value, null, 2) + "\n",
      "utf8"
    );
    await rename(tempPath, filePath);
  }
  catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}


async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(
    await readFile(filePath, "utf8")
  ) as unknown;
}


function decisionPathFor(
  decisionRoot: string,
  sequence: number
): string {
  return join(
    decisionRoot,
    String(sequence + 1).padStart(4, "0") + ".decision.json"
  );
}


function validationPathFor(
  decisionRoot: string,
  sequence: number
): string {
  return join(
    decisionRoot,
    String(sequence + 1).padStart(4, "0") + ".validation.json"
  );
}


function resultPathFor(
  resultRoot: string,
  sequence: number
): string {
  return join(
    resultRoot,
    String(sequence + 1).padStart(4, "0") + ".result.json"
  );
}


function requestPathFor(
  requestRoot: string,
  sequence: number
): string {
  return join(
    requestRoot,
    String(sequence + 1).padStart(4, "0") + ".request.json"
  );
}


interface DurableProductResultSidecar {
  readonly schemaVersion: 1;
  readonly runId: string;
  readonly itemId: string;
  readonly sequence: number;
  readonly url: string;
  readonly finalUrl: string;
  readonly website: string;
  readonly validationStatus: ValidationResult["status"];
  readonly row: ValidationResult["row"];
  readonly decisionPath: string;
  readonly validationPath: string;
  readonly requestPayloadPath: string | null;
  readonly capture: {
    readonly manifestPath: string;
    readonly shotCount: number;
    readonly contentHashes: readonly string[];
  };
}


function manifestContentHashes(manifest: CaptureManifest): readonly string[] {
  const hashes: string[] = [];

  for (const shot of manifest.shots) {
    const record = shot as unknown as Record<string, unknown>;
    const value =
      typeof record.contentHash === "string"
        ? record.contentHash
        : typeof record.imageHash === "string"
          ? record.imageHash
          : null;

    if (value) {
      hashes.push(value);
    }
  }

  return hashes;
}


function durableResultSidecar(input: {
  readonly runId: string;
  readonly itemId: string;
  readonly sequence: number;
  readonly url: string;
  readonly website: string;
  readonly finalUrl: string;
  readonly manifestPath: string;
  readonly manifest: CaptureManifest;
  readonly decisionPath: string;
  readonly validationPath: string;
  readonly requestPayloadPath: string | null;
  readonly validation: ValidationResult;
}): DurableProductResultSidecar {
  return {
    schemaVersion: 1,
    runId: input.runId,
    itemId: input.itemId,
    sequence: input.sequence,
    url: input.url,
    finalUrl: input.finalUrl,
    website: input.website,
    validationStatus: input.validation.status,
    row: input.validation.row,
    decisionPath: input.decisionPath,
    validationPath: input.validationPath,
    requestPayloadPath: input.requestPayloadPath,
    capture: {
      manifestPath: input.manifestPath,
      shotCount: input.manifest.shots.length,
      contentHashes: manifestContentHashes(input.manifest)
    }
  };
}


function isCleanupSuccess(validation: ValidationResult): boolean {
  return (
    validation.status === "VALIDATED" ||
    validation.status === "SKIPPED_NON_CAMERA"
  );
}


function isPathInsideDirectory(
  directory: string,
  candidate: string
): boolean {
  const resolvedCandidate = isAbsolute(candidate)
    ? resolve(candidate)
    : resolve(directory, candidate);
  const scoped = relative(directory, resolvedCandidate);

  return (
    scoped.length > 0 &&
    scoped !== ".." &&
    !scoped.startsWith(".." + "/") &&
    !scoped.startsWith(".." + "\\") &&
    !isAbsolute(scoped)
  );
}


async function requestImagePaths(
  requestPayloadPath: string | null
): Promise<readonly string[]> {
  if (!requestPayloadPath || !(await exists(requestPayloadPath))) {
    throw withErrorClass(
      new Error("Retention cleanup requires the durable semantic request sidecar."),
      "MISSING_RETENTION_REQUEST_CHECKPOINT"
    );
  }

  const parsed = await readJson(requestPayloadPath);

  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !Array.isArray((parsed as { readonly imagePaths?: unknown }).imagePaths)
  ) {
    throw withErrorClass(
      new Error("Semantic request sidecar does not contain persisted image paths."),
      "INVALID_RETENTION_REQUEST_CHECKPOINT"
    );
  }

  const imagePaths = (parsed as { readonly imagePaths: readonly unknown[] })
    .imagePaths;

  if (
    imagePaths.length === 0 ||
    !imagePaths.every(value => typeof value === "string" && value.length > 0)
  ) {
    throw withErrorClass(
      new Error("Semantic request sidecar has no usable product image paths."),
      "INVALID_RETENTION_REQUEST_CHECKPOINT"
    );
  }

  return imagePaths as readonly string[];
}


async function deleteProductImageWorkspace(input: {
  readonly sequence: number;
  readonly captureManifestPath: string;
  readonly requestPayloadPath: string | null;
  readonly state: RunState;
}): Promise<void> {
  if (!(await exists(input.captureManifestPath))) {
    return;
  }

  const manifestPath = resolve(input.captureManifestPath);
  const workspace = dirname(manifestPath);

  if (workspace === dirname(workspace)) {
    throw withErrorClass(
      new Error("Refusing to delete a filesystem root as a product workspace."),
      "UNSAFE_RETENTION_SCOPE"
    );
  }

  const imagePaths = await requestImagePaths(input.requestPayloadPath);

  for (const imagePath of imagePaths) {
    if (!isPathInsideDirectory(workspace, imagePath)) {
      throw withErrorClass(
        new Error("Refusing cleanup because a persisted image path escapes the product workspace."),
        "UNSAFE_RETENTION_SCOPE"
      );
    }
  }

  for (const other of input.state.items) {
    if (
      other.index === input.sequence ||
      !other.captureManifestPath
    ) {
      continue;
    }

    if (dirname(resolve(other.captureManifestPath)) === workspace) {
      throw withErrorClass(
        new Error("Refusing cleanup because another product references the same capture workspace."),
        "RETENTION_WORKSPACE_COLLISION"
      );
    }
  }

  await rm(workspace, {
    recursive: true,
    force: true
  });
}


function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


function runtimeErrorClass(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "errorClass" in error &&
    typeof (error as { readonly errorClass?: unknown }).errorClass === "string"
  ) {
    return (error as { readonly errorClass: string }).errorClass;
  }

  return "UNKNOWN";
}


function withErrorClass(
  error: unknown,
  errorClass: string
): Error {
  return Object.assign(
    error instanceof Error
      ? error
      : new Error(errorMessage(error)),
    { errorClass }
  );
}


async function loadOrCreateState(
  input: RunPipelinedProductRuntimeInput,
  statePath: string,
  store: AtomicRunStateStore
): Promise<RunState> {
  const expectedHash = inputHash(input.urls);

  if (await exists(statePath)) {
    const state = await store.load();

    if (
      state.runId !== input.runId ||
      state.inputHash !== expectedHash ||
      !sameUrls(state.urls, input.urls)
    ) {
      throw new Error(
        "Resume input does not match persisted V15 run state."
      );
    }

    return state;
  }

  const state = createRunState({
    runId: input.runId,
    inputHash: expectedHash,
    urls: input.urls,
    now: input.now?.()
  });

  await store.save(state);
  return state;
}


function authoritativeTransportDecision(
  decision: MinimalVisualDecision,
  packet: FrozenProductVisualPacket
): unknown {
  if (
    decision === null ||
    typeof decision !== "object" ||
    Array.isArray(decision)
  ) {
    return decision;
  }

  const record = decision as unknown as Record<string, unknown>;
  const row = record.row;

  if (
    row === null ||
    typeof row !== "object" ||
    Array.isArray(row)
  ) {
    return decision;
  }

  return {
    ...record,
    row: {
      ...(row as Record<string, unknown>),
      website: packet.website,
      url: packet.finalUrl
    }
  };
}


async function assertDurablePacket(
  packet: FrozenProductVisualPacket,
  expected: CaptureProductInput
): Promise<void> {
  if (packet.itemId !== expected.itemId) {
    throw withErrorClass(
      new Error("Captured packet itemId does not match requested itemId."),
      "CAPTURE_IDENTITY_MISMATCH"
    );
  }

  if (packet.sequence !== expected.sequence) {
    throw withErrorClass(
      new Error("Captured packet sequence does not match requested sequence."),
      "CAPTURE_IDENTITY_MISMATCH"
    );
  }

  if (packet.pageUrl !== expected.pageUrl) {
    throw withErrorClass(
      new Error("Captured packet pageUrl does not match requested URL."),
      "CAPTURE_IDENTITY_MISMATCH"
    );
  }

  if (!packet.manifestPath) {
    throw withErrorClass(
      new Error("V15 product packet must have a durable manifestPath."),
      "NON_DURABLE_CAPTURE_PACKET"
    );
  }

  if (!(await exists(packet.manifestPath))) {
    throw withErrorClass(
      new Error("Capture manifest does not exist: " + packet.manifestPath),
      "MISSING_CAPTURE_ARTIFACT"
    );
  }

  if (packet.imagePaths.length !== packet.screenshots.length) {
    throw withErrorClass(
      new Error("Persisted image path count does not match screenshot count."),
      "CAPTURE_ARTIFACT_MISMATCH"
    );
  }

  for (const imagePath of packet.imagePaths) {
    if (!(await exists(imagePath))) {
      throw withErrorClass(
        new Error("Capture image does not exist: " + imagePath),
        "MISSING_CAPTURE_ARTIFACT"
      );
    }
  }
}


function captureRole(
  role: CaptureManifest["shots"][number]["role"]
): AdaptiveScreenshot["role"] {
  return role;
}


const PRODUCT_PAGE_ZONES =
  new Set<ProductPageZone>([
    "HERO",
    "UPPER",
    "MIDDLE",
    "LOWER",
    "TAIL",
    "FOOTER"
  ]);


function assertNumberedCaptureManifest(
  value: unknown
): asserts value is NumberedCaptureManifest {
  if (
    value === null ||
    typeof value !== "object" ||
    !Array.isArray((value as { readonly shots?: unknown }).shots) ||
    typeof (value as { readonly url?: unknown }).url !== "string" ||
    typeof (value as { readonly finalUrl?: unknown }).finalUrl !== "string"
  ) {
    throw withErrorClass(
      new Error("Persisted capture manifest is structurally invalid."),
      "INVALID_CAPTURE_CHECKPOINT"
    );
  }

  const shots =
    (value as { readonly shots: readonly unknown[] }).shots;

  if (shots.length === 0) {
    throw withErrorClass(
      new Error("Persisted capture manifest contains no numbered screenshots."),
      "INVALID_CAPTURE_CHECKPOINT"
    );
  }

  let previousScrollY = -Infinity;

  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index];

    if (
      shot === null ||
      typeof shot !== "object" ||
      Array.isArray(shot)
    ) {
      throw withErrorClass(
        new Error("Persisted capture manifest contains an invalid shot record."),
        "INVALID_CAPTURE_CHECKPOINT"
      );
    }

    const record =
      shot as Record<string, unknown>;
    const expectedSequence =
      index + 1;
    const expectedPrefix =
      String(expectedSequence).padStart(2, "0") + "-";

    if (
      record.sequence !== expectedSequence ||
      typeof record.shotId !== "string" ||
      !record.shotId.startsWith(expectedPrefix) ||
      typeof record.pageZone !== "string" ||
      !PRODUCT_PAGE_ZONES.has(record.pageZone as ProductPageZone) ||
      typeof record.scrollY !== "number" ||
      typeof record.documentHeight !== "number" ||
      typeof record.contentHash !== "string" ||
      typeof record.imageHash !== "string" ||
      typeof record.width !== "number" ||
      typeof record.height !== "number" ||
      typeof record.isAuthoritativeHero !== "boolean" ||
      record.dimensions === null ||
      typeof record.dimensions !== "object" ||
      typeof (record.dimensions as Record<string, unknown>).width !== "number" ||
      typeof (record.dimensions as Record<string, unknown>).height !== "number"
    ) {
      throw withErrorClass(
        new Error("Persisted capture manifest does not satisfy the V15 numbered-shot contract."),
        "INVALID_CAPTURE_CHECKPOINT"
      );
    }

    if (
      index === 0 &&
      (
        record.shotId !== "01-hero-final" ||
        record.pageZone !== "HERO" ||
        record.isAuthoritativeHero !== true ||
        record.scrollY !== 0
      )
    ) {
      throw withErrorClass(
        new Error("Persisted capture manifest does not begin with authoritative 01-hero-final."),
        "INVALID_CAPTURE_CHECKPOINT"
      );
    }

    if (
      index > 0 &&
      record.isAuthoritativeHero === true
    ) {
      throw withErrorClass(
        new Error("Only screenshot 1 may be the authoritative hero."),
        "INVALID_CAPTURE_CHECKPOINT"
      );
    }

    if (
      typeof record.scrollY === "number" &&
      record.scrollY < previousScrollY
    ) {
      throw withErrorClass(
        new Error("Persisted numbered screenshots are not ordered top-to-bottom."),
        "INVALID_CAPTURE_CHECKPOINT"
      );
    }

    previousScrollY =
      record.scrollY as number;
  }
}


async function rehydrateFrozenPacket(
  input: CaptureProductInput,
  manifestPath: string
): Promise<FrozenProductVisualPacket> {
  const parsed =
    await readJson(manifestPath);

  assertNumberedCaptureManifest(
    parsed
  );

  const root = dirname(manifestPath);
  const screenshots: NumberedProductScreenshot[] = [];
  const imagePaths: string[] = [];

  for (const shot of parsed.shots) {
    if (!shot.path) {
      throw withErrorClass(
        new Error("Persisted capture manifest contains a shot without a path."),
        "INVALID_CAPTURE_CHECKPOINT"
      );
    }

    const imagePath = isAbsolute(shot.path)
      ? shot.path
      : resolve(root, shot.path);

    const bytes = await readFile(imagePath);

    imagePaths.push(imagePath);
    screenshots.push({
      sequence: shot.sequence,
      shotId: shot.shotId,
      role: captureRole(shot.role),
      bytes,
      fingerprint: {
        imageHash: shot.imageHash,
        scrollY: shot.scrollY,
        documentHeight: shot.documentHeight
      },
      pageZone: shot.pageZone,
      scrollY: shot.scrollY,
      documentHeight: shot.documentHeight,
      dimensions: {
        width: shot.dimensions.width,
        height: shot.dimensions.height
      },
      width: shot.width,
      height: shot.height,
      contentHash: shot.contentHash,
      path: shot.path,
      isAuthoritativeHero: shot.isAuthoritativeHero
    });
  }

  const finalUrl = parsed.finalUrl;
  const website = new URL(finalUrl)
    .hostname
    .toLowerCase()
    .replace(/^www\./u, "");

  const packet: FrozenProductVisualPacket = {
    itemId: input.itemId,
    sequence: input.sequence,
    website,
    pageUrl: input.pageUrl,
    finalUrl,
    screenshots,
    manifest: parsed,
    manifestPath,
    imagePaths
  };

  await assertDurablePacket(packet, input);
  return packet;
}


function nextHealthyProfile(
  pool: ProviderPool,
  profiles: readonly ResolvedProviderProfile[],
  excluded: ReadonlySet<string>
): ResolvedProviderProfile | null {
  const health = new Map(
    pool.snapshot().map(item => [item.profileId, item.health] as const)
  );

  for (const profile of profiles) {
    if (
      !excluded.has(profile.profile.id) &&
      health.get(profile.profile.id) === "HEALTHY"
    ) {
      return profile;
    }
  }

  return null;
}


async function executeSemanticProduct(
  packet: FrozenProductVisualPacket,
  semanticProduct: ProductSemanticFunction,
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
  let profile = pool.selectEligibleProfile();

  if (!profile) {
    throw new Error("No eligible provider profile is available.");
  }

  const exhaustedTransient = new Set<string>();
  const retriedTransient = new Set<string>();
  const retriedRateLimit = new Set<string>();
  let attempts = 0;

  while (profile) {
    attempts += 1;

    await options.persistAttempt({
      providerProfileId: profile.profile.id,
      attempts,
      errorClass: null
    });

    try {
      return {
        decision: await semanticProduct(packet, profile),
        providerProfileId: profile.profile.id,
        attempts
      };
    }
    catch (error) {
      const failure = pool.handleFailure(
        profile.profile.id,
        error,
        { now: options.now() }
      );

      await options.persistAttempt({
        providerProfileId: profile.profile.id,
        attempts,
        errorClass: failure.classification.errorClass
      });

      switch (failure.action) {
        case "FAILOVER_CREDENTIAL": {
          const excluded = new Set<string>([
            profile.profile.id,
            ...exhaustedTransient
          ]);
          const next = nextHealthyProfile(pool, profiles, excluded);

          if (!next) {
            throw error;
          }

          profile = next;
          continue;
        }

        case "RETRY_ONCE_THEN_FAILOVER": {
          if (!retriedTransient.has(profile.profile.id)) {
            retriedTransient.add(profile.profile.id);

            await options.sleep(
              computeBoundedBackoffMs({
                attempt: 1,
                retryAfterMs: failure.retryAfterMs,
                jitterRatio: 0
              })
            );

            continue;
          }

          exhaustedTransient.add(profile.profile.id);
          const next = nextHealthyProfile(
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
          if (retriedRateLimit.has(profile.profile.id)) {
            throw error;
          }

          retriedRateLimit.add(profile.profile.id);
          const startedAt = options.now();
          const delay = computeBoundedBackoffMs({
            attempt: 1,
            retryAfterMs: failure.retryAfterMs,
            jitterRatio: 0
          });

          await options.sleep(delay);
          pool.clearCooldowns(
            new Date(startedAt.getTime() + delay + 1)
          );

          const sameProfile = pool.getProfile(profile.profile.id);

          if (!sameProfile) {
            throw error;
          }

          profile = sameProfile;
          continue;
        }

        case "PAUSE_AI_QUEUE":
          throw new QuotaPauseError(errorMessage(error));

        case "REVIEW":
        default:
          throw withErrorClass(
            error,
            failure.classification.errorClass
          );
      }
    }
  }

  throw new Error("No eligible provider profile is available.");
}


function finalStateStatus(
  validation: ValidationResult
): "VALIDATED" | "REVIEW" {
  return validation.status === "REVIEW"
    ? "REVIEW"
    : "VALIDATED";
}


function transitionPersistedValidation(
  state: RunState,
  sequence: number,
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
  let item = next.items[sequence]!;

  if (item.status === "PENDING") {
    next = transitionRunItem(
      next,
      sequence,
      "CAPTURED",
      {
        captureManifestPath: input.captureManifestPath,
        requestPayloadPath: input.requestPayloadPath
      },
      input.now
    );
    item = next.items[sequence]!;
  }

  if (item.status === "CAPTURED") {
    next = transitionRunItem(
      next,
      sequence,
      "AI_IN_FLIGHT",
      {
        providerProfileId: input.providerProfileId,
        attempts: Math.max(item.attempts, input.attempts),
        errorClass: null,
        requestPayloadPath: input.requestPayloadPath
      },
      input.now
    );
    item = next.items[sequence]!;
  }

  if (item.status === "AI_IN_FLIGHT") {
    next = transitionRunItem(
      next,
      sequence,
      "EXTRACTED",
      {
        resultJsonPath: input.decisionPath,
        providerProfileId: input.providerProfileId ?? item.providerProfileId,
        attempts: Math.max(item.attempts, input.attempts),
        errorClass: null,
        requestPayloadPath: input.requestPayloadPath
      },
      input.now
    );
    item = next.items[sequence]!;
  }

  if (item.status === "EXTRACTED") {
    next = transitionRunItem(
      next,
      sequence,
      finalStateStatus(input.validation),
      {
        resultJsonPath: input.decisionPath
      },
      input.now
    );
    item = next.items[sequence]!;
  }

  if (
    item.status === "VALIDATED" ||
    item.status === "REVIEW" ||
    item.status === "COMMITTED"
  ) {
    next = transitionRunItem(
      next,
      sequence,
      item.status,
      {
        resultJsonPath: input.decisionPath,
        captureManifestPath: input.captureManifestPath,
        requestPayloadPath: input.requestPayloadPath
      },
      input.now
    );
  }

  return next;
}


function summaryFor(
  urls: readonly string[],
  validations: readonly PersistedProductValidation[],
  errors: readonly PipelinedProductError[]
): PipelinedRuntimeSummary {
  const statuses = validations.map(item => item.validation.status);
  const completedOrErrored = new Set<number>([
    ...validations.map(item => item.sequence),
    ...errors.map(item => item.sequence)
  ]);

  return {
    total: urls.length,
    validated: statuses.filter(status => status === "VALIDATED").length,
    review: statuses.filter(status => status === "REVIEW").length,
    skippedNonCamera:
      statuses.filter(status => status === "SKIPPED_NON_CAMERA").length,
    errors: errors.length,
    deferred: Math.max(0, urls.length - completedOrErrored.size)
  };
}


export async function runPipelinedProductRuntime(
  input: RunPipelinedProductRuntimeInput
): Promise<PipelinedProductRuntimeResult> {
  const options = validateOptions(input.options);
  const statePath = resolve(input.statePath);
  const decisionRoot = resolve(
    input.decisionRoot ?? join(dirname(statePath), "v15-decisions")
  );
  const requestRoot = resolve(
    input.requestRoot ?? join(dirname(statePath), "v15-requests")
  );
  const resultRoot = resolve(
    input.resultRoot ?? join(dirname(statePath), "v15-results")
  );
  const retentionPolicy =
    input.retentionPolicy ?? "AUDIT_KEEP_ALL";
  const sleep = input.sleep ?? (
    (ms: number) => new Promise<void>(resolvePromise => {
      setTimeout(resolvePromise, ms);
    })
  );
  const now = input.now ?? (() => new Date());

  const store = new AtomicRunStateStore(statePath);
  let state = await loadOrCreateState(input, statePath, store);
  const stateMutex = new AsyncMutex();
  const pool = new ProviderPool(input.providers);
  const queue = new BoundedPacketQueue<QueuedProductWork>(
    options.queueCapacity
  );
  const validations = new Map<number, PersistedProductValidation>();
  const itemErrors = new Map<number, PipelinedProductError>();
  let pausedForQuota = false;

  const saveState = async (
    operation: (current: RunState) => RunState
  ): Promise<RunState> =>
    stateMutex.runExclusive(async () => {
      state = operation(state);
      await store.save(state);
      return state;
    });

  const readStateItem = async (sequence: number): Promise<RunUrlState> =>
    stateMutex.runExclusive(() => state.items[sequence]!);

  const recordError = (
    sequence: number,
    phase: PipelinedProductError["phase"],
    error: unknown,
    overrideClass?: string
  ): void => {
    itemErrors.set(sequence, {
      itemId: createPipelinedProductItemId(sequence, input.urls[sequence]!),
      sequence,
      url: input.urls[sequence]!,
      phase,
      errorClass: overrideClass ?? runtimeErrorClass(error),
      message: errorMessage(error)
    });
  };

  const cleanupIfEligible = async (
    sequence: number,
    validation: ValidationResult,
    captureManifestPath: string,
    requestPayloadPath: string | null
  ): Promise<void> => {
    if (
      retentionPolicy !== "LEAN_DELETE_SUCCESS" ||
      !isCleanupSuccess(validation)
    ) {
      return;
    }

    try {
      await deleteProductImageWorkspace({
        sequence,
        captureManifestPath,
        requestPayloadPath,
        state: await stateMutex.runExclusive(() => state)
      });
    }
    catch (error) {
      recordError(sequence, "RETENTION", error);
    }
  };


  const recoverCompleted = async (
    sequence: number,
    itemId: string,
    url: string
  ): Promise<boolean> => {
    const item = await readStateItem(sequence);
    const deterministicDecisionPath = decisionPathFor(decisionRoot, sequence);
    const candidatePaths = [
      item.resultJsonPath,
      deterministicDecisionPath
    ].filter((value): value is string => Boolean(value));

    let recoveredPath: string | null = null;

    for (const candidate of candidatePaths) {
      if (await exists(candidate)) {
        recoveredPath = candidate;
        break;
      }
    }

    if (recoveredPath) {
      if (!item.captureManifestPath) {
        recordError(
          sequence,
          "RECOVERY",
          new Error(
            "Persisted semantic decision exists without a durable capture checkpoint."
          ),
          "MISSING_CAPTURE_CHECKPOINT"
        );
        return true;
      }

      try {
        const decision = await readJson(recoveredPath);
        const validation = validateVisualDecision(decision);
        const validationPath = validationPathFor(decisionRoot, sequence);
        const resultPath = resultPathFor(resultRoot, sequence);

        await writeJsonAtomic(validationPath, validation);

        if (!(await exists(resultPath))) {
          if (!(await exists(item.captureManifestPath))) {
            throw withErrorClass(
              new Error(
                "Durable product result is missing after the capture workspace is no longer available."
              ),
              "MISSING_PRODUCT_RESULT_CHECKPOINT"
            );
          }

          const manifest = await readJson(
            item.captureManifestPath
          ) as CaptureManifest;
          const finalUrl = manifest.finalUrl;
          const website = new URL(finalUrl)
            .hostname
            .toLowerCase()
            .replace(/^www\./u, "");

          await writeJsonAtomic(
            resultPath,
            durableResultSidecar({
              runId: input.runId,
              itemId,
              sequence,
              url,
              website,
              finalUrl,
              manifestPath: item.captureManifestPath,
              manifest,
              decisionPath: recoveredPath!,
              validationPath,
              requestPayloadPath: item.requestPayloadPath,
              validation
            })
          );
        }

        await saveState(current =>
          transitionPersistedValidation(
            current,
            sequence,
            {
              validation,
              decisionPath: recoveredPath!,
              captureManifestPath: item.captureManifestPath!,
              requestPayloadPath: item.requestPayloadPath,
              providerProfileId: item.providerProfileId,
              attempts: item.attempts,
              now: now()
            }
          )
        );

        validations.set(sequence, {
          itemId,
          sequence,
          url,
          decisionPath: recoveredPath,
          validationPath,
          resultPath,
          validation
        });

        await cleanupIfEligible(
          sequence,
          validation,
          item.captureManifestPath,
          item.requestPayloadPath
        );
      }
      catch (error) {
        recordError(
          sequence,
          "RECOVERY",
          error,
          "INVALID_DECISION_CHECKPOINT"
        );
      }

      return true;
    }

    if (
      item.status === "EXTRACTED" ||
      item.status === "VALIDATED" ||
      item.status === "REVIEW" ||
      item.status === "COMMITTED"
    ) {
      recordError(
        sequence,
        "RECOVERY",
        new Error(
          "Run state marks semantic work complete but no persisted decision exists."
        ),
        "MISSING_DECISION_CHECKPOINT"
      );
      return true;
    }

    return false;
  };

  const producer = (async (): Promise<void> => {
    try {
      for (
        let sequence = 0;
        sequence < input.urls.length;
        sequence += 1
      ) {
        if (pausedForQuota) {
          break;
        }

        const url = input.urls[sequence]!;
        const itemId = createPipelinedProductItemId(sequence, url);

        if (await recoverCompleted(sequence, itemId, url)) {
          continue;
        }

        const resumeItem = await readStateItem(sequence);

        if (resumeItem.status === "AI_IN_FLIGHT") {
          recordError(
            sequence,
            "RECOVERY",
            new Error(
              "Persisted AI_IN_FLIGHT state has no decision checkpoint; semantic replay is held for review."
            ),
            "AI_IN_FLIGHT_REVIEW_HOLD"
          );
          continue;
        }

        const reserved = await queue.reserveSlot();

        if (!reserved) {
          break;
        }

        let reservationHeld = true;

        try {
          const captureInput: CaptureProductInput = {
            pageUrl: url,
            sequence,
            itemId
          };
          const item = await readStateItem(sequence);
          let packet: FrozenProductVisualPacket;

          if (item.captureManifestPath) {
            packet = await rehydrateFrozenPacket(
              captureInput,
              item.captureManifestPath
            );
          }
          else if (item.status === "PENDING") {
            packet = await input.captureProduct(captureInput);
            await assertDurablePacket(packet, captureInput);

            await saveState(current =>
              transitionRunItem(
                current,
                sequence,
                "CAPTURED",
                {
                  captureManifestPath: packet.manifestPath
                },
                now()
              )
            );
          }
          else {
            throw withErrorClass(
              new Error(
                "Resume state requires a capture checkpoint before semantic work."
              ),
              "MISSING_CAPTURE_CHECKPOINT"
            );
          }

          queue.enqueueReserved({
            itemId,
            sequence,
            packet
          });
          reservationHeld = false;
        }
        catch (error) {
          recordError(sequence, "CAPTURE", error);
        }
        finally {
          if (reservationHeld) {
            queue.releaseReservation();
          }
        }
      }
    }
    finally {
      queue.closeProducer();
    }
  })();

  const consumer = (async (): Promise<void> => {
    while (!pausedForQuota) {
      const work = await queue.dequeue();

      if (!work) {
        break;
      }

      const sequence = work.sequence;
      const url = input.urls[sequence]!;
      const requestPath = requestPathFor(requestRoot, sequence);
      const decisionPath = decisionPathFor(decisionRoot, sequence);
      const validationPath = validationPathFor(decisionRoot, sequence);
      const resultPath = resultPathFor(resultRoot, sequence);

      try {
        await writeJsonAtomic(requestPath, {
          schemaVersion: 1,
          runId: input.runId,
          itemId: work.itemId,
          sequence,
          pageUrl: work.packet.pageUrl,
          finalUrl: work.packet.finalUrl,
          website: work.packet.website,
          captureManifestPath: work.packet.manifestPath,
          imagePaths: work.packet.imagePaths
        });

        await saveState(current => {
          const item = current.items[sequence]!;

          if (
            item.status !== "CAPTURED" &&
            item.status !== "AI_IN_FLIGHT"
          ) {
            throw new Error(
              "Semantic checkpoint requires CAPTURED or AI_IN_FLIGHT state."
            );
          }

          return transitionRunItem(
            current,
            sequence,
            item.status,
            {
              captureManifestPath: work.packet.manifestPath,
              requestPayloadPath: requestPath
            },
            now()
          );
        });

        const executed = await executeSemanticProduct(
          work.packet,
          input.semanticProduct,
          pool,
          input.providers,
          {
            sleep,
            now,
            persistAttempt: async checkpoint => {
              await saveState(current => {
                const item = current.items[sequence]!;

                if (
                  item.status !== "CAPTURED" &&
                  item.status !== "AI_IN_FLIGHT"
                ) {
                  throw new Error(
                    "Provider attempt checkpoint requires CAPTURED or AI_IN_FLIGHT state."
                  );
                }

                return transitionRunItem(
                  current,
                  sequence,
                  "AI_IN_FLIGHT",
                  {
                    captureManifestPath: work.packet.manifestPath,
                    requestPayloadPath: requestPath,
                    providerProfileId: checkpoint.providerProfileId,
                    attempts: Math.max(item.attempts, checkpoint.attempts),
                    errorClass: checkpoint.errorClass
                  },
                  now()
                );
              });
            }
          }
        );

        const decision = authoritativeTransportDecision(
          executed.decision,
          work.packet
        );
        const validation = validateVisualDecision(decision);

        await writeJsonAtomic(decisionPath, decision);
        await writeJsonAtomic(validationPath, validation);
        await writeJsonAtomic(
          resultPath,
          durableResultSidecar({
            runId: input.runId,
            itemId: work.itemId,
            sequence,
            url,
            website: work.packet.website,
            finalUrl: work.packet.finalUrl,
            manifestPath: work.packet.manifestPath!,
            manifest: work.packet.manifest,
            decisionPath,
            validationPath,
            requestPayloadPath: requestPath,
            validation
          })
        );

        await saveState(current =>
          transitionPersistedValidation(
            current,
            sequence,
            {
              validation,
              decisionPath,
              captureManifestPath: work.packet.manifestPath!,
              requestPayloadPath: requestPath,
              providerProfileId: executed.providerProfileId,
              attempts: executed.attempts,
              now: now()
            }
          )
        );

        validations.set(sequence, {
          itemId: work.itemId,
          sequence,
          url,
          decisionPath,
          validationPath,
          resultPath,
          validation
        });

        await cleanupIfEligible(
          sequence,
          validation,
          work.packet.manifestPath!,
          requestPath
        );
      }
      catch (error) {
        recordError(sequence, "SEMANTIC", error);

        if (runtimeErrorClass(error) === "DAILY_QUOTA") {
          pausedForQuota = true;
          queue.stopAccepting();
          break;
        }
      }
    }
  })();

  await Promise.all([producer, consumer]);

  const orderedValidations = [...validations.values()]
    .sort((left, right) => left.sequence - right.sequence);
  const orderedErrors = [...itemErrors.values()]
    .sort((left, right) => left.sequence - right.sequence);

  return {
    runId: input.runId,
    statePath,
    validations: orderedValidations,
    itemErrors: orderedErrors,
    summary: summaryFor(input.urls, orderedValidations, orderedErrors),
    pausedForQuota,
    providerState: pool.snapshot()
  };
}
