import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

import {
  runCodeFirstRuntime,
  type RuntimePorts
} from '../runtime/codeFirstRuntime.js';
import { sanitizeRootUrl } from '../runtime/runPaths.js';
import type { RunStatusV16 } from '../runtime/checkpointStore.js';

export type RootUrlReader = (prompt: string) => Promise<string>;

export async function promptForRootUrl(read: RootUrlReader): Promise<string> {
  const value = (await read('Website URL: ')).trim();
  if (!value) throw new Error('Website URL is required');
  sanitizeRootUrl(value);
  return value;
}

export function mapRuntimeStatusToExitCode(status: RunStatusV16): number {
  switch (status) {
    case 'COMPLETED': return 0;
    case 'PARTIAL_QUOTA_STOP': return 2;
    case 'ABORTED': return 130;
    case 'ERROR': return 1;
    case 'RUNNING': return 1;
  }
}

export interface InteractiveV16Options {
  readonly ports: RuntimePorts;
  readonly outputRoot: string;
  readonly readRootUrl?: RootUrlReader;
}

export async function runInteractiveV16(options: InteractiveV16Options): Promise<number> {
  const controller = new AbortController();
  const onSigInt = () => controller.abort();
  process.once('SIGINT', onSigInt);

  const readline = options.readRootUrl
    ? null
    : createInterface({ input, output });

  try {
    const read = options.readRootUrl ?? (prompt => readline!.question(prompt));
    const rootUrl = await promptForRootUrl(read);
    const result = await runCodeFirstRuntime({
      rootUrl,
      outputRoot: options.outputRoot,
      ports: options.ports,
      signal: controller.signal
    });
    return mapRuntimeStatusToExitCode(result.status);
  }
  finally {
    process.off('SIGINT', onSigInt);
    readline?.close();
  }
}
