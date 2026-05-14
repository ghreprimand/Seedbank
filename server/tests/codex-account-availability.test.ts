import test from 'node:test';
import assert from 'node:assert/strict';
import { codexAccountRuntimeAvailability, codexAccountSession } from '../src/ai/codex-account/session.js';

test('Codex account login is exposed without an environment opt-in', { concurrency: false }, () => {
  assert.deepEqual(codexAccountRuntimeAvailability(), { available: true });
});

test('Codex account status reports app-server startup failures directly', { concurrency: false }, async () => {
  const session = codexAccountSession as unknown as Record<string, unknown>;
  const originalEnsureStarted = session.ensureStarted as () => Promise<void>;

  session.ensureStarted = async () => {
    throw new Error('codex app-server not found');
  };

  try {
    const status = await codexAccountSession.status();
    assert.equal(status.authenticated, false);
    assert.equal(status.available, false);
    assert.match(status.unavailableReason ?? '', /codex app-server not found/i);
  } finally {
    session.ensureStarted = originalEnsureStarted;
  }
});

test('Codex account status reads account info via account/read when app-server starts', { concurrency: false }, async () => {
  const session = codexAccountSession as unknown as Record<string, unknown>;
  const originalEnsureStarted = session.ensureStarted as () => Promise<void>;
  const originalRequest = session.request as (method: string, params: unknown, timeoutMs: number) => Promise<unknown>;
  const originalUserAgent = session.userAgent;

  let capturedMethod = '';
  let capturedParams: Record<string, unknown> | null = null;
  session.userAgent = 'codex/test-agent';
  session.ensureStarted = async () => {};
  session.request = async (method: string, params: unknown) => {
    capturedMethod = method;
    capturedParams = params as Record<string, unknown>;
    return {
      account: {
        type: 'chatgpt',
        email: 'codex@example.com',
        planType: 'plus',
      },
      requiresOpenaiAuth: false,
    };
  };

  try {
    const status = await codexAccountSession.status();
    assert.equal(capturedMethod, 'account/read');
    assert.deepEqual(capturedParams, { refreshToken: true });
    assert.equal(status.authenticated, true);
    assert.equal(status.available, true);
    assert.equal(status.accountEmail, 'codex@example.com');
    assert.equal(status.planType, 'plus');
    assert.equal(status.requiresOpenaiAuth, false);
    assert.equal(status.userAgent, 'codex/test-agent');
  } finally {
    session.ensureStarted = originalEnsureStarted;
    session.request = originalRequest;
    session.userAgent = originalUserAgent;
  }
});

test('Codex account login start uses account/login/start payload and maps chatgpt response', { concurrency: false }, async () => {
  const session = codexAccountSession as unknown as Record<string, unknown>;
  const originalEnsureStarted = session.ensureStarted as () => Promise<void>;
  const originalRequest = session.request as (method: string, params: unknown, timeoutMs: number) => Promise<unknown>;

  let capturedMethod = '';
  let capturedParams: Record<string, unknown> | null = null;
  session.ensureStarted = async () => {};
  session.request = async (method: string, params: unknown) => {
    capturedMethod = method;
    capturedParams = params as Record<string, unknown>;
    return {
      type: 'chatgpt',
      loginId: 'login-123',
      authUrl: 'https://chatgpt.com/auth',
    };
  };

  try {
    const result = await codexAccountSession.startLogin();
    assert.equal(capturedMethod, 'account/login/start');
    assert.deepEqual(capturedParams, { type: 'chatgpt', codexStreamlinedLogin: true });
    assert.equal(result.ok, true);
    assert.equal(result.loginId, 'login-123');
    assert.equal(result.loginUrl, 'https://chatgpt.com/auth');
    assert.match(result.message, /browser flow/i);
  } finally {
    session.ensureStarted = originalEnsureStarted;
    session.request = originalRequest;
  }
});
