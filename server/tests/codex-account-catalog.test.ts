import test from 'node:test';
import assert from 'node:assert/strict';
import { codexAccountSession } from '../src/ai/codex-account/session.js';
import { CodexAccountProvider } from '../src/ai/providers.js';

const ENABLE_ENV = 'SEEDBANK_ENABLE_CODEX_ACCOUNT';

function withCodexEnv(value: string | undefined, run: () => Promise<void>): Promise<void> {
  const previous = process.env[ENABLE_ENV];
  if (value === undefined) delete process.env[ENABLE_ENV];
  else process.env[ENABLE_ENV] = value;
  return run().finally(() => {
    if (previous === undefined) delete process.env[ENABLE_ENV];
    else process.env[ENABLE_ENV] = previous;
  });
}

test('Codex catalog parsing captures reasoning/image/context/aliases and serves stale cache on refresh failure', { concurrency: false }, async () => {
  await withCodexEnv('1', async () => {
    const session = codexAccountSession as unknown as Record<string, unknown>;
    const originalEnsureStarted = session.ensureStarted as () => Promise<void>;
    const originalRequest = session.request as (method: string, params: unknown, timeoutMs: number) => Promise<unknown>;
    const originalCache = session.catalogCache;

    let failModelList = false;

    session.ensureStarted = async () => {};
    session.request = async (method: string) => {
      if (method !== 'model/list') throw new Error(`Unexpected method: ${method}`);
      if (failModelList) throw new Error('catalog-fetch-failed');
      return {
        data: [{
          id: 'gpt-5.2-codex',
          displayName: 'GPT-5.2 Codex',
          isDefault: true,
          defaultReasoningEffort: 'medium',
          supportedReasoningEfforts: ['low', 'medium', 'high'],
          aliases: ['codex-recommended'],
          capabilities: { vision: true, contextWindow: 262144 },
        }],
        nextCursor: null,
      };
    };

    try {
      const fresh = await codexAccountSession.listModels(true);
      assert.equal(fresh.fresh, true);
      const model = fresh.models[0];
      assert.equal(model?.id, 'gpt-5.2-codex');
      assert.deepEqual(model?.supportedReasoningEfforts, ['low', 'medium', 'high']);
      assert.equal(model?.supportsImage, true);
      assert.equal(model?.contextWindow, 262144);
      assert.deepEqual(model?.aliases, ['codex-recommended']);

      failModelList = true;
      const stale = await codexAccountSession.listModels(true);
      assert.equal(stale.fresh, false);
      assert.equal(stale.models[0]?.id, 'gpt-5.2-codex');
    } finally {
      session.ensureStarted = originalEnsureStarted;
      session.request = originalRequest;
      session.catalogCache = originalCache;
    }
  });
});

test('Codex complete uses catalog-supported reasoning effort when provided', { concurrency: false }, async () => {
  await withCodexEnv('1', async () => {
    const session = codexAccountSession as unknown as Record<string, unknown>;
    const originalEnsureStarted = session.ensureStarted as () => Promise<void>;
    const originalRequest = session.request as (method: string, params: unknown, timeoutMs: number) => Promise<unknown>;
    const originalCache = session.catalogCache;
    const originalActiveTurn = session.activeTurn;

    let effortFromTurnStart: string | null = null;

    session.ensureStarted = async () => {};
    session.request = async (method: string, params: unknown) => {
      if (method === 'model/list') {
        return {
          data: [{
            id: 'gpt-5.2-codex',
            displayName: 'GPT-5.2 Codex',
            supportedReasoningEfforts: ['high', 'medium'],
          }],
          nextCursor: null,
        };
      }
      if (method === 'thread/start') return { thread: { id: 'thread-1' } };
      if (method === 'turn/start') {
        effortFromTurnStart = (params as { effort?: string }).effort ?? null;
        throw new Error('stop-after-turn-start');
      }
      throw new Error(`Unexpected method: ${method}`);
    };

    try {
      await assert.rejects(
        () => codexAccountSession.complete([{ role: 'user', content: 'hello' }], 'gpt-5.2-codex'),
        /stop-after-turn-start/,
      );
      assert.equal(effortFromTurnStart, 'medium');
    } finally {
      session.ensureStarted = originalEnsureStarted;
      session.request = originalRequest;
      session.catalogCache = originalCache;
      session.activeTurn = originalActiveTurn;
    }
  });
});

test('Codex provider model list maps catalog capabilities into AiModelInfo', { concurrency: false }, async () => {
  await withCodexEnv('1', async () => {
    const session = codexAccountSession as unknown as Record<string, unknown>;
    const originalStatus = session.status as () => Promise<unknown>;
    const originalListModels = session.listModels as () => Promise<unknown>;

    session.status = async () => ({ authenticated: true, available: true, accountEmail: 'user@example.com', planType: 'plus' });
    session.listModels = async () => ({
      fresh: true,
      fetchedAt: Date.now(),
      models: [
        {
          id: 'gpt-5.2-codex',
          displayName: 'GPT-5.2 Codex',
          isDefault: true,
          supportedReasoningEfforts: ['low', 'medium', 'high'],
          supportsImage: true,
          contextWindow: 262144,
        },
      ],
    });

    try {
      const provider = new CodexAccountProvider();
      const result = await provider.listModels({} as never);
      assert.equal(result.ok, true);
      const recommended = result.models.find((model) => model.id === 'codex-recommended');
      assert.ok(recommended?.capabilities?.thinking);
      assert.equal(recommended?.capabilities?.vision, true);
      assert.equal(recommended?.capabilities?.contextWindow, 262144);

      const direct = result.models.find((model) => model.id === 'gpt-5.2-codex');
      assert.equal(direct?.displayName, 'GPT-5.2 Codex');
      assert.equal(direct?.capabilities?.thinking, true);
      assert.equal(direct?.capabilities?.vision, true);
    } finally {
      session.status = originalStatus;
      session.listModels = originalListModels;
    }
  });
});
