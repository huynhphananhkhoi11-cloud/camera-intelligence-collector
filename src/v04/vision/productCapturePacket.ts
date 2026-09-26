import {
  mkdir,
  rename,
  writeFile
} from "node:fs/promises";
import { join } from "node:path";

import type { Page } from "playwright";

import type {
  FrozenProductVisualPacket,
  ProductPageZone
} from "../contracts/v15PipelineContracts.js";
import {
  captureAdaptiveVisualEvidence,
  MAX_FINAL_SCREENSHOTS_HARD_LIMIT,
  type AdaptiveCaptureOptions,
  type AdaptiveScreenshot,
  type CaptureManifest,
  type CaptureManifestShot
} from "./adaptiveCapture.js";
import {
  captureVisualSnapshot,
  type VisualSnapshot
} from "./visualStateFingerprint.js";

export const DEFAULT_FINAL_HERO_SETTLE_MS = 250;

const MAX_FINAL_HERO_SETTLE_MS = 2_000;
const RECOVERY_NAVIGATION_TIMEOUT_MS = 40_000;
const RECOVERY_RESET_TIMEOUT_MS = 5_000;
const RECOVERY_SETTLE_MS = 250;


interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

interface NumberedProductScreenshot
  extends AdaptiveScreenshot {
  readonly sequence: number;
  readonly pageZone: ProductPageZone;
  readonly scrollY: number;
  readonly documentHeight: number;
  readonly dimensions: ImageDimensions;
  readonly width: number;
  readonly height: number;
  readonly contentHash: string;
  readonly path: string | null;
  readonly isAuthoritativeHero: boolean;
}

interface NumberedCaptureManifestShot
  extends CaptureManifestShot {
  readonly sequence: number;
  readonly pageZone: ProductPageZone;
  readonly dimensions: ImageDimensions;
  readonly width: number;
  readonly height: number;
  readonly contentHash: string;
  readonly isAuthoritativeHero: boolean;
}

interface NumberedCaptureManifest
  extends CaptureManifest {
  readonly shots: readonly NumberedCaptureManifestShot[];
}

export interface ProductCapturePacketInput {
  readonly pageUrl: string;
  readonly sequence: number;
  readonly itemId: string;
  readonly outputDir?: string;
  readonly finalHeroSettleMs?: number;
  readonly captureOptions?: Omit<
    AdaptiveCaptureOptions,
    "url" | "outputDir"
  >;
}

function boundedMilliseconds(
  value: number | undefined,
  fallback: number,
  maximum: number
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return fallback;
  }

  return Math.max(
    0,
    Math.min(
      maximum,
      Math.floor(value)
    )
  );
}

function boundedScreenshotCount(
  value: number | undefined
): number {
  if (
    value === undefined ||
    !Number.isFinite(value)
  ) {
    return MAX_FINAL_SCREENSHOTS_HARD_LIMIT;
  }

  return Math.max(
    1,
    Math.min(
      MAX_FINAL_SCREENSHOTS_HARD_LIMIT,
      Math.floor(value)
    )
  );
}

function readImageDimensions(
  bytes: Buffer
): ImageDimensions {
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20)
    };
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8
  ) {
    let offset = 2;

    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = bytes[offset + 1];
      offset += 2;

      if (
        marker === 0xd8 ||
        marker === 0xd9 ||
        marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7)
      ) {
        continue;
      }

      if (offset + 2 > bytes.length) {
        break;
      }

      const segmentLength =
        bytes.readUInt16BE(offset);

      if (
        segmentLength < 2 ||
        offset + segmentLength > bytes.length
      ) {
        break;
      }

      if (
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3 ||
        marker === 0xc5 ||
        marker === 0xc6 ||
        marker === 0xc7 ||
        marker === 0xc9 ||
        marker === 0xca ||
        marker === 0xcb ||
        marker === 0xcd ||
        marker === 0xce ||
        marker === 0xcf
      ) {
        return {
          width:
            bytes.readUInt16BE(offset + 5),
          height:
            bytes.readUInt16BE(offset + 3)
        };
      }

      offset += segmentLength;
    }
  }

  return {
    width: 0,
    height: 0
  };
}

function pageZoneFor(
  scrollY: number,
  documentHeight: number
): Exclude<ProductPageZone, "HERO"> {
  if (documentHeight <= 0) {
    return "UPPER";
  }

  const ratio =
    Math.max(0, scrollY) /
    documentHeight;

  if (ratio < 0.2) {
    return "UPPER";
  }

  if (ratio < 0.4) {
    return "MIDDLE";
  }

  if (ratio < 0.6) {
    return "LOWER";
  }

  if (ratio < 0.75) {
    return "TAIL";
  }

  return "FOOTER";
}

function shotIdFor(
  sequence: number,
  pageZone: ProductPageZone
): string {
  const prefix =
    String(sequence).padStart(2, "0");

  if (pageZone === "HERO") {
    return `${prefix}-hero-final`;
  }

  return `${prefix}-${pageZone.toLowerCase()}`;
}

function numberedScreenshot(
  sequence: number,
  role: AdaptiveScreenshot["role"],
  pageZone: ProductPageZone,
  bytes: Buffer,
  fingerprint: AdaptiveScreenshot["fingerprint"],
  isAuthoritativeHero: boolean,
  path: string | null = null
): NumberedProductScreenshot {
  const dimensions =
    readImageDimensions(bytes);

  return {
    sequence,
    shotId:
      shotIdFor(
        sequence,
        pageZone
      ),
    role,
    bytes:
      Buffer.from(bytes),
    fingerprint: {
      imageHash: fingerprint.imageHash,
      scrollY: fingerprint.scrollY,
      documentHeight: fingerprint.documentHeight
    },
    pageZone,
    scrollY: fingerprint.scrollY,
    documentHeight: fingerprint.documentHeight,
    dimensions,
    width: dimensions.width,
    height: dimensions.height,
    contentHash: fingerprint.imageHash,
    path,
    isAuthoritativeHero
  };
}

function finalizeProductScreenshots(
  finalHero: VisualSnapshot,
  broadScreenshots: readonly AdaptiveScreenshot[],
  maximum: number
): NumberedProductScreenshot[] {
  const result: NumberedProductScreenshot[] = [];
  const imageHashes = new Set<string>();

  const final =
    numberedScreenshot(
      1,
      "hero",
      "HERO",
      finalHero.bytes,
      finalHero.fingerprint,
      true
    );

  result.push(final);
  imageHashes.add(final.contentHash);

  const orderedBroad =
    broadScreenshots
      .map((screenshot, index) => ({
        screenshot,
        index
      }))
      .filter(
        item =>
          item.screenshot.role !== "hero"
      )
      .sort(
        (left, right) =>
          left.screenshot.fingerprint.scrollY -
            right.screenshot.fingerprint.scrollY ||
          left.index - right.index
      );

  for (const { screenshot } of orderedBroad) {
    if (result.length >= maximum) {
      break;
    }

    if (
      imageHashes.has(
        screenshot.fingerprint.imageHash
      )
    ) {
      continue;
    }

    imageHashes.add(
      screenshot.fingerprint.imageHash
    );

    const sequence = result.length + 1;
    const pageZone =
      pageZoneFor(
        screenshot.fingerprint.scrollY,
        screenshot.fingerprint.documentHeight
      );

    result.push(
      numberedScreenshot(
        sequence,
        screenshot.role,
        pageZone,
        screenshot.bytes,
        screenshot.fingerprint,
        false
      )
    );
  }

  return result;
}

function withPersistencePaths(
  screenshots: readonly NumberedProductScreenshot[],
  persisted: boolean
): NumberedProductScreenshot[] {
  return screenshots.map(
    screenshot => ({
      ...screenshot,
      bytes:
        Buffer.from(screenshot.bytes),
      fingerprint: {
        ...screenshot.fingerprint
      },
      dimensions: {
        ...screenshot.dimensions
      },
      width: screenshot.width,
      height: screenshot.height,
      path:
        persisted
          ? `${screenshot.shotId}.png`
          : null
    })
  );
}

function websiteFrom(
  finalUrl: string,
  pageUrl: string
): string {
  for (const value of [finalUrl, pageUrl]) {
    try {
      return new URL(value).hostname;
    } catch {
      // Transport metadata only; try the next authoritative URL.
    }
  }

  return "";
}

function manifestFor(
  pageUrl: string,
  finalUrl: string,
  captureTimestamp: string,
  screenshots: readonly NumberedProductScreenshot[]
): NumberedCaptureManifest {
  return {
    schemaVersion: 1,
    url: pageUrl,
    finalUrl,
    captureTimestamp,
    shots:
      screenshots.map(
        (screenshot): NumberedCaptureManifestShot => ({
          sequence: screenshot.sequence,
          shotId: screenshot.shotId,
          role: screenshot.role,
          pageZone: screenshot.pageZone,
          imageHash: screenshot.fingerprint.imageHash,
          contentHash: screenshot.contentHash,
          scrollY: screenshot.scrollY,
          documentHeight: screenshot.documentHeight,
          dimensions: {
            ...screenshot.dimensions
          },
          width: screenshot.width,
          height: screenshot.height,
          path: screenshot.path,
          isAuthoritativeHero:
            screenshot.isAuthoritativeHero
        })
      )
  };
}

async function atomicWrite(
  path: string,
  bytes: Buffer | string
): Promise<void> {
  const temporary = `${path}.tmp`;

  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

async function persistFinalPacket(
  outputDir: string,
  pageUrl: string,
  finalUrl: string,
  captureTimestamp: string,
  screenshots: readonly NumberedProductScreenshot[]
): Promise<{
  readonly screenshots: readonly NumberedProductScreenshot[];
  readonly manifest: NumberedCaptureManifest;
  readonly manifestPath: string;
  readonly imagePaths: readonly string[];
}> {
  await mkdir(
    outputDir,
    { recursive: true }
  );

  const persistedScreenshots =
    withPersistencePaths(
      screenshots,
      true
    );
  const imagePaths: string[] = [];

  for (const screenshot of persistedScreenshots) {
    const imagePath =
      join(
        outputDir,
        `${screenshot.shotId}.png`
      );

    await atomicWrite(
      imagePath,
      screenshot.bytes
    );

    imagePaths.push(imagePath);
  }

  const manifest =
    manifestFor(
      pageUrl,
      finalUrl,
      captureTimestamp,
      persistedScreenshots
    );

  const manifestPath =
    join(
      outputDir,
      "capture_manifest.json"
    );

  await atomicWrite(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`
  );

  return {
    screenshots: persistedScreenshots,
    manifest,
    manifestPath,
    imagePaths
  };
}

function freezeScreenshot(
  screenshot: NumberedProductScreenshot
): NumberedProductScreenshot {
  return Object.freeze({
    sequence: screenshot.sequence,
    shotId: screenshot.shotId,
    role: screenshot.role,
    bytes: Buffer.from(screenshot.bytes),
    fingerprint:
      Object.freeze({
        imageHash: screenshot.fingerprint.imageHash,
        scrollY: screenshot.fingerprint.scrollY,
        documentHeight: screenshot.fingerprint.documentHeight
      }),
    pageZone: screenshot.pageZone,
    scrollY: screenshot.scrollY,
    documentHeight: screenshot.documentHeight,
    dimensions:
      Object.freeze({
        width: screenshot.dimensions.width,
        height: screenshot.dimensions.height
      }),
    width: screenshot.width,
    height: screenshot.height,
    contentHash: screenshot.contentHash,
    path: screenshot.path,
    isAuthoritativeHero:
      screenshot.isAuthoritativeHero
  });
}

function freezeManifest(
  manifest: NumberedCaptureManifest
): NumberedCaptureManifest {
  return Object.freeze({
    schemaVersion: 1,
    url: manifest.url,
    finalUrl: manifest.finalUrl,
    captureTimestamp: manifest.captureTimestamp,
    shots:
      Object.freeze(
        manifest.shots.map(
          shot =>
            Object.freeze({
              sequence: shot.sequence,
              shotId: shot.shotId,
              role: shot.role,
              pageZone: shot.pageZone,
              imageHash: shot.imageHash,
              contentHash: shot.contentHash,
              width: shot.width,
              height: shot.height,
              scrollY: shot.scrollY,
              documentHeight: shot.documentHeight,
              dimensions:
                Object.freeze({
                  width: shot.dimensions.width,
                  height: shot.dimensions.height
                }),
              path: shot.path,
              isAuthoritativeHero:
                shot.isAuthoritativeHero
            })
        )
      )
  });
}

function errorMessage(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

export function isRecoverableProductCaptureNavigationError(
  error: unknown
): boolean {
  const message =
    errorMessage(
      error
    ).toLowerCase();

  return (
    (
      message.includes(
        "execution context was destroyed"
      ) &&
      message.includes(
        "navigation"
      )
    ) ||
    (
      message.includes(
        "page.goto"
      ) &&
      message.includes(
        "timeout"
      )
    ) ||
    message.includes(
      "frame was detached"
    )
  );
}

async function resetPageForCaptureRetry(
  page: Page
): Promise<void> {
  await page.goto(
    "about:blank",
    {
      waitUntil: "commit",
      timeout:
        RECOVERY_RESET_TIMEOUT_MS
    }
  ).catch(
    () =>
      undefined
  );

  await page.waitForTimeout(
    RECOVERY_SETTLE_MS
  );
}

function captureOptionsForRetry(
  input: ProductCapturePacketInput
): ProductCapturePacketInput {
  const configured =
    input.captureOptions?.navigationTimeoutMs ??
    0;

  return {
    ...input,
    captureOptions: {
      ...input.captureOptions,
      navigationTimeoutMs:
        Math.max(
          configured,
          RECOVERY_NAVIGATION_TIMEOUT_MS
        )
    }
  };
}

async function captureProductVisualPacketAttempt(
  page: Page,
  input: ProductCapturePacketInput
): Promise<FrozenProductVisualPacket> {
  const maximumScreenshots =
    boundedScreenshotCount(
      input.captureOptions?.maxFinalScreenshots
    );

  const broadCapture =
    await captureAdaptiveVisualEvidence(
      page,
      {
        ...input.captureOptions,
        maxFinalScreenshots: maximumScreenshots,
        url: input.pageUrl,
        outputDir: undefined
      }
    );

  await page.evaluate(
    () => {
      window.scrollTo(0, 0);
    }
  );

  const finalHeroSettleMs =
    boundedMilliseconds(
      input.finalHeroSettleMs,
      DEFAULT_FINAL_HERO_SETTLE_MS,
      MAX_FINAL_HERO_SETTLE_MS
    );

  if (finalHeroSettleMs > 0) {
    await page.waitForTimeout(finalHeroSettleMs);
  }

  const finalHero =
    await captureVisualSnapshot(
      page
    );

  const screenshots =
    finalizeProductScreenshots(
      finalHero,
      broadCapture.screenshots,
      maximumScreenshots
    );

  const finalUrl = page.url();
  const captureTimestamp =
    new Date().toISOString();

  const persisted =
    input.outputDir
      ? await persistFinalPacket(
          input.outputDir,
          input.pageUrl,
          finalUrl,
          captureTimestamp,
          screenshots
        )
      : {
          screenshots:
            withPersistencePaths(
              screenshots,
              false
            ),
          manifest:
            manifestFor(
              input.pageUrl,
              finalUrl,
              captureTimestamp,
              withPersistencePaths(
                screenshots,
                false
              )
            ),
          manifestPath: null,
          imagePaths: [] as readonly string[]
        };

  const frozenScreenshots =
    Object.freeze(
      persisted.screenshots.map(
        freezeScreenshot
      )
    );
  const frozenManifest =
    freezeManifest(persisted.manifest);
  const frozenImagePaths =
    Object.freeze([
      ...persisted.imagePaths
    ]);

  return Object.freeze({
    itemId: input.itemId,
    sequence: input.sequence,
    website:
      websiteFrom(
        finalUrl,
        input.pageUrl
      ),
    pageUrl: input.pageUrl,
    finalUrl,
    screenshots: frozenScreenshots,
    manifest: frozenManifest,
    manifestPath: persisted.manifestPath,
    imagePaths: frozenImagePaths
  });
}

export async function captureProductVisualPacket(
  page: Page,
  input: ProductCapturePacketInput
): Promise<FrozenProductVisualPacket> {
  try {
    return await captureProductVisualPacketAttempt(
      page,
      input
    );
  }
  catch (error) {
    if (
      !isRecoverableProductCaptureNavigationError(
        error
      )
    ) {
      throw error;
    }

    await resetPageForCaptureRetry(
      page
    );

    return captureProductVisualPacketAttempt(
      page,
      captureOptionsForRetry(
        input
      )
    );
  }
}
