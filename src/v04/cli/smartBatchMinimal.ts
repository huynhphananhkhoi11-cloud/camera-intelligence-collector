#!/usr/bin/env node

import {
  readFile,
  writeFile
} from "node:fs/promises";

import {
  join,
  resolve
} from "node:path";

import {
  pathToFileURL
} from "node:url";

import {
  Command
} from "commander";

import {
  chromium
} from "playwright";

import {
  runCameraOnlyDiscoveryPipeline,
  runCameraOnlyProductUrls
} from "../pipeline/cameraOnlyDiscoveryPipeline.js";

import type {
  ProductEvidenceRetentionPolicy
} from "../contracts/v15PipelineContracts.js";

import {
  toResolvedProviderProfile,
  type ResolvedProviderProfile
} from "../../v03/provider/providerProfile.js";

export function parseUrls(raw: string): string[] {
  return raw
    .split(/\r?\n/gu)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith("#"));
}

export function parseRetentionPolicy(
  raw: string
): ProductEvidenceRetentionPolicy {
  if (
    raw === "AUDIT_KEEP_ALL" ||
    raw === "LEAN_DELETE_SUCCESS"
  ) {
    return raw;
  }

  throw new Error(
    "Invalid retention policy. Use AUDIT_KEEP_ALL or LEAN_DELETE_SUCCESS."
  );
}

function firstConfigured(
  env: Readonly<Record<string, string | undefined>>,
  keys: readonly string[]
): string | null {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return null;
}

export function configuredProviderProfile(
  env: Readonly<Record<string, string | undefined>> = process.env
): ResolvedProviderProfile {
  const authKey = firstConfigured(
    env,
    ["GEMINI_AUTH_KEY", "GEMINI_API_KEY"]
  );

  if (!authKey) {
    throw new Error(
      "Gemini credential is not configured. Set GEMINI_AUTH_KEY or GEMINI_API_KEY."
    );
  }

  const projectId = env.GEMINI_PROJECT_ID?.trim() || "v04-default";

  return toResolvedProviderProfile({
    id: "gemini-primary",
    label: "Gemini Primary",
    projectId,
    authKey
  });
}

function makeRunId(): string {
  return (
    "v15-" +
    new Date()
      .toISOString()
      .replace(/[:.]/gu, "-")
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runSmartBatchMinimalCli(
  argv: readonly string[] = process.argv
): Promise<void> {
  const program = new Command();

  program
    .name("camintel-smart-batch-minimal")
    .description(
      "Run the V15 camera-only visual discovery/capture -> Gemini -> 13-column XLSX pipeline."
    )
    .argument(
      "<input-file>",
      "Text file containing product URLs (default acceptance/direct mode) or site-root URLs with --discover"
    )
    .requiredOption("--output <xlsx>", "Output XLSX file")
    .option(
      "--capture-root <dir>",
      "Durable V15 capture/checkpoint root",
      ".camintel/v15-runs"
    )
    .option("--run-id <id>", "Reuse an existing durable run id")
    .option(
      "--discover",
      "Treat input URLs as website roots and run reconnaissance -> Gemini camera-route selection -> approved-route discovery before product capture",
      false
    )
    .option(
      "--retention <policy>",
      "Evidence retention: LEAN_DELETE_SUCCESS for production or AUDIT_KEEP_ALL for audit/release diagnostics",
      "LEAN_DELETE_SUCCESS"
    )
    .option("--headless", "Hide Chromium", false)
    .action(
      async (
        inputFile: string,
        options: {
          readonly output: string;
          readonly captureRoot: string;
          readonly runId?: string;
          readonly discover: boolean;
          readonly retention: string;
          readonly headless: boolean;
        }
      ) => {
        const inputUrls = parseUrls(await readFile(inputFile, "utf8"));
        if (inputUrls.length === 0) {
          throw new Error("Input file contains no URLs.");
        }

        const runId = options.runId?.trim() || makeRunId();
        const runRoot = resolve(options.captureRoot, runId);
        const statePath = join(runRoot, "run-state.json");
        const reportPath = options.output + ".run-report.json";
        const provider = configuredProviderProfile();
        const retentionPolicy =
          parseRetentionPolicy(options.retention);

        const browser = await chromium.launch({
          headless: options.headless
        });

        try {
          console.log(
            `[RUN] ${runId} mode=${options.discover ? "DISCOVER" : "DIRECT_PRODUCTS"} input=${inputUrls.length}`
          );

          let discovery:
            | {
                readonly approvedRoutes: readonly {
                  readonly candidateId: string;
                  readonly label: string;
                  readonly url: string;
                }[];
                readonly productUrls: readonly string[];
                readonly discoveryPasses: number;
              }
            | null = null;

          const runtime = options.discover
            ? await runCameraOnlyDiscoveryPipeline({
                runId,
                roots: inputUrls,
                browser,
                providers: [provider],
                captureRoot: runRoot,
                statePath,
                outputPath: resolve(options.output),
                retentionPolicy
              }).then(result => {
                discovery = {
                  approvedRoutes: result.approvedRoutes,
                  productUrls: result.productUrls,
                  discoveryPasses: result.discoveryPasses
                };
                return result.productRuntime;
              })
            : await runCameraOnlyProductUrls({
                runId,
                urls: inputUrls,
                browser,
                providers: [provider],
                captureRoot: runRoot,
                statePath,
                outputPath: resolve(options.output),
                retentionPolicy
              });

          await writeFile(
            reportPath,
            JSON.stringify(
              {
                runId,
                mode: options.discover ? "DISCOVER" : "DIRECT_PRODUCTS",
                output: resolve(options.output),
                statePath: runtime.statePath,
                pausedForQuota: runtime.pausedForQuota,
                discovery,
                itemErrors: runtime.itemErrors,
                summary: runtime.summary
              },
              null,
              2
            ) + "\n",
            "utf8"
          );

          console.log(
            JSON.stringify({
              output: options.output,
              report: reportPath,
              runId,
              summary: runtime.summary
            })
          );

          if (runtime.summary.errors > 0 || runtime.pausedForQuota) {
            process.exitCode = 1;
          }
        }
        finally {
          await browser.close();
        }
      }
    );

  await program.parseAsync([...argv]);
}

function isDirectExecution(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry!)).href;
}

if (isDirectExecution()) {
  try {
    await runSmartBatchMinimalCli();
  }
  catch (error) {
    console.error("ERROR: " + errorMessage(error));
    process.exitCode = 1;
  }
}
