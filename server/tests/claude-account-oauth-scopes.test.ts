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
    'user:sessions:claude_code',
    'user:mcp_servers',
    'user:file_upload',
  ]);
});

test('Claude account scope validation requires inference grants', () => {
  assert.doesNotThrow(() => validateClaudeAccountScopes('org:create_api_key user:profile user:inference user:sessions:claude_code'));

  assert.throws(
    () => validateClaudeAccountScopes('org:create_api_key user:profile'),
    (error: unknown) => {
      assert.ok(error instanceof ClaudeAccountScopeError);
      assert.deepEqual(error.missingScopes, ['user:inference', 'user:sessions:claude_code']);
      assert.equal(error.grantedScope, 'org:create_api_key user:profile');
      return true;
    },
  );
});
