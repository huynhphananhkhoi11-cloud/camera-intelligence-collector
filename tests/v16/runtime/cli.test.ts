import test from 'node:test';
import assert from 'node:assert/strict';

import { mapRuntimeStatusToExitCode, promptForRootUrl } from '../../../src/v16/cli/runV16Cli.js';

test('CLI uses one Website URL prompt and trims the root URL', async () => {
  const prompts: string[] = [];
  const value = await promptForRootUrl(async prompt => {
    prompts.push(prompt);
    return '  https://shop.test/  ';
  });
  assert.deepEqual(prompts, ['Website URL: ']);
  assert.equal(value, 'https://shop.test/');
});

test('exit codes distinguish partial quota stop, abort, and corruption/error', () => {
  assert.equal(mapRuntimeStatusToExitCode('COMPLETED'), 0);
  assert.equal(mapRuntimeStatusToExitCode('PARTIAL_QUOTA_STOP'), 2);
  assert.equal(mapRuntimeStatusToExitCode('ABORTED'), 130);
  assert.equal(mapRuntimeStatusToExitCode('ERROR'), 1);
});
