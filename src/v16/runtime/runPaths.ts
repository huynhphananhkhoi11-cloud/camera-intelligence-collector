import { createHash } from 'node:crypto';
import { join } from 'node:path';


const SENSITIVE_QUERY_KEY_PATTERN = /^(?:api[-_]?key|key|token|access[-_]?token|refresh[-_]?token|auth|authorization|signature|sig|session|csrf|credential|password|passwd|secret)$/i;

export function sanitizeUrlForPersistence(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Persisted URL must use http or https');
  }

  url.username = '';
  url.password = '';
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_QUERY_KEY_PATTERN.test(key)) {
      url.searchParams.delete(key);
    }
  }
  return url.toString();
}

export interface DeterministicRunPaths {
  readonly normalizedRootUrl: string;
  readonly runId: string;
  readonly runDir: string;
  readonly checkpointPath: string;
  readonly workbookPath: string;
  readonly reportPath: string;
}

export function sanitizeRootUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Root URL must use http or https');
  }

  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';

  return url.toString();
}

export function buildDeterministicRunPaths(
  outputRoot: string,
  rootUrl: string
): DeterministicRunPaths {
  const normalizedRootUrl = sanitizeRootUrl(rootUrl);
  const parsed = new URL(normalizedRootUrl);
  const hostSlug = parsed.hostname
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'site';

  const digest = createHash('sha256')
    .update(normalizedRootUrl)
    .digest('hex')
    .slice(0, 12);

  const runId = `${hostSlug}-${digest}`;
  const runDir = join(outputRoot, runId);

  return {
    normalizedRootUrl,
    runId,
    runDir,
    checkpointPath: join(runDir, 'checkpoint.json'),
    workbookPath: join(runDir, 'camera-products.xlsx'),
    reportPath: join(runDir, 'run-report.json')
  };
}
