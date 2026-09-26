import {
  createHash
} from "node:crypto";

import {
  readFile
} from "node:fs/promises";

import {
  resolve
} from "node:path";


export const EXPORT_MANIFEST_SCHEMA_VERSION =
  "camera-intelligence.workbook.v2";


export interface ExportArtifactIdentity {
  path: string;

  fileHash: string;

  fileSize: number;
}


export interface RecordCompletedExportInput {
  runId: string;

  path: string;

  fileHash: string;

  fileSize: number;

  schemaVersion: string;
}


export interface ExportManifestRecord {
  exportId: number;

  runId: string;

  path: string;

  fileHash: string;

  fileSize: number;

  schemaVersion: string;

  createdAt: string;
}


export interface ExportManifestStore {

  recordCompletedExport(
    input:
      RecordCompletedExportInput
  ): ExportManifestRecord;


  findCompletedExport(
    runId:
      string,

    path:
      string
  ): ExportManifestRecord | null;


  listCompletedExports(
    runId:
      string
  ): ExportManifestRecord[];


  close(): void;
}


function requiredText(
  value:
    string,

  label:
    string
): string {

  const normalized =
    value.trim();

  if (!normalized) {
    throw new Error(
      `${label} must not be blank.`
    );
  }

  return normalized;
}


/**
 * Create the identity that may be persisted in export_manifest.
 *
 * The file is read only AFTER the workbook writer resolves.
 * Therefore a missing/partial export cannot produce a completed
 * manifest row through the normal runtime path.
 */
export async function inspectExportArtifact(
  rawPath:
    string
): Promise<ExportArtifactIdentity> {

  const path =
    resolve(
      requiredText(
        rawPath,
        "path"
      )
    );


  const bytes =
    await readFile(
      path
    );


  if (
    bytes.byteLength <=
    0
  ) {
    throw new Error(
      `Export artifact is empty: ${path}`
    );
  }


  const fileHash =
    createHash(
      "sha256"
    )
      .update(
        bytes
      )
      .digest(
        "hex"
      );


  return {
    path,

    fileHash,

    fileSize:
      bytes.byteLength
  };
}