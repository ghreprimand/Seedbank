import type { AiFeatureId, AiProviderId, AiUsageDetail } from '../../../shared/types.js';
import type { AiExecutionMetadata, AiStore } from './store.js';

export function usageSummary(store: AiStore): { last24h: number; last7d: number } {
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    last24h: store.tokensSince(since24h),
    last7d: store.tokensSince(since7d),
  };
}

export function usageDetail(store: AiStore): AiUsageDetail {
  const now = Date.now();
  const since24h = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  return {
    windows: {
      last24h: store.tokensSince(since24h),
      last7d: store.tokensSince(since7d),
    },
    byRoute24h: store.routeUsageBuckets(since24h),
    byFeature: store.usageBuckets(since7d, 'feature'),
    byProvider: store.usageBuckets(since7d, 'provider'),
    byModel: store.usageBuckets(since7d, 'model'),
    recentAuditEvents: store.recentAuditEvents(),
  };
}

export function recordProviderFailure(input: {
  store: AiStore;
  feature: AiFeatureId;
  provider: AiProviderId;
  model: string;
  error: unknown;
  metadata: AiExecutionMetadata;
}): void {
  const message = input.error instanceof Error ? input.error.message : String(input.error);
  input.store.recordAuditEvent('provider_error', input.feature, input.provider, input.model, message, input.metadata);
}
