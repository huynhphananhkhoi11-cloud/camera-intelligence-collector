#!/usr/bin/env node

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
  join,
  resolve
} from "node:path";
import { pathToFileURL } from "node:url";

import { Command } from "commander";
import { chromium, type Browser } from "playwright";

import {
  Gemini36VisualExtractor,
  type Gemini36VisualExtractionResult
} from "../ai/gemini36VisualExtractor.js";
import type {
  VisualShot
} from "../ai/visualExtractionSchema.js";

import {
  deterministicSmartPreflight
} from "../agent/smartPreflight.js";

import {
  exportSemantic13WorkbookAtomic
} from "../export/semantic13Workbook.js";

import type {
  SemanticDecisionValidationResult
} from "../ai/semanticDecisionSchema.js";

import {
  defaultProviderStorePath,
  loadProviderProfiles
} from "../provider/localProfileStore.js";
import {
  ProviderPool
} from "../provider/providerPool.js";
import {
  toResolvedProviderProfile,
  type ResolvedProviderProfile
} from "../provider/providerProfile.js";
import {
  computeBoundedBackoffMs
} from "../provider/backoff.js";

import {
  AtomicRunStateStore
} from "../state/atomicRunStateStore.js";
import {
  createRunState,
  transitionRunItem,
  type RunState
} from "../state/runState.js";
import {
  planResumeForItem
} from "../state/resumePlanner.js";


import {
  captureAdaptiveVisualEvidence,
  type AdaptiveCaptureResult,
  type CaptureManifest
} from "../vision/adaptiveCapture.js";


type ReportStatus =
  | "SKIPPED_NON_CAMERA"
  | "VALIDATED"
  | "REVIEW"
  | "ERROR";


interface CandidateUrl {
  readonly originalIndex: number;
  readonly url: string;
}


interface ReportItem {
  readonly index: number;
  readonly url: string;
  readonly status: ReportStatus;
  readonly reason?: string;
  readonly finalUrl?: string;
  readonly captureManifestPath?: string;
  readonly latencyMs?: number;
  readonly error?: string;
}


function makeRunId(): string {
  return (
    "v3-" +
    new Date()
      .toISOString()
      .replace(/[:.]/gu, "-")
  );
}


function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


function redactProviderDiagnostic(
  value:
    string
): string {

  return value
    .replace(
      /AIza[0-9A-Za-z_-]{20,}/gu,
      "[REDACTED_GOOGLE_KEY]"
    )
    .replace(
      /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/gu,
      "[REDACTED_API_KEY]"
    )
    .slice(
      0,
      4_000
    );
}


function sha256(value: string): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}


function parseUrls(raw: string): string[] {
  return raw
    .split(/\r?\n/gu)
    .map(line => line.trim())
    .filter(
      line =>
        line.length > 0 &&
        !line.startsWith("#")
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
  await mkdir(dirname(filePath), {
    recursive: true
  });

  const tempPath =
    filePath +
    "." +
    process.pid +
    ".tmp";

  await writeFile(
    tempPath,
    JSON.stringify(value, null, 2) + "\n",
    "utf8"
  );

  await rm(filePath, {
    force: true
  });

  await rename(
    tempPath,
    filePath
  );
}


async function readJson<T>(
  filePath: string
): Promise<T> {
  return JSON.parse(
    await readFile(filePath, "utf8")
  ) as T;
}


function domainFromUrl(value: string): string {
  return new URL(value)
    .hostname
    .replace(/^www\./u, "");
}


function wait(ms: number): Promise<void> {
  return new Promise(resolvePromise => {
    setTimeout(resolvePromise, ms);
  });
}


async function loadProfiles():
Promise<readonly ResolvedProviderProfile[]> {

  const localStore =
    defaultProviderStorePath();

  if (await exists(localStore)) {
    const profiles =
      await loadProviderProfiles(localStore);

    if (profiles.length === 0) {
      throw new Error(
        "Provider profile store contains no profiles."
      );
    }

    return profiles;
  }

  const apiKey =
    (
      process.env.GEMINI_AUTH_KEY ??
      process.env.GEMINI_API_KEY ??
      ""
    ).trim();

  if (!apiKey) {
    throw new Error(
      "No Gemini provider is configured. " +
      "Run npm.cmd run provider-setup or set GEMINI_AUTH_KEY/GEMINI_API_KEY."
    );
  }

  return [
    toResolvedProviderProfile({
      id: "environment-default",
      label: "ENVIRONMENT",
      projectId:
        (
          process.env.GEMINI_PROJECT_ID ??
          "environment-default"
        ).trim(),
      authKey: apiKey
    })
  ];
}


async function loadCapture(
  manifestPath: string
): Promise<AdaptiveCaptureResult> {

  const manifest =
    await readJson<CaptureManifest>(
      manifestPath
    );

  if (
    manifest.schemaVersion !== 1 ||
    !Array.isArray(manifest.shots)
  ) {
    throw new Error(
      "Unsupported capture manifest."
    );
  }

  const root =
    dirname(manifestPath);

  return {
    manifest,
    manifestPath,
    imagePaths:
      manifest.shots.map(
        shot =>
          join(root, shot.path)
      )
  };
}


async function buildShots(
  capture: AdaptiveCaptureResult
): Promise<VisualShot[]> {

  if (
    capture.manifest.shots.length !==
    capture.imagePaths.length
  ) {
    throw new Error(
      "Capture manifest/image count mismatch."
    );
  }

  return Promise.all(
    capture.manifest.shots.map(
      async (shot, index) => {

        const imagePath =
          capture.imagePaths[index];

        if (!imagePath) {
          throw new Error(
            "Missing image for shot " +
            shot.shotId
          );
        }

        const bytes =
          await readFile(imagePath);

        return {
          shotId: shot.shotId,
          mimeType: "image/png" as const,
          base64:
            bytes.toString("base64"),
          resolution:
            shot.resolution,
          sectionLabel:
            shot.sectionLabel
        };
      }
    )
  );
}


function validateResult(
  extraction:
    Gemini36VisualExtractionResult,
  _capture:
    AdaptiveCaptureResult
): SemanticDecisionValidationResult {
  return extraction.decision;
}


function telemetryUsage(
  result: Gemini36VisualExtractionResult
): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} {
  const usage: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  } = {};

  if (result.telemetry.inputTokens !== null) {
    usage.inputTokens =
      result.telemetry.inputTokens;
  }

  if (result.telemetry.outputTokens !== null) {
    usage.outputTokens =
      result.telemetry.outputTokens;
  }

  if (result.telemetry.totalTokens !== null) {
    usage.totalTokens =
      result.telemetry.totalTokens;
  }

  return usage;
}


function sameUrls(
  left: readonly string[],
  right: readonly string[]
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (value, index) =>
        value === right[index]
    )
  );
}


export async function runSmartBatchV2DurableCli(
  argv: readonly string[] =
    process.argv
): Promise<void> {

  const program =
    new Command();

  program
    .name(
      "camintel-smart-batch-v2"
    )
    .description(
      "Durable V3 Vision-First batch with provider pool and checkpoint/resume."
    )
    .argument(
      "<input-file>",
      "Text file containing one URL per line"
    )
    .requiredOption(
      "--output <xlsx>",
      "Output XLSX file"
    )
    .option(
      "--capture-root <dir>",
      "Local Vision-First spool root",
      ".camintel/v3-runs"
    )
    .option(
      "--run-id <id>",
      "Optional deterministic run id"
    )
    .option(
      "--resume <run-state>",
      "Resume from an existing run-state JSON"
    )
    .option(
      "--headless",
      "Hide Chromium",
      false
    )
    .action(
      async (
        inputFile: string,
        options: {
          readonly output: string;
          readonly captureRoot: string;
          readonly runId?: string;
          readonly resume?: string;
          readonly headless: boolean;
        }
      ) => {

        const urls =
          parseUrls(
            await readFile(
              inputFile,
              "utf8"
            )
          );

        if (urls.length === 0) {
          throw new Error(
            "Input file contains no URLs."
          );
        }

        const skipped:
          ReportItem[] = [];

        const candidates:
          CandidateUrl[] = [];

        urls.forEach(
          (url, originalIndex) => {
            const preflight =
              deterministicSmartPreflight(
                url
              );

            if (preflight) {
              skipped.push({
                index: originalIndex,
                url,
                status:
                  "SKIPPED_NON_CAMERA",
                reason:
                  preflight.reason ??
                  undefined
              });

              return;
            }

            candidates.push({
              originalIndex,
              url
            });
          }
        );

        const cameraUrls =
          candidates.map(
            candidate =>
              candidate.url
          );

        const inputHash =
          sha256(
            cameraUrls.join("\n")
          );

        let state:
          RunState;

        let store:
          AtomicRunStateStore;

        let runId:
          string;

        let runRoot:
          string;

        let statePath:
          string;

        if (options.resume) {
          statePath =
            resolve(options.resume);

          store =
            new AtomicRunStateStore(
              statePath
            );

          state =
            await store.load();

          runId =
            state.runId;

          runRoot =
            dirname(statePath);

          if (
            state.inputHash !== inputHash ||
            !sameUrls(
              state.urls,
              cameraUrls
            )
          ) {
            throw new Error(
              "Resume input does not match the persisted run state."
            );
          }
        }
        else {
          runId =
            options.runId ??
            makeRunId();

          runRoot =
            resolve(
              options.captureRoot,
              runId
            );

          statePath =
            join(
              runRoot,
              "vision-first.run-state.json"
            );

          if (await exists(statePath)) {
            throw new Error(
              "Run state already exists. Use --resume " +
              statePath
            );
          }

          state =
            createRunState({
              runId,
              inputHash,
              urls: cameraUrls
            });

          store =
            new AtomicRunStateStore(
              statePath
            );

          await store.save(state);
        }

        await mkdir(
          runRoot,
          {
            recursive: true
          }
        );

        let browser:
          Browser |
          null = null;

        let providerPool:
          ProviderPool |
          null = null;

        const validations =
          new Map<
            number,
            SemanticDecisionValidationResult
          >();

        const reportItems:
          ReportItem[] =
            [...skipped];

        let queuePaused =
          false;


        async function getBrowser():
        Promise<Browser> {
          if (!browser) {
            browser =
              await chromium.launch({
                headless:
                  options.headless
              });
          }

          return browser;
        }


        async function getProviderPool():
        Promise<ProviderPool> {
          if (!providerPool) {
            providerPool =
              new ProviderPool(
                await loadProfiles()
              );
          }

          return providerPool;
        }


        async function extractWithProvider(
          stateIndex: number,
          capture:
            AdaptiveCaptureResult
        ): Promise<{
          readonly result:
            Gemini36VisualExtractionResult |
            null;
          readonly pauseQueue:
            boolean;
        }> {

          const pool =
            await getProviderPool();

          const selected =
            pool.selectEligibleProfile();

          if (!selected) {
            throw new Error(
              "No eligible Gemini provider profile is available."
            );
          }

          let profile:
            ResolvedProviderProfile =
              selected;

          let transientRetryCount =
            0;

          let rateRetryCount =
            0;

          const shots =
            await buildShots(
              capture
            );

          while (true) {

            const current =
              state.items[stateIndex];

            if (!current) {
              throw new Error(
                "Missing run-state item."
              );
            }

            state =
              transitionRunItem(
                state,
                stateIndex,
                "AI_IN_FLIGHT",
                {
                  providerProfileId:
                    profile.profile.id,

                  attempts:
                    current.attempts +
                    1,

                  errorClass:
                    null
                }
              );

            await store.save(state);

            const extractor =
              new Gemini36VisualExtractor({
                apiKey:
                  profile
                    .credential
                    .authKey
              });

            try {
              return {
                result:
                  await extractor.extract({
                    pageUrl:
                      capture.manifest.url,

                    finalUrl:
                      capture.manifest.finalUrl,

                    shots
                  }),

                pauseQueue:
                  false
              };
            }
            catch (error) {

              const decision =
                pool.handleFailure(
                  profile.profile.id,
                  error
                );

              const safeProviderMessage =
                redactProviderDiagnostic(
                  errorMessage(
                    error
                  )
                );

              const providerDiagnosticPath =
                join(
                  dirname(
                    capture.manifestPath
                  ),
                  "provider-error.json"
                );

              const providerDiagnostic = {
                timestamp:
                  new Date().toISOString(),

                profileId:
                  profile.profile.id,

                errorName:
                  error instanceof Error
                    ? error.name
                    : typeof error,

                message:
                  safeProviderMessage,

                classification:
                  decision.classification,

                action:
                  decision.action,

                retryAfterMs:
                  decision.retryAfterMs
              };

              await writeJsonAtomic(
                providerDiagnosticPath,
                providerDiagnostic
              );

              console.error(
                "[PROVIDER_DIAGNOSTIC] " +
                JSON.stringify(
                  providerDiagnostic
                )
              );

              if (
                decision.action ===
                  "FAILOVER_CREDENTIAL" &&
                decision.nextProfileId
              ) {
                const next =
                  pool.getProfile(
                    decision.nextProfileId
                  );

                if (next) {
                  profile = next;
                  continue;
                }
              }

              if (
                decision.action ===
                "RETRY_ONCE_THEN_FAILOVER"
              ) {
                if (
                  transientRetryCount <
                  1
                ) {
                  transientRetryCount += 1;

                  await wait(
                    computeBoundedBackoffMs({
                      attempt:
                        transientRetryCount,

                      retryAfterMs:
                        decision.retryAfterMs
                    })
                  );

                  continue;
                }

                if (
                  decision.nextProfileId
                ) {
                  const next =
                    pool.getProfile(
                      decision.nextProfileId
                    );

                  if (next) {
                    profile = next;
                    transientRetryCount = 0;
                    continue;
                  }
                }
              }

              if (
                decision.action ===
                  "BACKOFF_SAME_PROJECT" &&
                rateRetryCount <
                  1
              ) {
                rateRetryCount += 1;

                const delay =
                  computeBoundedBackoffMs({
                    attempt:
                      rateRetryCount,

                    retryAfterMs:
                      decision.retryAfterMs
                  });

                await wait(delay);

                pool.clearCooldowns(
                  new Date()
                );

                continue;
              }

              state =
                transitionRunItem(
                  state,
                  stateIndex,
                  "REVIEW",
                  {
                    providerProfileId:
                      profile.profile.id,

                    errorClass:
                      decision
                        .classification
                        .errorClass
                  }
                );

              await store.save(state);

              return {
                result:
                  null,

                pauseQueue:
                  decision.action ===
                    "PAUSE_AI_QUEUE" ||
                  decision.action ===
                    "BACKOFF_SAME_PROJECT"
              };
            }
          }
        }


        try {
          for (
            let stateIndex = 0;
            stateIndex < state.items.length;
            stateIndex += 1
          ) {

            if (queuePaused) {
              break;
            }

            const candidate =
              candidates[stateIndex];

            if (!candidate) {
              throw new Error(
                "Candidate/run-state index mismatch."
              );
            }

            try {
              let work =
                planResumeForItem(
                  state.items[
                    stateIndex
                  ]!
                );

              if (
                work.action ===
                "CAPTURE"
              ) {
                const liveBrowser =
                  await getBrowser();

                const context =
                  await liveBrowser
                    .newContext({
                      viewport: {
                        width: 1440,
                        height: 1200
                      },
                      locale: "vi-VN"
                    });

                try {
                  const page =
                    await context
                      .newPage();

                  const itemDir =
                    join(
                      runRoot,
                      String(
                        stateIndex + 1
                      ).padStart(
                        4,
                        "0"
                      )
                    );

                  const capture =
                    await captureAdaptiveVisualEvidence(
                      page,
                      {
                        outputDir:
                          itemDir,

                        url:
                          candidate.url,

                        maxShots:
                          6
                      }
                    );

                  const requestPath =
                    join(
                      itemDir,
                      "request.json"
                    );

                  await writeJsonAtomic(
                    requestPath,
                    {
                      pageUrl:
                        candidate.url,

                      finalUrl:
                        capture
                          .manifest
                          .finalUrl,

                      shots:
                        capture
                          .manifest
                          .shots
                          .map(
                            shot => ({
                              shotId:
                                shot.shotId,
                              resolution:
                                shot.resolution,
                              sectionLabel:
                                shot.sectionLabel,
                              path:
                                shot.path
                            })
                          )
                    }
                  );

                  state =
                    transitionRunItem(
                      state,
                      stateIndex,
                      "CAPTURED",
                      {
                        captureManifestPath:
                          capture
                            .manifestPath,

                        requestPayloadPath:
                          requestPath
                      }
                    );

                  await store.save(
                    state
                  );
                }
                finally {
                  await context.close();
                }

                work =
                  planResumeForItem(
                    state.items[
                      stateIndex
                    ]!
                  );
              }


              if (
                work.action ===
                "AI_EXTRACT"
              ) {
                if (
                  !work.captureManifestPath
                ) {
                  throw new Error(
                    "CAPTURED state is missing capture manifest."
                  );
                }

                const capture =
                  await loadCapture(
                    work.captureManifestPath
                  );

                const ai =
                  await extractWithProvider(
                    stateIndex,
                    capture
                  );

                if (!ai.result) {
                  queuePaused =
                    ai.pauseQueue;

                  reportItems.push({
                    index:
                      candidate
                        .originalIndex,

                    url:
                      candidate.url,

                    status:
                      "REVIEW",

                    reason:
                      queuePaused
                        ? "AI_QUEUE_PAUSED"
                        : "PROVIDER_REVIEW",

                    finalUrl:
                      capture
                        .manifest
                        .finalUrl,

                    captureManifestPath:
                      capture
                        .manifestPath
                  });

                  continue;
                }

                const resultPath =
                  join(
                    dirname(
                      capture
                        .manifestPath
                    ),
                    "extraction-result.json"
                  );

                await writeJsonAtomic(
                  resultPath,
                  ai.result
                );

                state =
                  transitionRunItem(
                    state,
                    stateIndex,
                    "EXTRACTED",
                    {
                      resultJsonPath:
                        resultPath,

                      latencyMs:
                        ai.result
                          .telemetry
                          .latencyMs,

                      tokenUsage:
                        telemetryUsage(
                          ai.result
                        ),

                      errorClass:
                        null
                    }
                  );

                await store.save(
                  state
                );

                work =
                  planResumeForItem(
                    state.items[
                      stateIndex
                    ]!
                  );
              }


              if (
                work.action ===
                "VALIDATE"
              ) {
                if (
                  !work.captureManifestPath ||
                  !work.resultJsonPath
                ) {
                  throw new Error(
                    "EXTRACTED state is missing durable artifacts."
                  );
                }

                const capture =
                  await loadCapture(
                    work.captureManifestPath
                  );

                const extraction =
                  await readJson<
                    Gemini36VisualExtractionResult
                  >(
                    work.resultJsonPath
                  );

                const validation =
                  validateResult(
                    extraction,
                    capture
                  );

                const validationPath =
                  join(
                    dirname(
                      work
                        .resultJsonPath
                    ),
                    "validation.json"
                  );

                await writeJsonAtomic(
                  validationPath,
                  validation
                );

                validations.set(
                  stateIndex,
                  validation
                );

                state =
                  transitionRunItem(
                    state,
                    stateIndex,
                    validation.status ===
                      "VALIDATED"
                      ? "VALIDATED"
                      : "REVIEW"
                  );

                await store.save(
                  state
                );

                work =
                  planResumeForItem(
                    state.items[
                      stateIndex
                    ]!
                  );

                reportItems.push({
                  index:
                    candidate
                      .originalIndex,

                  url:
                    candidate.url,

                  status:
                      validation
                        .decision
                        .classification ===
                          "NON_CAMERA"
                        ? "SKIPPED_NON_CAMERA"
                        : validation.status,

                  finalUrl:
                    capture
                      .manifest
                      .finalUrl,

                  captureManifestPath:
                    capture
                      .manifestPath,

                  latencyMs:
                    extraction
                      .telemetry
                      .latencyMs
                });
              }
              else if (
                work.action ===
                "COMMIT" ||
                work.action ===
                "SKIP_COMMITTED" ||
                work.action ===
                "REVIEW_HOLD"
              ) {
                const item =
                  state.items[
                    stateIndex
                  ]!;

                const artifactDir =
                  item.resultJsonPath
                    ? dirname(
                        item
                          .resultJsonPath
                      )
                    : item
                        .captureManifestPath
                      ? dirname(
                          item
                            .captureManifestPath
                        )
                      : join(
                          runRoot,
                          String(
                            stateIndex + 1
                          ).padStart(
                            4,
                            "0"
                          )
                        );

                const validationPath =
                  join(
                    artifactDir,
                    "validation.json"
                  );

                if (
                  await exists(
                    validationPath
                  )
                ) {
                  const validation =
                    await readJson<
                      SemanticDecisionValidationResult
                    >(
                      validationPath
                    );

                  validations.set(
                    stateIndex,
                    validation
                  );

                  reportItems.push({
                    index:
                      candidate
                        .originalIndex,

                    url:
                      candidate.url,

                    status:
                      validation
                        .decision
                        .classification ===
                          "NON_CAMERA"
                        ? "SKIPPED_NON_CAMERA"
                        : validation.status,

                    captureManifestPath:
                      item
                        .captureManifestPath ??
                      undefined,

                    latencyMs:
                      item.latencyMs ??
                      undefined
                  });
                }
                else {
                  reportItems.push({
                    index:
                      candidate
                        .originalIndex,

                    url:
                      candidate.url,

                    status:
                      work.action ===
                        "REVIEW_HOLD"
                        ? "REVIEW"
                        : "ERROR",

                    reason:
                      work.action ===
                        "REVIEW_HOLD"
                        ? "MANUAL_REVIEW_HOLD"
                        : "DURABLE_VALIDATION_MISSING",

                    captureManifestPath:
                      item
                        .captureManifestPath ??
                      undefined
                  });
                }
              }
            }
            catch (error) {
              const current =
                state.items[
                  stateIndex
                ];

              if (
                current &&
                current.status ===
                  "PENDING"
              ) {
                state =
                  transitionRunItem(
                    state,
                    stateIndex,
                    "REVIEW",
                    {
                      errorClass:
                        "UNKNOWN"
                    }
                  );

                await store.save(
                  state
                );
              }

              reportItems.push({
                index:
                  candidate
                    .originalIndex,

                url:
                  candidate.url,

                status:
                  "ERROR",

                error:
                  errorMessage(
                    error
                  )
              });
            }
          }


          if (queuePaused) {
            const seen =
              new Set(
                reportItems.map(
                  item => item.index
                )
              );

            for (
              const candidate
              of candidates
            ) {
              if (
                !seen.has(
                  candidate.originalIndex
                )
              ) {
                reportItems.push({
                  index:
                    candidate.originalIndex,

                  url:
                    candidate.url,

                  status:
                    "ERROR",

                  reason:
                    "AI_QUEUE_PAUSED_BEFORE_URL"
                });
              }
            }
          }


          const orderedValidations =
            [...validations.entries()]
              .sort(
                (
                  [left],
                  [right]
                ) =>
                  left - right
              )
              .map(
                ([, validation]) =>
                  validation
              );


          await exportSemantic13WorkbookAtomic(
            resolve(
              options.output
            ),
            orderedValidations,
            {
              runId
            }
          );


          for (
            let stateIndex = 0;
            stateIndex < state.items.length;
            stateIndex += 1
          ) {
            if (
              state.items[
                stateIndex
              ]?.status ===
                "VALIDATED"
            ) {
              state =
                transitionRunItem(
                  state,
                  stateIndex,
                  "COMMITTED"
                );

              await store.save(
                state
              );
            }
          }


          reportItems.sort(
            (left, right) =>
              left.index -
              right.index
          );


          const report = {
            runId,
            statePath,
            items:
              reportItems,

            summary: {
              total:
                urls.length,

              validated:
                reportItems.filter(
                  item =>
                    item.status ===
                    "VALIDATED"
                ).length,

              review:
                reportItems.filter(
                  item =>
                    item.status ===
                    "REVIEW"
                ).length,

              skippedNonCamera:
                reportItems.filter(
                  item =>
                    item.status ===
                    "SKIPPED_NON_CAMERA"
                ).length,

              errors:
                reportItems.filter(
                  item =>
                    item.status ===
                    "ERROR"
                ).length
            }
          };


          const reportPath =
            resolve(
              options.output +
              ".run-report.json"
            );

          await writeJsonAtomic(
            reportPath,
            report
          );


          console.log(
            JSON.stringify({
              output:
                resolve(
                  options.output
                ),

              report:
                reportPath,

              runState:
                statePath,

              summary:
                report.summary
            })
          );


          if (
            report.summary.errors >
              0 ||
            report.summary.review >
              0 ||
            queuePaused
          ) {
            process.exitCode = 1;
          }
        }
        finally {
          if (browser) {
            await browser.close();
          }
        }
      }
    );


  await program.parseAsync(
    [...argv]
  );
}


function isDirectExecution(): boolean {
  const entry =
    process.argv[1];

  if (!entry) {
    return false;
  }

  return (
    import.meta.url ===
    pathToFileURL(
      resolve(entry)
    ).href
  );
}


if (isDirectExecution()) {
  try {
    await runSmartBatchV2DurableCli();
  }
  catch (error) {
    console.error(
      "ERROR: " +
      errorMessage(error)
    );

    process.exitCode = 1;
  }
}