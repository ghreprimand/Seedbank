import test from 'node:test';
import assert from 'node:assert/strict';
import { CLAUDE_ACCOUNT_OAUTH_SCOPES } from '../src/ai/claude-account/oauth.js';

test('Claude account OAuth uses the native account-login scope set', () => {
  assert.deepEqual(CLAUDE_ACCOUNT_OAUTH_SCOPES, [
    'org:create_api_key',
    'user:profile',
    'user:inference',
  ]);
});
