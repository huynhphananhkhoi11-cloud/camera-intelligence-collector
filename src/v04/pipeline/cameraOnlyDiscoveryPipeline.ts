import {
  dirname,
  join
} from "node:path";

import type {
  Browser,
  Page
} from "playwright";

import {
  selectCameraRoutes,
  type CameraRouteGeminiCall,
  type CameraRouteGeminiRequest
} from "../ai/cameraRouteSelector.js";

import {
  interpretFrozenProductWithGemini,
  type ProductCameraSemanticProvider,
  type ProductCameraSemanticRequest
} from "../ai/productCameraSemanticPrompt.js";

import type {
  ApprovedCameraRoute,
  CameraRouteDecision,
  ProductEvidenceRetentionPolicy,
  SiteReconnaissancePacket
} from "../contracts/v15PipelineContracts.js";

import {
  discoverApprovedCameraRoutes,
  type ListingDiscoverer,
  type ProductUrlQueueResult
} from "../discovery/approvedRouteDiscovery.js";

import {
  exportCamera13WorkbookAtomic
} from "../export/camera13Workbook.js";

import {
  createGeminiInteractionsProvider,
  type GeminiInteractionsProviderOptions
} from "./minimalProductPipeline.js";

import {
  captureSiteReconnaissance
} from "../recon/siteReconnaissance.js";

import {
  runPipelinedProductRuntime,
  type PipelinedProductRuntimeResult
} from "../runtime/pipelinedProductRuntime.js";

import {
  captureProductVisualPacket,
  isRecoverableProductCaptureNavigationError
} from "../vision/productCapturePacket.js";

import {
  computeBoundedBackoffMs
} from "../../v03/provider/backoff.js";

import {
  ProviderPool
} from "../../v03/provider/providerPool.js";

import type {
  ResolvedProviderProfile
} from "../../v03/provider/providerProfile.js";


export interface CameraOnlyDiscoveryDependencies<TProductRuntime> {
  readonly captureReconnaissance: (
    rootUrl: string
  ) => Promise<SiteReconnaissancePacket>;

  readonly selectRoutes: (
    packet: SiteReconnaissancePacket
  ) => Promise<CameraRouteDecision>;

  readonly discoverRoutes: (
    routes: readonly ApprovedCameraRoute[]
  ) => Promise<ProductUrlQueueResult>;

  readonly runProducts: (
    urls: readonly string[]
  ) => Promise<TProductRuntime>;
}


export interface CameraOnlyDiscoveryOrchestrationResult<TProductRuntime> {
  readonly approvedRoutes: readonly ApprovedCameraRoute[];
  readonly productUrls: readonly string[];
  readonly discoveryPasses: number;
  readonly productRuntime: TProductRuntime;
}


export interface CameraOnlyProductRuntimeInput {
  readonly runId: string;
  readonly urls: readonly string[];
  readonly browser: Browser;
  readonly providers: readonly ResolvedProviderProfile[];
  readonly captureRoot: string;
  readonly statePath: string;
  readonly outputPath: string;
  readonly fetchFn?: typeof fetch;
  readonly geminiBaseUrl?: string;
  readonly retentionPolicy?: ProductEvidenceRetentionPolicy;
}


export interface CameraOnlyDiscoveryPipelineInput
extends Omit<CameraOnlyProductRuntimeInput, "urls"> {
  readonly roots: readonly string[];
  readonly listingDiscoverer?: ListingDiscoverer;
}


export interface CameraOnlyDiscoveryPipelineResult
extends CameraOnlyDiscoveryOrchestrationResult<PipelinedProductRuntimeResult> {}


export async function runFreshPageCaptureWithRecovery<T>(
  createPage: () => Promise<Page>,
  capture: (page: Page) => Promise<T>,
  maxPageAttempts = 2
): Promise<T> {
  const boundedAttempts = Math.max(1, Math.min(2, Math.trunc(maxPageAttempts)));
  let lastError: unknown = new Error("Fresh-page capture failed without an error.");

  for (let attempt = 1; attempt <= boundedAttempts; attempt += 1) {
    const page = await createPage();

    try {
      return await capture(page);
    }
    catch (error) {
      lastError = error;

      if (
        attempt >= boundedAttempts ||
        !isRecoverableProductCaptureNavigationError(error)
      ) {
        throw error;
      }
    }
    finally {
      await page.close().catch(() => undefined);
    }
  }

  throw lastError;
}


interface RetryAdapterOptions {
  readonly sleep?: (ms: number) => Promise<void>;
  readonly now?: () => Date;
  readonly fetchFn?: typeof fetch;
  readonly geminiBaseUrl?: string;
}


function uniqueFirstSeen(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    out.push(value);
  }

  return out;
}


export function resolveApprovedCameraRoutes(
  packet: SiteReconnaissancePacket,
  decision: CameraRouteDecision
): ApprovedCameraRoute[] {
  const candidates = new Map(
    packet.candidates.map(candidate => [candidate.candidateId, candidate] as const)
  );
  const seenIds = new Set<string>();
  const routes: ApprovedCameraRoute[] = [];

  for (const candidateId of decision.approvedCandidateIds) {
    if (seenIds.has(candidateId)) {
      continue;
    }

    seenIds.add(candidateId);
    const candidate = candidates.get(candidateId);

    if (!candidate) {
      continue;
    }

    routes.push({
      candidateId: candidate.candidateId,
      label: candidate.label,
      url: candidate.url
    });
  }

  return routes;
}


export async function orchestrateCameraOnlyDiscovery<TProductRuntime>(
  roots: readonly string[],
  dependencies: CameraOnlyDiscoveryDependencies<TProductRuntime>
): Promise<CameraOnlyDiscoveryOrchestrationResult<TProductRuntime>> {
  const approvedRoutes: ApprovedCameraRoute[] = [];
  const seenRouteUrls = new Set<string>();

  for (const rootUrl of roots) {
    const packet = await dependencies.captureReconnaissance(rootUrl);
    const decision = await dependencies.selectRoutes(packet);

    for (const route of resolveApprovedCameraRoutes(packet, decision)) {
      if (seenRouteUrls.has(route.url)) {
        continue;
      }

      seenRouteUrls.add(route.url);
      approvedRoutes.push(route);
    }
  }

  const discovered = await dependencies.discoverRoutes(approvedRoutes);
  const productUrls = uniqueFirstSeen(discovered.urls);
  const productRuntime = await dependencies.runProducts(productUrls);

  return {
    approvedRoutes,
    productUrls,
    discoveryPasses: discovered.passes,
    productRuntime
  };
}


function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
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


function nextHealthyProfile(
  pool: ProviderPool,
  providers: readonly ResolvedProviderProfile[],
  excluded: ReadonlySet<string>
): ResolvedProviderProfile | null {
  const health = new Map(
    pool.snapshot().map(item => [item.profileId, item.health] as const)
  );

  for (const provider of providers) {
    if (
      !excluded.has(provider.profile.id) &&
      health.get(provider.profile.id) === "HEALTHY"
    ) {
      return provider;
    }
  }

  return null;
}


function navigationInteractionRequest(
  request: CameraRouteGeminiRequest
) {
  const input: Array<
    | {
        readonly type: "text";
        readonly text: string;
      }
    | {
        readonly type: "image";
        readonly data: string;
        readonly mime_type: "image/png";
      }
  > = [];

  for (const part of request.input) {
    if (part.type === "text") {
      input.push({
        type: "text",
        text: part.text
      });
      continue;
    }

    /*
     * DEV2 keeps shotId as local structural metadata.
     * Gemini Interactions only receives the image transport fields.
     * Input order is preserved exactly.
     */
    input.push({
      type: "image",
      data: part.data,
      mime_type: part.mime_type
    });
  }

  return {
    model: request.model,
    input,
    system_instruction:
      "Follow the supplied input instructions and return only JSON matching the provided response schema.",
    response_format: {
      type: "text" as const,
      mime_type: "application/json" as const,
      schema: request.responseSchema
    },
    generation_config: {
      thinking_level: "low" as const,
      temperature: 0.1,
      max_output_tokens: 2_048
    },
    store: false as const
  };
}

function createStableCameraRouteGeminiCall(
  providers: readonly ResolvedProviderProfile[],
  options: RetryAdapterOptions = {}
): CameraRouteGeminiCall {
  if (providers.length === 0) {
    throw new Error("At least one Gemini provider profile is required.");
  }

  const pool = new ProviderPool(providers);
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>(resolvePromise => {
      setTimeout(resolvePromise, ms);
    }));
  const now = options.now ?? (() => new Date());

  return async request => {
    let profile = pool.selectEligibleProfile();
    const exhaustedTransient = new Set<string>();
    const retriedTransient = new Set<string>();
    const retriedRateLimit = new Set<string>();

    while (profile) {
      try {
        const provider = createGeminiInteractionsProvider(
          profile.credential.authKey,
          {
            baseUrl: options.geminiBaseUrl,
            fetchFn: options.fetchFn
          }
        );

        const response = await provider(
          navigationInteractionRequest(request)
        );

        return response.text;
      }
      catch (error) {
        const failure = pool.handleFailure(
          profile.profile.id,
          error,
          { now: now() }
        );

        switch (failure.action) {
          case "FAILOVER_CREDENTIAL": {
            const excluded = new Set<string>([
              profile.profile.id,
              ...exhaustedTransient
            ]);
            const next = nextHealthyProfile(pool, providers, excluded);

            if (!next) {
              throw error;
            }

            profile = next;
            continue;
          }

          case "RETRY_ONCE_THEN_FAILOVER": {
            if (!retriedTransient.has(profile.profile.id)) {
              retriedTransient.add(profile.profile.id);
              await sleep(
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
              providers,
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
            const startedAt = now();
            const delay = computeBoundedBackoffMs({
              attempt: 1,
              retryAfterMs: failure.retryAfterMs,
              jitterRatio: 0
            });

            await sleep(delay);
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
            throw withErrorClass(error, "DAILY_QUOTA");

          case "REVIEW":
          default:
            throw withErrorClass(
              error,
              failure.classification.errorClass
            );
        }
      }
    }

    throw new Error("No eligible Gemini provider profile is available.");
  };
}


function createProductSemanticProvider(
  profile: ResolvedProviderProfile,
  options: GeminiInteractionsProviderOptions
): ProductCameraSemanticProvider {
  const provider = createGeminiInteractionsProvider(
    profile.credential.authKey,
    options
  );

  return {
    async analyze(
      request: ProductCameraSemanticRequest
    ): Promise<{ readonly text: string }> {
      const input: Array<
        | {
            readonly type: "text";
            readonly text: string;
          }
        | {
            readonly type: "image";
            readonly data: string;
            readonly mime_type: "image/png";
            readonly resolution: "high" | "ultra_high";
          }
      > = [];

      request.images.forEach(image => {
        input.push({
          type: "text",
          text: [
            "PRODUCT SCREENSHOT " + String(image.sequence),
            "SHOT_ID=" + image.shotId,
            "PAGE_ZONE=" + image.pageZone,
            "ROLE=" + image.role,
            "AUTHORITATIVE_HERO=" + String(image.isAuthoritativeHero),
            "RESOLUTION=" + image.resolution
          ].join(" ")
        });
        input.push({
          type: "image",
          data: image.bytes.toString("base64"),
          mime_type: "image/png",
          resolution: image.resolution
        });
      });

      const response = await provider({
        model: request.model,
        input,
        system_instruction: request.prompt,
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: request.schema
        },
        generation_config: {
          thinking_level: "medium",
          temperature: 0.1,
          max_output_tokens: 4_096
        },
        store: false
      });

      return {
        text: response.text
      };
    }
  };
}


export async function runCameraOnlyProductUrls(
  input: CameraOnlyProductRuntimeInput
): Promise<PipelinedProductRuntimeResult> {
  if (input.providers.length === 0) {
    throw new Error("At least one Gemini provider profile is required.");
  }

  const context = await input.browser.newContext({
    viewport: {
      width: 1440,
      height: 1200
    },
    serviceWorkers: "block"
  });

  try {
    const runtime = await runPipelinedProductRuntime({
      runId: input.runId,
      urls: input.urls,
      statePath: input.statePath,
      providers: input.providers,
      captureProduct: async captureInput =>
        runFreshPageCaptureWithRecovery(
          () => context.newPage(),
          page =>
            captureProductVisualPacket(
              page,
              {
                pageUrl: captureInput.pageUrl,
                sequence: captureInput.sequence,
                itemId: captureInput.itemId,
                outputDir: join(
                  input.captureRoot,
                  "products",
                  String(captureInput.sequence + 1).padStart(4, "0")
                )
              }
            )
        ),
      semanticProduct: async (packet, profile) =>
        interpretFrozenProductWithGemini(
          packet,
          createProductSemanticProvider(
            profile,
            {
              baseUrl: input.geminiBaseUrl,
              fetchFn: input.fetchFn
            }
          )
        ),
      options: {
        captureConcurrency: 1,
        semanticConcurrency: 1,
        queueCapacity: 2
      },
      decisionRoot: join(dirname(input.statePath), "v15-decisions"),
      requestRoot: join(dirname(input.statePath), "v15-requests"),
      resultRoot: join(dirname(input.statePath), "v15-results"),
      retentionPolicy: input.retentionPolicy
    });

    await exportCamera13WorkbookAtomic(
      input.outputPath,
      runtime.validations.map(item => item.validation)
    );

    return runtime;
  }
  finally {
    await context.close();
  }
}


export async function runCameraOnlyDiscoveryPipeline(
  input: CameraOnlyDiscoveryPipelineInput
): Promise<CameraOnlyDiscoveryPipelineResult> {
  if (input.providers.length === 0) {
    throw new Error("At least one Gemini provider profile is required.");
  }

  const routeCall = createStableCameraRouteGeminiCall(
    input.providers,
    {
      fetchFn: input.fetchFn,
      geminiBaseUrl: input.geminiBaseUrl
    }
  );

  const context = await input.browser.newContext({
    viewport: {
      width: 1440,
      height: 1200
    },
    serviceWorkers: "block"
  });

  let contextClosed = false;
  const closeReconnaissanceContext = async (): Promise<void> => {
    if (contextClosed) {
      return;
    }

    contextClosed = true;
    await context.close();
  };

  try {
    const page = await context.newPage();

    return await orchestrateCameraOnlyDiscovery(
      input.roots,
      {
        captureReconnaissance: rootUrl =>
          captureSiteReconnaissance(page, rootUrl),

        selectRoutes: packet =>
          selectCameraRoutes(packet, routeCall),

        discoverRoutes: routes =>
          discoverApprovedCameraRoutes(
            routes,
            input.listingDiscoverer
          ),

        runProducts: async urls => {
          await closeReconnaissanceContext();

          return runCameraOnlyProductUrls({
            runId: input.runId,
            urls,
            browser: input.browser,
            providers: input.providers,
            captureRoot: input.captureRoot,
            statePath: input.statePath,
            outputPath: input.outputPath,
            fetchFn: input.fetchFn,
            geminiBaseUrl: input.geminiBaseUrl,
            retentionPolicy: input.retentionPolicy
          });
        }
      }
    );
  }
  finally {
    await closeReconnaissanceContext();
  }
}
