import test from 'node:test';
import assert from 'node:assert/strict';
import { saveTokens, clearTokens } from '../src/ai/claude-account/auth.js';
import { getCatalog, resetCatalogCacheForTests } from '../src/ai/claude-account/catalog.js';
import { ensureLiveTokens } from '../src/ai/claude-account/oauth.js';
import { ClaudeAccountProvider } from '../src/ai/providers.js';
import { codexAccountSession } from '../src/ai/codex-account/session.js';
import { JsonRpcRequestError } from '../src/ai/codex-account/jsonRpc.js';
import { withClaudeAuthSnapshot as withAuthSnapshot } from './helpers/claudeAuthSnapshot.js';
import type { AiStoredConfig } from '../src/ai/types.js';

function claudeConfig(): AiStoredConfig {
  return {
    provider: 'claude-account',
    defaultProviderInstanceId: 'claude-account',
    providerInstances: {
      'claude-api': {} as AiStoredConfig['providerInstances']['claude-api'],
      'claude-account': {} as AiStoredConfig['providerInstances']['claude-account'],
      'openai-api': {} as AiStoredConfig['providerInstances']['openai-api'],
      'codex-account': {} as AiStoredConfig['providerInstances']['codex-account'],
      'ollama': {} as AiStoredConfig['providerInstances']['ollama'],
      'local-openai-compatible': {} as AiStoredConfig['providerInstances']['local-openai-compatible'],
      'cloud-openai-compatible': {} as AiStoredConfig['providerInstances']['cloud-openai-compatible'],
    },
    openaiModel: 'gpt-4.1-mini',
    anthropicModel: 'claude-sonnet-4-6',
    claudeAccountModel: 'claude-sonnet-latest',
    codexAccountModel: 'codex-recommended',
    ollamaModel: 'llama3.2',
    ollamaBaseUrl: 'http://localhost:11434',
    localOpenaiCompatiblePreset: 'lm-studio',
    localOpenaiCompatibleModel: 'local-model',
    localOpenaiCompatibleBaseUrl: 'http://localhost:1234/v1',
    cloudOpenaiCompatiblePreset: 'openrouter',
    cloudOpenaiCompatibleModel: 'openai/gpt-4o-mini',
    cloudOpenaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
    openaiCompatiblePreset: 'openrouter',
    openaiCompatibleModel: 'openai/gpt-4o-mini',
    openaiCompatibleBaseUrl: 'https://openrouter.ai/api/v1',
    dailyTokenBudget: 200000,
    featureRoutes: {
      'thinking-partner': { provider: 'default', providerInstanceId: 'claude-account' },
      'field-suggestions': { provider: 'default', providerInstanceId: 'claude-account' },
      'health-check': { provider: 'default', providerInstanceId: 'claude-account' },
      'discover-insights': { provider: 'default', providerInstanceId: 'claude-account' },
      'default': { provider: 'default', providerInstanceId: 'claude-account' },
    },
    guardrails: {
      featureEnabled: {},
      providerEnabled: {},
      allowedModels: [],
      featureDailyTokenBudgets: {},
      providerDailyTokenBudgets: {},
      providerFamilyDailyTokenBudgets: {},
      modelDailyTokenBudgets: {},
      warnOnRemoteProvider: true,
      requireConfirmationForRemoteProvider: false,
    },
    claudeAccountAuthenticated: true,
    codexAccountAuthenticated: false,
  };
}

test('Claude catalog requests include account-beta identity headers', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'token-1',
      refreshToken: 'refresh-1',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      scope: 'user:inference user:sessions:claude_code',
      obtainedAt: Date.now(),
    });

    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; headers: Headers }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), headers: new Headers(init?.headers) });
      return new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-4-6' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      await getCatalog(true);
    } finally {
      globalThis.fetch = originalFetch;
    }

    const request = calls[0];
    assert.ok(request, 'expected one catalog request');
    assert.equal(request.url, 'https://api.anthropic.com/v1/models?limit=1000');
    assert.equal(request.headers.get('anthropic-beta'), 'claude-code-20250219,oauth-2025-04-20');
    assert.equal(request.headers.get('x-app'), 'cli');
    assert.match(request.headers.get('user-agent') ?? '', /Claude|Seedbank|Codex/i);
  });
});

test('Claude account inference requests include account-beta identity headers', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'token-2',
      refreshToken: 'refresh-2',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      scope: 'user:inference user:sessions:claude_code',
      obtainedAt: Date.now(),
    });

    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; headers: Headers; body?: unknown }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      if (String(input).includes('/v1/models')) {
        return new Response(JSON.stringify({
          data: [{
            id: 'claude-sonnet-4-6',
            capabilities: {
              context_management: true,
              compact: true,
              prompt_caching: true,
            },
          }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ content: [{ text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const provider = new ClaudeAccountProvider();
      await provider.complete([{ role: 'user', content: 'hello' }], claudeConfig());
    } finally {
      globalThis.fetch = originalFetch;
    }

    const request = calls.find((call) => call.url === 'https://api.anthropic.com/v1/messages');
    assert.ok(request, 'expected one inference request');
    assert.equal(request.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(request.headers.get('anthropic-beta'), 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14,context-management-2025-06-27,compact-2026-01-12');
    assert.equal((request.body as { model?: string }).model, 'claude-sonnet-4-6');
    assert.deepEqual((request.body as { system?: unknown }).system, [
      { type: 'text', text: "You are Claude Code, Anthropic's official CLI for Claude." },
    ]);
    assert.equal(request.headers.get('x-app'), 'cli');
    assert.match(request.headers.get('user-agent') ?? '', /Claude|Seedbank|Codex/i);
    assert.deepEqual((request.body as { context_management?: { edits?: Array<{ type?: string }> } }).context_management?.edits?.map((edit) => edit.type), [
      'clear_thinking_20251015',
      'clear_tool_uses_20250919',
      'compact_20260112',
    ]);
    assert.deepEqual((request.body as { cache_control?: unknown }).cache_control, { type: 'ephemeral' });
  });
});

test('Claude account compact can be explicitly disabled while retaining prompt caching', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'token-compact-off',
      refreshToken: 'refresh-compact-off',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      scope: 'user:inference user:sessions:claude_code',
      obtainedAt: Date.now(),
    });

    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; headers: Headers; body?: unknown }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        headers: new Headers(init?.headers),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      if (String(input).includes('/v1/models')) {
        return new Response(JSON.stringify({
          data: [{
            id: 'claude-sonnet-4-6',
            capabilities: {
              context_management: true,
              compact: true,
              prompt_caching: true,
            },
          }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ content: [{ text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const provider = new ClaudeAccountProvider();
      await provider.complete([{ role: 'user', content: 'hello' }], { ...claudeConfig(), claudeAccountCompact: false });
    } finally {
      globalThis.fetch = originalFetch;
    }

    const request = calls.find((call) => call.url === 'https://api.anthropic.com/v1/messages');
    assert.ok(request, 'expected one inference request');
    assert.equal((request.body as { model?: string }).model, 'claude-sonnet-4-6');
    assert.equal(request.headers.get('anthropic-beta'), 'claude-code-20250219,oauth-2025-04-20,interleaved-thinking-2025-05-14');
    assert.equal('context_management' in (request.body as Record<string, unknown>), false);
    assert.deepEqual((request.body as { cache_control?: unknown }).cache_control, { type: 'ephemeral' });
  });
});

test('Claude account request includes selected reasoning effort', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'token-effort',
      refreshToken: 'refresh-effort',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      scope: 'user:inference user:sessions:claude_code',
      obtainedAt: Date.now(),
    });

    const originalFetch = globalThis.fetch;
    const calls: Array<{ url: string; body?: unknown }> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      });
      if (String(input).includes('/v1/models')) {
        return new Response(JSON.stringify({
          data: [{
            id: 'claude-sonnet-4-6',
            capabilities: { context_management: true },
          }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ content: [{ text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const provider = new ClaudeAccountProvider();
      await provider.complete(
        [{ role: 'user', content: 'hello' }],
        { ...claudeConfig(), claudeReasoningEffort: 'medium' },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }

    const request = calls.find((call) => call.url === 'https://api.anthropic.com/v1/messages');
    assert.ok(request, 'expected one inference request');
    assert.deepEqual((request.body as { output_config?: unknown }).output_config, { effort: 'medium' });
    assert.deepEqual((request.body as { thinking?: unknown }).thinking, { type: 'adaptive', display: 'summarized' });
    assert.equal((request.body as { max_tokens?: number }).max_tokens, 16_384);
  });
});

test('Claude account rate limit surfaces as actionable 429', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'token-rate-limit',
      refreshToken: 'refresh-rate-limit',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      scope: 'user:inference user:sessions:claude_code',
      obtainedAt: Date.now(),
    });

    const originalFetch = globalThis.fetch;
    let inferenceCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/v1/models')) {
        return new Response(JSON.stringify({ data: [{ id: 'claude-sonnet-4-6' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      inferenceCalls += 1;
      return new Response('Error', { status: 429, headers: { 'Retry-After': '0' } });
    }) as typeof fetch;

    try {
      const provider = new ClaudeAccountProvider();
      await assert.rejects(
        () => provider.complete([{ role: 'user', content: 'hello' }], claudeConfig()),
        (error: unknown) => {
          const err = error as { status?: number; statusCode?: number; message?: string };
          assert.equal(err.status, 429);
          assert.equal(err.statusCode, 429);
          assert.match(err.message ?? '', /rate or usage limit/i);
          return true;
        },
      );
      assert.equal(inferenceCalls, 3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Claude account listModels returns bundled models when unauthenticated', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await clearTokens();
    const provider = new ClaudeAccountProvider();
    const result = await provider.listModels(claudeConfig());
    assert.equal(result.ok, true);
    assert.equal(result.claudeAccount?.authenticated, false);
    assert.ok(result.models.length > 0);
  });
});

test('Claude account listModels surfaces refresh failures instead of false logout fallback', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'token-stale',
      refreshToken: 'refresh-stale',
      expiresAt: Date.now() - 1_000,
      tokenType: 'Bearer',
      scope: 'user:inference user:sessions:claude_code',
      obtainedAt: Date.now() - 60_000,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/v1/oauth/token')) {
        return new Response('invalid_grant', { status: 401 });
      }
      throw new Error(`Unexpected URL: ${String(input)}`);
    }) as typeof fetch;

    try {
      const provider = new ClaudeAccountProvider();
      const result = await provider.listModels(claudeConfig());
      assert.equal(result.ok, false);
      assert.equal(result.code, 'http_error');
      assert.match(result.message ?? '', /refresh failed/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Codex turn/start request includes non-null effort mapping', async () => {
  const session = codexAccountSession as unknown as Record<string, unknown>;
  const originalEnsureStarted = session.ensureStarted as () => Promise<void>;
  const originalResolveModel = session.resolveModel as (model: string) => Promise<string>;
  const originalRequest = session.request as (method: string, params: unknown, timeoutMs: number) => Promise<unknown>;

  let turnStartParams: Record<string, unknown> | null = null;

  session.ensureStarted = async () => {};
  session.resolveModel = async () => 'gpt-5.2-codex';
  session.request = async (method: string, params: unknown) => {
    if (method === 'thread/start') return { thread: { id: 'thread-1' } };
    if (method === 'turn/start') {
      turnStartParams = params as Record<string, unknown>;
      throw new Error('test-stop-after-turn-start');
    }
    throw new Error(`Unexpected method: ${method}`);
  };

  try {
    await assert.rejects(
      () => codexAccountSession.complete([{ role: 'user', content: 'hello' }], 'codex-recommended'),
      /test-stop-after-turn-start/,
    );
  } finally {
    session.ensureStarted = originalEnsureStarted;
    session.resolveModel = originalResolveModel;
    session.request = originalRequest;
    session.activeTurn = null;
  }

  assert.ok(turnStartParams, 'turn/start should be called');
  assert.notEqual(turnStartParams.effort ?? null, null);
});

test('Codex timeout triggers turn/interrupt before rejecting', async () => {
  const session = codexAccountSession as unknown as Record<string, unknown>;
  const originalEnsureStarted = session.ensureStarted as () => Promise<void>;
  const originalResolveModel = session.resolveModel as (model: string) => Promise<string>;
  const originalRequest = session.request as (method: string, params: unknown, timeoutMs: number) => Promise<unknown>;
  const originalSetTimeout = globalThis.setTimeout;

  let interruptCalled = false;

  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    if (timeout === 120_000) {
      queueMicrotask(() => {
        if (typeof handler === 'function') handler(...args);
      });
      return 1 as unknown as NodeJS.Timeout;
    }
    return originalSetTimeout(handler, timeout, ...(args as []));
  }) as typeof setTimeout;

  session.ensureStarted = async () => {};
  session.resolveModel = async () => 'gpt-5.2-codex';
  session.request = async (method: string) => {
    if (method === 'thread/start') return { thread: { id: 'thread-timeout' } };
    if (method === 'turn/start') return { turn: { id: 'turn-timeout' } };
    if (method === 'turn/interrupt') {
      interruptCalled = true;
      return {};
    }
    throw new Error(`Unexpected method: ${method}`);
  };

  try {
    await assert.rejects(
      () => codexAccountSession.complete([{ role: 'user', content: 'hello' }], 'codex-recommended'),
      /timed out/i,
    );
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    session.ensureStarted = originalEnsureStarted;
    session.resolveModel = originalResolveModel;
    session.request = originalRequest;
    session.activeTurn = null;
  }

  assert.equal(interruptCalled, true);
});

test('Codex reasoning notifications stream labeled text before assistant delta', async () => {
  const session = codexAccountSession as unknown as Record<string, unknown>;
  const originalEnsureStarted = session.ensureStarted as () => Promise<void>;
  const originalResolveModel = session.resolveModel as (model: string) => Promise<string>;
  const originalRequest = session.request as (method: string, params: unknown, timeoutMs: number) => Promise<unknown>;

  const deltas: string[] = [];

  session.ensureStarted = async () => {};
  session.resolveModel = async () => 'gpt-5.2-codex';
  session.request = async (method: string) => {
    if (method === 'thread/start') return { thread: { id: 'thread-reasoning' } };
    if (method === 'turn/start') {
      setTimeout(() => {
        (session.onNotification as (n: unknown) => void)({
          method: 'item/reasoning/summaryTextDelta',
          params: { delta: 'Thinking through options.' },
        });
        (session.onNotification as (n: unknown) => void)({
          method: 'item/agentMessage/delta',
          params: { delta: 'Final answer.' },
        });
        (session.onNotification as (n: unknown) => void)({
          method: 'turn/completed',
          params: { turn: { id: 'turn-reasoning', status: 'completed' } },
        });
      }, 0);
      return { turn: { id: 'turn-reasoning' } };
    }
    throw new Error(`Unexpected method: ${method}`);
  };

  try {
    const result = await codexAccountSession.complete([{ role: 'user', content: 'hello' }], 'codex-recommended', (delta) => {
      deltas.push(delta);
    });
    assert.match(result.text, /\[Reasoning\]/);
    assert.match(result.text, /Thinking through options\./);
    assert.match(result.text, /Final answer\./);
    assert.ok(deltas.length >= 2, 'expected reasoning and assistant deltas');
    assert.match(deltas[0] ?? '', /\[Reasoning\]/);
  } finally {
    session.ensureStarted = originalEnsureStarted;
    session.resolveModel = originalResolveModel;
    session.request = originalRequest;
    session.activeTurn = null;
  }
});

test('Codex failed-turn unauthorized error surfaces actionable login message', async () => {
  const session = codexAccountSession as unknown as Record<string, unknown>;
  const originalEnsureStarted = session.ensureStarted as () => Promise<void>;
  const originalResolveModel = session.resolveModel as (model: string) => Promise<string>;
  const originalRequest = session.request as (method: string, params: unknown, timeoutMs: number) => Promise<unknown>;

  session.ensureStarted = async () => {};
  session.resolveModel = async () => 'gpt-5.2-codex';
  session.request = async (method: string) => {
    if (method === 'thread/start') return { thread: { id: 'thread-unauthorized' } };
    if (method === 'turn/start') {
      setTimeout(() => {
        (session.onNotification as (n: unknown) => void)({
          method: 'turn/completed',
          params: {
            turn: {
              id: 'turn-unauthorized',
              status: 'failed',
              error: {
                message: '401 Unauthorized',
                codexErrorInfo: 'Unauthorized',
              },
            },
          },
        });
      }, 0);
      return { turn: { id: 'turn-unauthorized' } };
    }
    throw new Error(`Unexpected method: ${method}`);
  };

  try {
    await assert.rejects(
      () => codexAccountSession.complete([{ role: 'user', content: 'hello' }], 'codex-recommended'),
      /authentication|log in again|settings/i,
    );
  } finally {
    session.ensureStarted = originalEnsureStarted;
    session.resolveModel = originalResolveModel;
    session.request = originalRequest;
    session.activeTurn = null;
  }
});

test('Codex JSON-RPC context-window errors map to actionable message', async () => {
  const session = codexAccountSession as unknown as Record<string, unknown>;
  const originalRpc = session.rpc;

  session.rpc = {
    request: async () => {
      throw new JsonRpcRequestError(
        {
          code: -32000,
          message: 'request too large',
          data: { codexErrorInfo: 'ContextWindowExceeded' },
        },
        'turn/start',
      );
    },
  };

  try {
    await assert.rejects(
      () => (session.request as (method: string, params: unknown, timeoutMs: number) => Promise<unknown>)('turn/start', {}, 1_000),
      /context window/i,
    );
  } finally {
    session.rpc = originalRpc;
  }
});

test('Codex status applies startup circuit-breaker after repeated app-server failures', async () => {
  const session = codexAccountSession as unknown as Record<string, unknown>;
  const originalStart = session.start as () => Promise<void>;
  const originalProc = session.proc;
  const originalRpc = session.rpc;
  const originalStarting = session.starting;
  const originalFailureCount = session.startFailureCount;
  const originalCircuitUntil = session.circuitOpenUntil;
  const originalLastFailure = session.lastStartFailure;

  let startCalls = 0;
  session.start = async () => {
    startCalls += 1;
    throw new Error('spawn boom');
  };

  try {
    await codexAccountSession.status();
    await codexAccountSession.status();
    await codexAccountSession.status();
    const blocked = await codexAccountSession.status();
    assert.equal(blocked.available, false);
    assert.match(blocked.unavailableReason ?? '', /temporarily paused|retry in/i);
    assert.equal(startCalls, 3);
  } finally {
    session.start = originalStart;
    session.proc = originalProc;
    session.rpc = originalRpc;
    session.starting = originalStarting;
    session.startFailureCount = originalFailureCount;
    session.circuitOpenUntil = originalCircuitUntil;
    session.lastStartFailure = originalLastFailure;
  }
});

test('ensureLiveTokens refreshes expired Claude token with single-flight lock', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'expired-access',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 5_000,
      tokenType: 'Bearer',
      scope: 'user:inference user:sessions:claude_code',
      obtainedAt: Date.now() - 60_000,
    });

    const originalFetch = globalThis.fetch;
    let refreshCalls = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === 'https://platform.claude.com/v1/oauth/token') {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return new Response(JSON.stringify({
          access_token: `fresh-access-${refreshCalls}`,
          refresh_token: 'refresh-token-next',
          expires_in: 3600,
          token_type: 'Bearer',
          scope: 'user:inference user:sessions:claude_code',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      throw new Error(`Unexpected fetch URL in test: ${url}`);
    }) as typeof fetch;

    try {
      const [a, b, c] = await Promise.all([
        ensureLiveTokens(),
        ensureLiveTokens(),
        ensureLiveTokens(),
      ]);
      assert.equal(refreshCalls, 1, 'expected one refresh network call for concurrent refresh requests');
      assert.equal(a.accessToken, 'fresh-access-1');
      assert.equal(b.accessToken, 'fresh-access-1');
      assert.equal(c.accessToken, 'fresh-access-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('ensureLiveTokens surfaces refresh/network failures distinctly from signed-out state', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'expired-access',
      refreshToken: 'refresh-token',
      expiresAt: Date.now() - 5_000,
      tokenType: 'Bearer',
      scope: 'user:inference user:sessions:claude_code',
      obtainedAt: Date.now() - 60_000,
    });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response('upstream failure', { status: 503 })) as typeof fetch;

    try {
      await assert.rejects(
        () => ensureLiveTokens(),
        /refresh|token/i,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
