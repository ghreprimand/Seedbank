import test from 'node:test';
import assert from 'node:assert/strict';
import { claudeAccountRuntimeAvailability, claudeAccountEnabledByEnv } from '../src/ai/claude-account/auth.js';

const ENABLE_KEY = 'SEEDBANK_ENABLE_CLAUDE_ACCOUNT';

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

test('Claude account runtime gate defaults to unavailable for release-candidate builds', { concurrency: false }, () => {
  withEnv(undefined, () => {
    const availability = claudeAccountRuntimeAvailability();
    assert.equal(availability.available, false);
    assert.match(availability.reason ?? '', /SEEDBANK_ENABLE_CLAUDE_ACCOUNT=1/);
  });
});

test('claudeAccountEnabledByEnv returns false when env var is absent', { concurrency: false }, () => {
  withEnv(undefined, () => {
    assert.equal(claudeAccountEnabledByEnv(), false);
  });
});

test('claudeAccountEnabledByEnv returns false for empty string', { concurrency: false }, () => {
  withEnv('', () => {
    assert.equal(claudeAccountEnabledByEnv(), false);
  });
});

test('claudeAccountEnabledByEnv returns false for unsupported value', { concurrency: false }, () => {
  withEnv('yes-please', () => {
    assert.equal(claudeAccountEnabledByEnv(), false);
  });
});

test('Claude account runtime gate reports unavailable reason referencing release candidate', { concurrency: false }, () => {
  withEnv(undefined, () => {
    const availability = claudeAccountRuntimeAvailability();
    assert.equal(availability.available, false);
    assert.match(availability.reason ?? '', /release candidate/i);
  });
});

test('Claude account runtime gate can be enabled with value "1"', { concurrency: false }, () => {
  withEnv('1', () => {
    assert.equal(claudeAccountEnabledByEnv(), true);
    const availability = claudeAccountRuntimeAvailability();
    assert.equal(availability.available, true);
    assert.equal(availability.reason, undefined);
  });
});

test('Claude account runtime gate can be enabled with value "true"', { concurrency: false }, () => {
  withEnv('true', () => {
    assert.equal(claudeAccountEnabledByEnv(), true);
  });
});

test('Claude account runtime gate can be enabled with value "yes"', { concurrency: false }, () => {
  withEnv('yes', () => {
    assert.equal(claudeAccountEnabledByEnv(), true);
  });
});

test('Claude account runtime gate can be enabled with value "on"', { concurrency: false }, () => {
  withEnv('on', () => {
    assert.equal(claudeAccountEnabledByEnv(), true);
  });
});
