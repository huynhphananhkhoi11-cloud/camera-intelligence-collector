import {
  createHash
} from "node:crypto";

import type {
  Page
} from "playwright";


export interface VisualStateFingerprint {
  readonly imageHash:
    string;

  readonly scrollY:
    number;

  readonly documentHeight:
    number;
}


export interface VisualSnapshot {
  readonly bytes:
    Buffer;

  readonly fingerprint:
    VisualStateFingerprint;
}


interface VisualMetrics {
  readonly scrollY:
    number;

  readonly documentHeight:
    number;

  readonly viewportHeight:
    number;
}


function finiteNonnegative(
  value:
    number,
  fallback =
    0
): number {
  return Number.isFinite(
    value
  )
    ? Math.max(
        0,
        value
      )
    : fallback;
}


export function createVisualStateFingerprint(
  bytes:
    Buffer,
  scrollY:
    number,
  documentHeight:
    number
): VisualStateFingerprint {
  return {
    imageHash:
      createHash(
        "sha256"
      )
        .update(
          bytes
        )
        .digest(
          "hex"
        ),

    scrollY:
      finiteNonnegative(
        scrollY
      ),

    documentHeight:
      finiteNonnegative(
        documentHeight
      )
  };
}


export function isDuplicateVisualState(
  candidate:
    VisualStateFingerprint,
  prior:
    readonly VisualStateFingerprint[]
): boolean {
  return prior.some(
    existing =>
      existing.imageHash ===
      candidate.imageHash
  );
}


export async function readVisualMetrics(
  page:
    Page
): Promise<
  VisualMetrics
> {
  const metrics =
    await page.evaluate(
      () => ({
        scrollY:
          window.scrollY,

        documentHeight:
          Math.max(
            document.documentElement.scrollHeight,
            document.body?.scrollHeight ??
            0
          ),

        viewportHeight:
          Math.max(
            1,
            window.innerHeight
          )
      })
    );

  return {
    scrollY:
      finiteNonnegative(
        metrics.scrollY
      ),

    documentHeight:
      finiteNonnegative(
        metrics.documentHeight
      ),

    viewportHeight:
      Math.max(
        1,
        finiteNonnegative(
          metrics.viewportHeight,
          1
        )
      )
  };
}


export const DEFAULT_PLAYWRIGHT_SCREENSHOT_TIMEOUT_MS =
  1_500;


const immediateScreenshotPages =
  new WeakSet<
    Page
  >();


function isScreenshotTimeout(
  error:
    unknown
): boolean {
  const message =
    error !==
      null &&
    typeof error ===
      "object" &&
    "message" in
      error
      ? String(
          (
            error as {
              readonly message?:
                unknown;
            }
          ).message ??
          ""
        )
      : String(
          error ??
          ""
        );

  const normalized =
    message.toLowerCase();

  return (
    normalized.includes(
      "screenshot"
    ) &&
    normalized.includes(
      "timeout"
    )
  );
}


async function captureImmediateChromiumViewport(
  page:
    Page
): Promise<
  Buffer
> {
  const session =
    await page
      .context()
      .newCDPSession(
        page
      );

  try {
    const result =
      await session.send(
        "Page.captureScreenshot",
        {
          format:
            "png",

          fromSurface:
            true,

          captureBeyondViewport:
            false
        }
      );

    return Buffer.from(
      result.data,
      "base64"
    );
  }
  finally {
    try {
      await session.detach();
    }
    catch {
      // Best-effort cleanup after a capture.
    }
  }
}


export async function capturePageScreenshotBytes(
  page:
    Page
): Promise<
  Buffer
> {
  if (
    immediateScreenshotPages.has(
      page
    )
  ) {
    return captureImmediateChromiumViewport(
      page
    );
  }

  try {
    return await page.screenshot({
      type:
        "png",

      fullPage:
        false,

      animations:
        "disabled",

      caret:
        "hide",

      timeout:
        DEFAULT_PLAYWRIGHT_SCREENSHOT_TIMEOUT_MS
    });
  }
  catch (
    error
  ) {
    if (
      !isScreenshotTimeout(
        error
      )
    ) {
      throw error;
    }

    immediateScreenshotPages.add(
      page
    );

    console.warn(
      "[V04] SCREENSHOT_FALLBACK=CDP reason=playwright-timeout"
    );

    return captureImmediateChromiumViewport(
      page
    );
  }
}


export async function captureVisualSnapshot(
  page:
    Page
): Promise<
  VisualSnapshot
> {
  const bytes =
    await capturePageScreenshotBytes(
      page
    );

  const metrics =
    await readVisualMetrics(
      page
    );

  return {
    bytes,

    fingerprint:
      createVisualStateFingerprint(
        bytes,
        metrics.scrollY,
        metrics.documentHeight
      )
  };
}
