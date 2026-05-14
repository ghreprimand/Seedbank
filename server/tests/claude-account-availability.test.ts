import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeAccountRuntimeAvailability } from '../src/ai/claude-account/auth.js';

test('Claude account login is exposed by default', { concurrency: false }, () => {
  assert.deepEqual(claudeAccountRuntimeAvailability(), { available: true });
});
