import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
export interface JsonObject { readonly [key: string]: JsonValue; }

export type RunStatusV16 =
  | 'RUNNING'
  | 'COMPLETED'
  | 'PARTIAL_QUOTA_STOP'
  | 'ABORTED'
  | 'ERROR';

export type ProductCompletionV16 =
  | 'PENDING'
  | 'DIRECT_DONE'
  | 'FALLBACK_WAITING'
  | 'FALLBACK_DONE'
  | 'SCOPE_REVIEW_REQUIRED';

export interface ProductCheckpointV16 {
  readonly canonicalId: string;
  readonly url: string;
  completion: ProductCompletionV16;
  directResult?: JsonValue;
  row?: JsonValue;
  fallbackState?: 'NOT_REQUIRED' | 'WAITING' | 'DONE';
  fallbackEvidenceRef?: string;
}

export interface RunCheckpointV16 {
  readonly schemaVersion: 1;
  readonly rootUrl: string;
  status: RunStatusV16;
  cameraScope: JsonValue | null;
  routes: JsonValue[];
  collections: JsonValue[];
  discoveryComplete: boolean;
  products: Record<string, ProductCheckpointV16>;
  productOrder: string[];
  updatedAt: string;
}

const SECRET_KEY_PATTERN = /(?:^|_)(?:api[-_]?key|authorization|cookie|set[-_]?cookie|bearer|csrf|credential|password|passwd|secret|access[-_]?token|refresh[-_]?token|session[-_]?token)(?:$|_)/i;
const SENSITIVE_QUERY_KEY_PATTERN = /^(?:api[-_]?key|key|token|access[-_]?token|refresh[-_]?token|auth|authorization|signature|sig|session|csrf|credential|password|passwd|secret)$/i;

const SECRET_VALUE_PATTERNS = [
  /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i,
  /\bAIza[0-9A-Za-z_-]{20,}\b/
];

export function assertCheckpointSafe(value: unknown, path = '$'): void {
  if (typeof value === 'string') {
    for (const pattern of SECRET_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        throw new Error(`Refusing to persist secret-bearing value at ${path}`);
      }
    }

    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        if (url.username || url.password) {
          throw new Error(`Refusing to persist secret-bearing URL at ${path}`);
        }
        for (const key of url.searchParams.keys()) {
          if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
            throw new Error(`Refusing to persist secret-bearing URL at ${path}`);
          }
        }
      }
      catch (error) {
        if (error instanceof Error && /secret-bearing/.test(error.message)) throw error;
      }
    }
    return;
  }

  if (value === null || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCheckpointSafe(item, `${path}[${index}]`));
    return;
  }

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`Refusing to persist secret-bearing key at ${path}.${key}`);
    }
    assertCheckpointSafe(child, `${path}.${key}`);
  }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  assertCheckpointSafe(value);
  await mkdir(dirname(path), { recursive: true });

  const temporaryPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  const handle = await open(temporaryPath, 'w');
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
    await handle.sync();
  }
  finally {
    await handle.close();
  }

  try {
    await rename(temporaryPath, path);
  }
  catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function saveCheckpointAtomic(
  path: string,
  checkpoint: RunCheckpointV16
): Promise<void> {
  await writeJsonAtomic(path, checkpoint);
}

export async function loadCheckpoint(path: string): Promise<RunCheckpointV16 | null> {
  try {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text) as RunCheckpointV16;
    if (parsed.schemaVersion !== 1) {
      throw new Error(`Unsupported checkpoint schema version: ${String(parsed.schemaVersion)}`);
    }
    if (!Array.isArray(parsed.routes)) {
      parsed.routes = [];
    }
    if (typeof parsed.discoveryComplete !== 'boolean') {
      parsed.discoveryComplete = false;
    }
    assertCheckpointSafe(parsed);
    return parsed;
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}
