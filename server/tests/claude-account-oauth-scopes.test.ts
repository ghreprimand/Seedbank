import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CLAUDE_ACCOUNT_OAUTH_SCOPES,
  ClaudeAccountScopeError,
  validateClaudeAccountScopes,
} from '../src/ai/claude-account/oauth.js';

test('Claude account OAuth uses the native account-login scope set', () => {
  assert.deepEqual(CLAUDE_ACCOUNT_OAUTH_SCOPES, [
    'org:create_api_key',
    'user:profile',
    'user:inference',
  ]);
});

test('Claude account scope validation requires inference grants', () => {
  assert.doesNotThrow(() => validateClaudeAccountScopes('org:create_api_key user:profile user:inference'));
  assert.doesNotThrow(() => validateClaudeAccountScopes('user:inference'));

  assert.throws(
    () => validateClaudeAccountScopes('org:create_api_key user:profile'),
    (error: unknown) => {
      assert.ok(error instanceof ClaudeAccountScopeError);
      assert.deepEqual(error.missingScopes, ['user:inference']);
      assert.equal(error.grantedScope, 'org:create_api_key user:profile');
      return true;
    },
  );
});
