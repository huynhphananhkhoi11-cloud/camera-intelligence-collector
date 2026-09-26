import {
  access,
  mkdir,
  readFile,
  rename,
  writeFile
} from "node:fs/promises";

import {
  basename,
  dirname,
  join,
  resolve
} from "node:path";

import type {
  Browser,
  Page
} from "playwright";

import {
  GeminiVisualExtractor,
  GeminiVisualExtractionContractError,
  type GeminiVisualProvider,
  type GeminiVisualProviderRequest,
  type GeminiVisualProviderResponse
} from "../ai/geminiVisualExtractor.js";

import {
  exportCamera13WorkbookAtomic
} from "../export/camera13Workbook.js";

import {
  captureAdaptiveVisualEvidence,
  type AdaptiveCaptureOptions,
  type AdaptiveCaptureResult,
  type CaptureManifest
} from "../vision/adaptiveCapture.js";

import type {
  DurableWorkbookSink,
  SemanticRequest
} from "../runtime/durableBatchRuntime.js";

import type {
  ResolvedProviderProfile
} from "../../v03/provider/providerProfile.js";

export interface GeminiInteractionsProviderOptions {
  readonly baseUrl?: string;
  readonly fetchFn?: typeof fetch;
}

export class GeminiInteractionHttpError extends Error {
  readonly status: number;
  readonly responseBody: string;
  readonly retryAfter: string | null;

  constructor(
    status: number,
    responseBody: string,
    retryAfter: string | null
  ) {
    super(
      "GEMINI_INTERACTION_HTTP_ERROR " +
      status +
      ": " +
      responseBody.slice(0, 500)
    );
    this.name = "GeminiInteractionHttpError";
    this.status = status;
    this.responseBody = responseBody;
    this.retryAfter = retryAfter;
  }
}

function providerOutputText(body: {
  readonly output_text?: string;
  readonly steps?: readonly {
    readonly type?: string;
    readonly content?: readonly {
      readonly type?: string;
      readonly text?: string;
    }[];
  }[];
}): string {
  if (typeof body.output_text === "string" && body.output_text.trim()) {
    return body.output_text.trim();
  }

  return (body.steps ?? [])
    .filter(step => step.type === "model_output")
    .flatMap(step => step.content ?? [])
    .filter(content => content.type === "text")
    .map(content => content.text ?? "")
    .join("")
    .trim();
}

export function createGeminiInteractionsProvider(
  apiKey: string,
  options: GeminiInteractionsProviderOptions = {}
): GeminiVisualProvider {
  const authKey = apiKey.trim();
  if (!authKey) {
    throw new Error("Gemini API key is empty.");
  }

  const baseUrl = (
    options.baseUrl ??
    "https://generativelanguage.googleapis.com/v1beta"
  ).replace(/\/+$/u, "");

  const fetchFn = options.fetchFn ?? fetch;

  return async (
    request: GeminiVisualProviderRequest
  ): Promise<GeminiVisualProviderResponse> => {
    const response = await fetchFn(
      baseUrl + "/interactions",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": authKey
        },
        body: JSON.stringify(request)
      }
    );

    if (!response.ok) {
      throw new GeminiInteractionHttpError(
        response.status,
        await response.text(),
        response.headers.get("retry-after")
      );
    }

    const body = await response.json() as {
      readonly status?: string;
      readonly model?: string;
      readonly output_text?: string;
      readonly steps?: readonly {
        readonly type?: string;
        readonly content?: readonly {
          readonly type?: string;
          readonly text?: string;
        }[];
      }[];
    };

    if (body.status && body.status !== "completed") {
      throw new GeminiVisualExtractionContractError(
        "GEMINI_VISUAL_INTERACTION_STATUS: " + body.status
      );
    }

    const text = providerOutputText(body);
    if (!text) {
      throw new GeminiVisualExtractionContractError(
        "GEMINI_VISUAL_EMPTY_OUTPUT"
      );
    }

    return {
      text,
      model: body.model
    };
  };
}

export function websiteForUrl(url: string): string {
  return new URL(url)
    .hostname
    .toLowerCase()
    .replace(/^www\./u, "");
}

interface BrowserLike {
  newContext(options?: {
    readonly viewport?: {
      readonly width: number;
      readonly height: number;
    };
    readonly serviceWorkers?: "block";
  }): Promise<{
    newPage(): Promise<Page>;
    close(): Promise<void>;
  }>;
}

export type CaptureRunner = (
  page: Page,
  options: AdaptiveCaptureOptions
) => Promise<AdaptiveCaptureResult>;

export interface MinimalSemanticRequestFactoryOptions {
  readonly browser: BrowserLike | Browser;
  readonly captureRoot: string;
  readonly capture?: CaptureRunner;
  readonly fetchFn?: typeof fetch;
  readonly geminiBaseUrl?: string;
}

interface DurableSemanticPayload {
  readonly schemaVersion: 1;
  readonly pageUrl: string;
  readonly finalUrl: string;
  readonly website: string;
  readonly screenshots: readonly {
    readonly role: "hero" | "viewport" | "interaction";
    readonly path: string;
  }[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(
  path: string,
  value: unknown
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temp = path + "." + process.pid + ".tmp";
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
  await rename(temp, path);
}

function assertCaptureManifest(value: unknown): asserts value is CaptureManifest {
  if (
    value === null ||
    typeof value !== "object" ||
    !Array.isArray((value as { shots?: unknown }).shots) ||
    typeof (value as { finalUrl?: unknown }).finalUrl !== "string"
  ) {
    throw new Error("Invalid V04 capture manifest checkpoint.");
  }
}

async function payloadFromManifest(
  pageUrl: string,
  manifestPath: string
): Promise<DurableSemanticPayload> {
  const manifestRaw = JSON.parse(
    await readFile(manifestPath, "utf8")
  ) as unknown;

  assertCaptureManifest(manifestRaw);

  const screenshots = manifestRaw.shots.map(shot => {
    if (
      (shot.role !== "hero" &&
        shot.role !== "viewport" &&
        shot.role !== "interaction") ||
      typeof shot.path !== "string" ||
      shot.path.length === 0
    ) {
      throw new Error("Capture manifest contains a non-durable screenshot entry.");
    }

    return {
      role: shot.role,
      path: shot.path
    };
  });

  return {
    schemaVersion: 1,
    pageUrl,
    finalUrl: manifestRaw.finalUrl,
    website: websiteForUrl(manifestRaw.finalUrl),
    screenshots
  };
}

async function readPayload(
  path: string
): Promise<DurableSemanticPayload> {
  const value = JSON.parse(await readFile(path, "utf8")) as Partial<DurableSemanticPayload>;

  if (
    value.schemaVersion !== 1 ||
    typeof value.pageUrl !== "string" ||
    typeof value.finalUrl !== "string" ||
    typeof value.website !== "string" ||
    !Array.isArray(value.screenshots)
  ) {
    throw new Error("Invalid V04 semantic request checkpoint.");
  }

  return value as DurableSemanticPayload;
}

async function screenshotInput(
  itemDir: string,
  payload: DurableSemanticPayload
): Promise<readonly {
  readonly role: "hero" | "viewport" | "interaction";
  readonly bytes: Buffer;
}[]> {
  return Promise.all(
    payload.screenshots.map(async screenshot => ({
      role: screenshot.role,
      bytes: await readFile(resolve(itemDir, screenshot.path))
    }))
  );
}

export function createMinimalSemanticRequestFactory(
  options: MinimalSemanticRequestFactoryOptions
): (
  input: {
    readonly index: number;
    readonly url: string;
  }
) => Promise<SemanticRequest> {
  const capture = options.capture ?? captureAdaptiveVisualEvidence;

  return async ({ index, url }) => {
    const itemDir = join(
      options.captureRoot,
      String(index + 1).padStart(4, "0")
    );

    const manifestPath = join(itemDir, "capture_manifest.json");
    const requestPayloadPath = join(itemDir, "semantic_request.json");

    let payload: DurableSemanticPayload;

    if (await fileExists(manifestPath)) {
      payload = await payloadFromManifest(url, manifestPath);

      if (await fileExists(requestPayloadPath)) {
        const persisted = await readPayload(requestPayloadPath);
        if (
          persisted.pageUrl !== url ||
          persisted.finalUrl !== payload.finalUrl
        ) {
          throw new Error("V04 semantic checkpoint does not match capture manifest.");
        }
        payload = persisted;
      } else {
        await writeJsonAtomic(requestPayloadPath, payload);
      }
    } else {
      const context = await options.browser.newContext({
        viewport: {
          width: 1440,
          height: 1200
        },
        serviceWorkers: "block"
      });

      try {
        const page = await context.newPage();
        const captured = await capture(
          page,
          {
            url,
            outputDir: itemDir
          }
        );

        if (!captured.manifestPath) {
          throw new Error("V04 capture did not create a durable manifest.");
        }

        payload = {
          schemaVersion: 1,
          pageUrl: url,
          finalUrl: captured.manifest.finalUrl,
          website: websiteForUrl(captured.manifest.finalUrl),
          screenshots: captured.screenshots.map((screenshot, screenshotIndex) => ({
            role: screenshot.role,
            path: basename(captured.imagePaths[screenshotIndex] ?? "")
          }))
        };

        if (payload.screenshots.some(item => item.path.length === 0)) {
          throw new Error("V04 capture did not persist every screenshot.");
        }

        await writeJsonAtomic(requestPayloadPath, payload);
      } finally {
        await context.close();
      }
    }

    const screenshots = await screenshotInput(itemDir, payload);

    return {
      authoritativeUrl: payload.finalUrl,
      captureManifestPath: manifestPath,
      requestPayloadPath,
      async execute(profile: ResolvedProviderProfile) {
        const extractor = new GeminiVisualExtractor({
          provider: createGeminiInteractionsProvider(
            profile.credential.authKey,
            {
              baseUrl: options.geminiBaseUrl,
              fetchFn: options.fetchFn
            }
          )
        });

        const result = await extractor.extract({
          pageUrl: payload.pageUrl,
          finalUrl: payload.finalUrl,
          website: payload.website,
          screenshots
        });

        return result.extraction;
      }
    };
  };
}

export function createCamera13WorkbookSink(
  outputPath: string
): DurableWorkbookSink {
  return {
    async replaceRows(rows) {
      await exportCamera13WorkbookAtomic(
        outputPath,
        rows.map(row => ({
          status: "VALIDATED" as const,
          row
        }))
      );
    }
  };
}
