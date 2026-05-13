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
