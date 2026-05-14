import test from 'node:test';
import assert from 'node:assert/strict';
import { codexAccountRuntimeAvailability, codexAccountSession } from '../src/ai/codex-account/session.js';

const ENABLE_KEY = 'SEEDBANK_ENABLE_CODEX_ACCOUNT';

function withEnv(value: string | undefined, fn: () => Promise<void> | void): Promise<void> | void {
  const previous = process.env[ENABLE_KEY];
  if (value === undefined) delete process.env[ENABLE_KEY];
  else process.env[ENABLE_KEY] = value;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env[ENABLE_KEY];
    else process.env[ENABLE_KEY] = previous;
  }
}

test('Codex account runtime gate defaults to unavailable for release-candidate builds', { concurrency: false }, () => {
  withEnv(undefined, () => {
    const availability = codexAccountRuntimeAvailability();
    assert.equal(availability.available, false);
    assert.match(availability.reason ?? '', /SEEDBANK_ENABLE_CODEX_ACCOUNT=1/);
  });
});

test('Codex account status reports unavailable when runtime gate is closed', { concurrency: false }, async () => {
  await withEnv(undefined, async () => {
    const status = await codexAccountSession.status();
    assert.equal(status.authenticated, false);
    assert.equal(status.available, false);
    assert.match(status.unavailableReason ?? '', /release candidate/i);
  });
});

test('Codex account login returns a clear unavailable message when runtime gate is closed', { concurrency: false }, async () => {
  await withEnv(undefined, async () => {
    const result = await codexAccountSession.startLogin();
    assert.equal(result.ok, false);
    assert.match(result.message, /unavailable/i);
  });
});

test('Codex account runtime gate can be enabled explicitly', { concurrency: false }, () => {
  withEnv('1', () => {
    const availability = codexAccountRuntimeAvailability();
    assert.equal(availability.available, true);
  });
});

test('Codex account status reads account info via account/read when runtime gate is open', { concurrency: false }, async () => {
  await withEnv('1', async () => {
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
});

test('Codex account login start uses account/login/start payload and maps chatgpt response', { concurrency: false }, async () => {
  await withEnv('1', async () => {
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
});
