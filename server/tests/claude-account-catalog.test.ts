import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { dataDir } from '../src/db.js';
import { saveTokens, clearTokens } from '../src/ai/claude-account/auth.js';
import { getCatalog, resetCatalogCacheForTests } from '../src/ai/claude-account/catalog.js';
import { ClaudeAccountProvider } from '../src/ai/providers.js';
import type { AiStoredConfig } from '../src/ai/types.js';

const AUTH_PATH = path.join(dataDir, 'claude-auth.json');

async function withAuthSnapshot(run: () => Promise<void>): Promise<void> {
  let previous: Buffer | null = null;
  try {
    previous = await fs.readFile(AUTH_PATH);
  } catch {
    previous = null;
  }

  try {
    await run();
  } finally {
    resetCatalogCacheForTests();
    if (previous) {
      await fs.mkdir(path.dirname(AUTH_PATH), { recursive: true });
      await fs.writeFile(AUTH_PATH, previous);
    } else {
      await clearTokens().catch(() => {});
      await fs.rm(AUTH_PATH, { force: true }).catch(() => {});
    }
  }
}

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
    anthropicModel: 'claude-sonnet-4-20250514',
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

test('Claude catalog parsing includes aliases and capability metadata', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'token-cat-1',
      refreshToken: 'refresh-cat-1',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      scope: 'user:inference',
      obtainedAt: Date.now(),
    });

    resetCatalogCacheForTests();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/v1/models')) {
        return new Response(JSON.stringify({
          data: [{
            id: 'claude-sonnet-latest',
            display_name: 'Claude Sonnet (latest)',
            max_input_tokens: 200000,
            supports_vision: true,
            capabilities: {
              context_management: true,
              compact: true,
              prompt_caching: true,
            },
            supported_reasoning_efforts: ['low', 'medium', 'high'],
            aliases: ['sonnet-latest'],
          }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected URL: ${String(input)}`);
    }) as typeof fetch;

    try {
      const catalog = await getCatalog(true);
      assert.equal(catalog.fresh, true);
      const model = catalog.models[0];
      assert.equal(model?.id, 'claude-sonnet-latest');
      assert.equal(model?.supportsThinking, true);
      assert.equal(model?.supportsVision, true);
      assert.equal(model?.supportsContextManagement, true);
      assert.equal(model?.supportsCompact, true);
      assert.equal(model?.supportsPromptCaching, true);
      assert.equal(model?.maxInputTokens, 200000);
      assert.ok(model?.aliases?.includes('sonnet-latest'));
      assert.deepEqual(model?.supportedReasoningEfforts, ['low', 'medium', 'high']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Claude catalog serves stale cached data when live refresh fails', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'token-cat-2',
      refreshToken: 'refresh-cat-2',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      scope: 'user:inference',
      obtainedAt: Date.now(),
    });

    resetCatalogCacheForTests();
    const originalFetch = globalThis.fetch;
    let fail = false;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (!String(input).includes('/v1/models')) throw new Error(`Unexpected URL: ${String(input)}`);
      if (fail) throw new Error('network-down');
      return new Response(JSON.stringify({ data: [{ id: 'claude-opus-latest', display_name: 'Claude Opus (latest)' }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as typeof fetch;

    try {
      const fresh = await getCatalog(true);
      assert.equal(fresh.fresh, true);
      fail = true;
      const stale = await getCatalog(true);
      assert.equal(stale.fresh, false);
      assert.equal(stale.models[0]?.id, 'claude-opus-latest');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Claude catalog surfaces refresh failures when no cache exists', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'token-expired',
      refreshToken: 'refresh-expired',
      expiresAt: Date.now() - 1_000,
      tokenType: 'Bearer',
      scope: 'user:inference',
      obtainedAt: Date.now() - 60_000,
    });

    resetCatalogCacheForTests();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/v1/oauth/token')) return new Response('invalid_grant', { status: 401 });
      throw new Error(`Unexpected URL: ${String(input)}`);
    }) as typeof fetch;

    try {
      await assert.rejects(() => getCatalog(true), /refresh failed/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test('Claude provider listModels maps catalog capabilities into model metadata', { concurrency: false }, async () => {
  await withAuthSnapshot(async () => {
    await saveTokens({
      accessToken: 'token-cat-3',
      refreshToken: 'refresh-cat-3',
      expiresAt: Date.now() + 60_000,
      tokenType: 'Bearer',
      scope: 'user:inference',
      obtainedAt: Date.now(),
    });

    resetCatalogCacheForTests();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes('/v1/models')) {
        return new Response(JSON.stringify({
          data: [{
            id: 'claude-opus-4-20250514',
            display_name: 'Claude Opus 4',
            max_input_tokens: 262144,
            supports_vision: true,
            capabilities: { context_management: true, compact: true },
            supported_reasoning_efforts: ['medium', 'high'],
          }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Unexpected URL: ${String(input)}`);
    }) as typeof fetch;

    try {
      const provider = new ClaudeAccountProvider();
      const result = await provider.listModels(claudeConfig());
      assert.equal(result.ok, true);
      const model = result.models.find((item) => item.id === 'claude-opus-4-20250514');
      assert.equal(model?.capabilities?.thinking, true);
      assert.equal(model?.capabilities?.vision, true);
      assert.equal(model?.capabilities?.contextManagement, true);
      assert.equal(model?.capabilities?.compact, true);
      assert.equal(model?.capabilities?.contextWindow, 262144);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
