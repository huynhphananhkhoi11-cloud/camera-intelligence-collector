import {
  randomUUID
} from "node:crypto";

import {
  mkdir,
  rename,
  writeFile
} from "node:fs/promises";

import * as path from "node:path";

import type {
  SiteBootstrapResult
} from "./siteBootstrapper.js";


export interface BootstrapSnapshot {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  result: SiteBootstrapResult;
}


export interface PersistBootstrapSnapshotOptions {
  outputDir?: string;
  runId?: string;
  now?: () => Date;
}


export interface PersistBootstrapSnapshotResult {
  runId: string;
  path: string;
  snapshot: BootstrapSnapshot;
}


function safeHost(
  canonicalOrigin: string
): string {

  return (
    new URL(
      canonicalOrigin
    )
      .hostname
      .replace(
        /[^a-z0-9.-]+/gi,
        "_"
      )
      .replace(
        /^_+|_+$/g,
        ""
      ) ||
    "site"
  );
}


export async function persistBootstrapSnapshot(
  result: SiteBootstrapResult,
  options:
    PersistBootstrapSnapshotOptions = {}
): Promise<PersistBootstrapSnapshotResult> {

  const now =
    options.now?.() ??
    new Date();

  const runId =
    options.runId ??
    randomUUID();

  const outputDir =
    path.resolve(
      options.outputDir ??
      path.join(
        "output",
        "bootstrap"
      )
    );

  await mkdir(
    outputDir,
    {
      recursive: true
    }
  );

  const stamp =
    now
      .toISOString()
      .replace(
        /[:.]/g,
        "-"
      );

  const filename =
    `${safeHost(
      result.canonicalOrigin
    )}_${stamp}_${runId}.json`;

  const finalPath =
    path.join(
      outputDir,
      filename
    );

  const temporaryPath =
    `${finalPath}.tmp`;

  const snapshot:
    BootstrapSnapshot = {
      schemaVersion: 1,
      runId,
      createdAt:
        now.toISOString(),
      result
    };

  await writeFile(
    temporaryPath,
    JSON.stringify(
      snapshot,
      null,
      2
    ),
    "utf8"
  );

  await rename(
    temporaryPath,
    finalPath
  );

  return {
    runId,
    path:
      finalPath,
    snapshot
  };
}