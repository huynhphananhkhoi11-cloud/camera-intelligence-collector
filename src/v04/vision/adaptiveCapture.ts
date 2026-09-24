import {
  mkdir,
  rename,
  writeFile
} from "node:fs/promises";

import {
  join
} from "node:path";

import type {
  Page
} from "playwright";

import {
  exploreInteractionStates,
  DEFAULT_MAX_CHANGED_INTERACTION_STATES,
  DEFAULT_MAX_INTERACTION_CANDIDATES
} from "./interactionExplorer.js";

import {
  exploreScrollStates,
  DEFAULT_MAX_SCROLL_STATES,
  DEFAULT_STABLE_PASSES_REQUIRED
} from "./scrollExplorer.js";

import {
  captureVisualSnapshot,
  isDuplicateVisualState,
  type VisualSnapshot
} from "./visualStateFingerprint.js";


export type CaptureRole =
  | "hero"
  | "viewport"
  | "interaction";

export const DEFAULT_MAX_FINAL_SCREENSHOTS =
  6;

// V13.2 callers keep the six-shot default. V15 product capture may
// explicitly request a larger bounded packet without changing that default.
export const MAX_FINAL_SCREENSHOTS_HARD_LIMIT =
  10;

export const DEFAULT_CAPTURE_SETTLE_MS =
  40;


const TSX_PAGE_EVALUATE_NAME_SHIM =
  [
    "(() => {",
    "  if (typeof globalThis.__name !== 'function') {",
    "    var __name = globalThis.__name = function(target, value) {",
    "      try {",
    "        Object.defineProperty(target, 'name', { value, configurable: true });",
    "      } catch {}",
    "      return target;",
    "    };",
    "  }",
    "})()"
  ].join(
    "\n"
  );


async function installTsxPageEvaluateNameShim(
  page:
    Page
): Promise<void> {
  await page.addInitScript({
    content:
      TSX_PAGE_EVALUATE_NAME_SHIM
  });

  await page.evaluate(
    TSX_PAGE_EVALUATE_NAME_SHIM
  );
}


export interface AdaptiveScreenshot {
  readonly shotId:
    string;

  readonly role:
    CaptureRole;

  readonly bytes:
    Buffer;

  readonly fingerprint:
    VisualSnapshot["fingerprint"];
}


export interface CaptureManifestShot {
  readonly shotId:
    string;

  readonly role:
    CaptureRole;

  readonly imageHash:
    string;

  readonly scrollY:
    number;

  readonly documentHeight:
    number;

  readonly path:
    string |
    null;
}


export interface CaptureManifest {
  readonly schemaVersion:
    1;

  readonly url:
    string;

  readonly finalUrl:
    string;

  readonly captureTimestamp:
    string;

  readonly shots:
    readonly CaptureManifestShot[];
}


export interface AdaptiveCaptureResult {
  readonly screenshots:
    readonly AdaptiveScreenshot[];

  readonly manifest:
    CaptureManifest;

  readonly manifestPath:
    string |
    null;

  readonly imagePaths:
    readonly string[];
}


export interface AdaptiveCaptureOptions {
  readonly outputDir?:
    string;

  readonly url?:
    string;

  readonly navigationTimeoutMs?:
    number;

  readonly settleMs?:
    number;

  readonly maxScrollStates?:
    number;

  readonly stablePassesRequired?:
    number;

  readonly maxInteractionCandidates?:
    number;

  readonly maxChangedInteractionStates?:
    number;

  readonly maxFinalScreenshots?:
    number;
}


function boundedInteger(
  value:
    number |
    undefined,
  fallback:
    number,
  maximum:
    number
): number {
  if (
    value ===
      undefined ||
    !Number.isFinite(
      value
    )
  ) {
    return fallback;
  }

  return Math.max(
    1,
    Math.min(
      maximum,
      Math.floor(
        value
      )
    )
  );
}


function duplicateViewportPosition(
  candidate:
    VisualSnapshot,
  screenshots:
    readonly AdaptiveScreenshot[]
): boolean {
  return screenshots.some(
    screenshot =>
      screenshot.role ===
        "viewport" &&
      Math.abs(
        screenshot.fingerprint.scrollY -
        candidate.fingerprint.scrollY
      ) <=
        8 &&
      Math.abs(
        screenshot.fingerprint.documentHeight -
        candidate.fingerprint.documentHeight
      ) <=
        8
  );
}


export function finalizeCaptureStates(
  hero:
    VisualSnapshot,
  viewportStates:
    readonly VisualSnapshot[],
  interactionStates:
    readonly VisualSnapshot[],
  maximum =
    DEFAULT_MAX_FINAL_SCREENSHOTS
): AdaptiveScreenshot[] {
  const maxFinalScreenshots =
    boundedInteger(
      maximum,
      DEFAULT_MAX_FINAL_SCREENSHOTS,
      MAX_FINAL_SCREENSHOTS_HARD_LIMIT
    );

  const ordered:
    readonly {
      readonly role:
        CaptureRole;

      readonly state:
        VisualSnapshot;
    }[] =
      [
        {
          role:
            "hero",

          state:
            hero
        },
        ...viewportStates.map(
          state => ({
            role:
              "viewport" as const,

            state
          })
        ),
        ...interactionStates.map(
          state => ({
            role:
              "interaction" as const,

            state
          })
        )
      ];

  const screenshots:
    AdaptiveScreenshot[] =
      [];


  for (
    const item
    of ordered
  ) {
    if (
      screenshots.length >=
        maxFinalScreenshots
    ) {
      break;
    }

    if (
      isDuplicateVisualState(
        item.state.fingerprint,
        screenshots.map(
          screenshot =>
            screenshot.fingerprint
        )
      ) ||
      (
        item.role ===
          "viewport" &&
        duplicateViewportPosition(
          item.state,
          screenshots
        )
      )
    ) {
      continue;
    }

    const roleIndex =
      screenshots.filter(
        screenshot =>
          screenshot.role ===
          item.role
      ).length +
      1;

    screenshots.push({
      shotId:
        item.role +
        "-" +
        String(
          roleIndex
        ).padStart(
          2,
          "0"
        ),

      role:
        item.role,

      bytes:
        item.state.bytes,

      fingerprint:
        item.state.fingerprint
    });
  }


  return screenshots;
}


function escapeHtml(
  value:
    string
): string {
  return value
    .replaceAll(
      "&",
      "&amp;"
    )
    .replaceAll(
      "<",
      "&lt;"
    )
    .replaceAll(
      ">",
      "&gt;"
    )
    .replaceAll(
      '"',
      "&quot;"
    );
}


function captureAuditHtml(
  manifest:
    CaptureManifest
): string {
  const cards =
    manifest.shots
      .filter(
        shot =>
          shot.path !==
            null
      )
      .map(
        shot =>
          [
            "<figure>",
            "<figcaption><strong>" +
              escapeHtml(
                shot.shotId
              ) +
              "</strong> role=" +
              escapeHtml(
                shot.role
              ) +
              " scrollY=" +
              String(
                shot.scrollY
              ) +
              " documentHeight=" +
              String(
                shot.documentHeight
              ) +
              "</figcaption>",
            "<img loading=\"lazy\" src=\"" +
              escapeHtml(
                shot.path ??
                ""
              ) +
              "\" alt=\"" +
              escapeHtml(
                shot.shotId
              ) +
              "\">",
            "</figure>"
          ].join(
            ""
          )
      )
      .join(
        "\n"
      );

  return [
    "<!doctype html>",
    "<html><head><meta charset=\"utf-8\">",
    "<title>Capture Audit</title>",
    "<style>body{font-family:system-ui,sans-serif;margin:24px;background:#f6f7f9;color:#111}h1{margin-bottom:4px}.meta{margin-bottom:24px;color:#444}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(420px,1fr));gap:18px}figure{margin:0;background:white;border:1px solid #ddd;border-radius:10px;padding:12px}figcaption{font-size:13px;margin-bottom:8px}img{display:block;width:100%;height:auto;border:1px solid #eee}</style>",
    "</head><body>",
    "<h1>Capture Audit</h1>",
    "<div class=\"meta\">URL: " +
      escapeHtml(
        manifest.finalUrl
      ) +
      " · shots=" +
      String(
        manifest.shots.length
      ) +
      "</div>",
    "<main>",
    cards,
    "</main></body></html>"
  ].join(
    "\n"
  );
}


async function writeCaptureArtifacts(
  outputDir:
    string,
  screenshots:
    readonly AdaptiveScreenshot[],
  manifestBase:
    Omit<
      CaptureManifest,
      "shots"
    >
): Promise<
  {
    readonly manifest:
      CaptureManifest;

    readonly manifestPath:
      string;

    readonly imagePaths:
      readonly string[];
  }
> {
  await mkdir(
    outputDir,
    {
      recursive:
        true
    }
  );

  const imagePaths:
    string[] =
      [];

  const manifestShots:
    CaptureManifestShot[] =
      [];


  for (
    const screenshot
    of screenshots
  ) {
    const fileName =
      screenshot.shotId +
      ".png";

    const imagePath =
      join(
        outputDir,
        fileName
      );

    await writeFile(
      imagePath,
      screenshot.bytes
    );

    imagePaths.push(
      imagePath
    );

    manifestShots.push({
      shotId:
        screenshot.shotId,

      role:
        screenshot.role,

      imageHash:
        screenshot.fingerprint.imageHash,

      scrollY:
        screenshot.fingerprint.scrollY,

      documentHeight:
        screenshot.fingerprint.documentHeight,

      path:
        fileName
    });
  }

  const manifest:
    CaptureManifest = {
      ...manifestBase,
      shots:
        manifestShots
    };

  const manifestPath =
    join(
      outputDir,
      "capture_manifest.json"
    );

  const tempPath =
    manifestPath +
    ".tmp";

  await writeFile(
    tempPath,
    JSON.stringify(
      manifest,
      null,
      2
    ) +
    "\n",
    "utf8"
  );

  await rename(
    tempPath,
    manifestPath
  );

  await writeFile(
    join(
      outputDir,
      "capture-audit.html"
    ),
    captureAuditHtml(
      manifest
    ),
    "utf8"
  );

  return {
    manifest,
    manifestPath,
    imagePaths
  };
}


export async function captureAdaptiveVisualEvidence(
  page:
    Page,
  options:
    AdaptiveCaptureOptions =
      {}
): Promise<
  AdaptiveCaptureResult
> {
  const settleMs =
    Math.max(
      0,
      options.settleMs ??
      DEFAULT_CAPTURE_SETTLE_MS
    );

  const navigationTimeoutMs =
    Math.max(
      1_000,
      options.navigationTimeoutMs ??
      20_000
    );

  const maxScrollStates =
    boundedInteger(
      options.maxScrollStates,
      DEFAULT_MAX_SCROLL_STATES,
      DEFAULT_MAX_SCROLL_STATES
    );

  const stablePassesRequired =
    boundedInteger(
      options.stablePassesRequired,
      DEFAULT_STABLE_PASSES_REQUIRED,
      DEFAULT_STABLE_PASSES_REQUIRED
    );

  const maxInteractionCandidates =
    boundedInteger(
      options.maxInteractionCandidates,
      DEFAULT_MAX_INTERACTION_CANDIDATES,
      DEFAULT_MAX_INTERACTION_CANDIDATES
    );

  const maxChangedInteractionStates =
    boundedInteger(
      options.maxChangedInteractionStates,
      DEFAULT_MAX_CHANGED_INTERACTION_STATES,
      DEFAULT_MAX_CHANGED_INTERACTION_STATES
    );

  const maxFinalScreenshots =
    boundedInteger(
      options.maxFinalScreenshots,
      DEFAULT_MAX_FINAL_SCREENSHOTS,
      MAX_FINAL_SCREENSHOTS_HARD_LIMIT
    );

  const requestedUrl =
    options.url ??
    page.url();

  if (
    options.url
  ) {
    await page.goto(
      options.url,
      {
        waitUntil:
          "domcontentloaded",

        timeout:
          navigationTimeoutMs
      }
    );
  }

  await installTsxPageEvaluateNameShim(
    page
  );

  await page.evaluate(
    () => {
      window.scrollTo(
        0,
        0
      );
    }
  );

  if (
    settleMs >
      0
  ) {
    await page.waitForTimeout(
      settleMs
    );
  }

  const hero =
    await captureVisualSnapshot(
      page
    );

  const viewportStates =
    await exploreScrollStates(
      page,
      {
        maxScrollStates,
        stablePassesRequired,
        settleMs,
        priorFingerprints:
          [
            hero.fingerprint
          ]
      }
    );

  await page.evaluate(
    () => {
      window.scrollTo(
        0,
        0
      );
    }
  );

  if (
    settleMs >
      0
  ) {
    await page.waitForTimeout(
      settleMs
    );
  }

  const interactionStates =
    await exploreInteractionStates(
      page,
      {
        maxInteractionCandidates,
        maxChangedInteractionStates,
        settleMs,
        priorFingerprints:
          [
            hero.fingerprint,
            ...viewportStates.map(
              state =>
                state.fingerprint
            )
          ]
      }
    );

  const screenshots =
    finalizeCaptureStates(
      hero,
      viewportStates,
      interactionStates,
      maxFinalScreenshots
    );

  const captureTimestamp =
    new Date()
      .toISOString();

  const manifestBase = {
    schemaVersion:
      1 as const,

    url:
      requestedUrl,

    finalUrl:
      page.url(),

    captureTimestamp
  };

  if (
    options.outputDir
  ) {
    const written =
      await writeCaptureArtifacts(
        options.outputDir,
        screenshots,
        manifestBase
      );

    return {
      screenshots,
      manifest:
        written.manifest,
      manifestPath:
        written.manifestPath,
      imagePaths:
        written.imagePaths
    };
  }

  return {
    screenshots,

    manifest: {
      ...manifestBase,
      shots:
        screenshots.map(
          screenshot => ({
            shotId:
              screenshot.shotId,

            role:
              screenshot.role,

            imageHash:
              screenshot.fingerprint.imageHash,

            scrollY:
              screenshot.fingerprint.scrollY,

            documentHeight:
              screenshot.fingerprint.documentHeight,

            path:
              null
          })
        )
    },

    manifestPath:
      null,

    imagePaths:
      []
  };
}
