import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AiFeatureId, AiProviderId } from '../../../shared/types.js';

const CONFIRMATION_TOKEN_TTL_MS = 10 * 60 * 1000;
const confirmationSecret = randomBytes(32).toString('hex');

export const GUARDRAIL_SETTINGS_HINT = 'Review Settings -> AI & Agents -> Usage & Guardrails.';

export class SimpleRateLimiter {
  private readonly hits = new Map<string, number[]>();

  check(key: string, limit = 20, windowMs = 60_000): void {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => now - timestamp < windowMs);
    if (recent.length >= limit) throw new Error('AI rate limit reached. Wait a minute before trying again.');
    recent.push(now);
    this.hits.set(key, recent);
  }
}

export function guardrailError(message: string, statusCode: number): Error {
  return Object.assign(new Error(message), { statusCode });
}

function confirmationPayload(feature: AiFeatureId, provider: AiProviderId, model: string): string {
  return JSON.stringify({
    feature,
    provider,
    model,
    exp: Date.now() + CONFIRMATION_TOKEN_TTL_MS,
  });
}

function signConfirmationPayload(payload: string): string {
  return createHmac('sha256', confirmationSecret).update(payload).digest('base64url');
}

export function createConfirmationToken(feature: AiFeatureId, provider: AiProviderId, model: string): string {
  const payload = Buffer.from(confirmationPayload(feature, provider, model)).toString('base64url');
  return `${payload}.${signConfirmationPayload(payload)}`;
}

export function validConfirmationToken(token: string | undefined, feature: AiFeatureId, provider: AiProviderId, model: string): boolean {
  if (!token) return false;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return false;
  const expected = signConfirmationPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return false;

  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      feature?: unknown;
      provider?: unknown;
      model?: unknown;
      exp?: unknown;
    };
    return parsed.feature === feature
      && parsed.provider === provider
      && parsed.model === model
      && typeof parsed.exp === 'number'
      && parsed.exp >= Date.now();
  } catch {
    return false;
  }
}
