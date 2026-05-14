/**
 * UsageAuditSection — token usage stats + audit event log for AI features.
 */
import { useState } from 'react';
import { aiProviderLabel, isAiProviderId } from '@/lib/types';
import type { AiAuditEvent, AiUsageBucket } from '@/lib/types';
import type { AiUsageDetail, AiUsageSummary } from '@/api/client';
import { executionMetadataLabel, fmtTokens, routeLabel } from './helpers';

// ── UsageBucketTable ──────────────────────────────────────────────────────────

function UsageBucketTable({ rows }: { rows: AiUsageBucket[] }) {
  if (!rows.length) {
    return <p className="text-[11px] text-ink-400 italic">No activity in this window.</p>;
  }
  return (
    <div className="border border-ink-100 rounded-card overflow-hidden">
      <table className="w-full text-[11px]">
        <thead className="bg-paper-warm">
          <tr>
            <th className="text-left px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">
              Name
            </th>
            <th className="text-right px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">
              Reqs
            </th>
            <th className="text-right px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">
              Tokens
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-50">
          {rows.map((row, i) => {
            const metadata = executionMetadataLabel(row);
            return (
              <tr key={i} className="hover:bg-paper-warm transition-colors">
                <td className="px-3 py-1.5 text-ink-700 font-medium">
                  <div>{routeLabel(row.feature ?? row.provider ?? row.model ?? row.key)}</div>
                  {metadata ? (
                    <div className="mt-0.5 text-[10px] font-normal text-ink-400">{metadata}</div>
                  ) : null}
                </td>
                <td className="px-3 py-1.5 text-ink-500 font-mono text-right">{row.count}</td>
                <td className="px-3 py-1.5 text-ink-700 text-right font-mono">
                  {fmtTokens(row.totalTokens)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── AuditEventTable ───────────────────────────────────────────────────────────

function AuditEventTable({ events }: { events: AiAuditEvent[] }) {
  if (!events.length) {
    return (
      <p className="text-[11px] text-ink-400 italic">No recent guardrail events.</p>
    );
  }
  return (
    <div className="border border-ink-100 rounded-card overflow-hidden">
      <table className="w-full text-[11px]">
        <thead className="bg-paper-warm">
          <tr>
            <th className="text-left px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">
              Event
            </th>
            <th className="text-left px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">
              Feature · Provider
            </th>
            <th className="text-left px-3 py-1.5 font-mono font-semibold text-ink-500 uppercase tracking-wide">
              Message
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-50">
          {events.map((ev) => {
            const metadata = executionMetadataLabel(ev);
            const provider = isAiProviderId(ev.provider)
              ? aiProviderLabel(ev.provider)
              : ev.provider;
            return (
              <tr key={ev.id} className="hover:bg-paper-warm transition-colors">
                <td className="px-3 py-1.5 font-mono">
                  <span
                    className={
                      ev.type === 'guardrail_denied' ? 'text-amber-700' : 'text-red-600'
                    }
                  >
                    {ev.type === 'guardrail_denied' ? 'denied' : 'error'}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-ink-500">
                  <div>
                    {routeLabel(ev.feature)} · {provider}
                  </div>
                  {metadata ? (
                    <div className="mt-0.5 text-[10px] text-ink-400">{metadata}</div>
                  ) : null}
                </td>
                <td
                  className="px-3 py-1.5 text-ink-600 max-w-[200px] truncate"
                  title={ev.message}
                >
                  {ev.message}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── UsageAuditSection ─────────────────────────────────────────────────────────

export interface UsageAuditSectionProps {
  detail: AiUsageDetail | null;
  basicUsage: AiUsageSummary | null;
}

type UsageTab = 'feature' | 'provider' | 'model' | 'events';

export function UsageAuditSection({ detail, basicUsage }: UsageAuditSectionProps) {
  const [activeTab, setActiveTab] = useState<UsageTab>('feature');

  const last24h = detail ? detail.raw.windows.last24h : (basicUsage?.last24h ?? 0);
  const last7d = detail ? detail.raw.windows.last7d : (basicUsage?.last7d ?? 0);
  if (!detail && !basicUsage) return null;

  const byFeature = detail?.raw.byFeature ?? [];
  const byProvider = detail?.raw.byProvider ?? [];
  const byModel = detail?.raw.byModel ?? [];
  const auditEvents = detail?.raw.recentAuditEvents ?? [];
  const hasDetail = Boolean(detail);

  type TabDef = { id: UsageTab; label: string };
  const tabs: TabDef[] = [
    { id: 'feature', label: 'By feature' },
    { id: 'provider', label: 'By provider' },
    { id: 'model', label: 'By model' },
    { id: 'events', label: `Events${auditEvents.length ? ` (${auditEvents.length})` : ''}` },
  ];

  return (
    <div className="space-y-2">
      <p className="text-xs font-mono uppercase tracking-wider text-ink-500">
        Usage · Last 24 h / 7 d
      </p>
      <div className="font-mono text-[11px] text-ink-400 space-y-0.5">
        <div>
          <span className="text-ink-700 font-semibold">{fmtTokens(last24h)}</span> tokens · 24 h
        </div>
        <div>
          <span className="text-ink-700 font-semibold">{fmtTokens(last7d)}</span> tokens · 7 d
        </div>
      </div>

      {hasDetail ? (
        <div className="space-y-2">
          <div className="flex gap-0 border border-ink-100 rounded-card overflow-hidden w-fit">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1 text-[11px] font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-sage-100 text-sage-800 border-r border-ink-100'
                    : 'bg-paper-warm text-ink-400 hover:text-ink-700 border-r border-ink-100'
                } last:border-r-0`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {activeTab === 'feature' && <UsageBucketTable rows={byFeature} />}
          {activeTab === 'provider' && <UsageBucketTable rows={byProvider} />}
          {activeTab === 'model' && <UsageBucketTable rows={byModel} />}
          {activeTab === 'events' && <AuditEventTable events={auditEvents} />}
        </div>
      ) : (
        <p className="text-[11px] text-ink-400">
          Feature-level breakdown requires the server's{' '}
          <code className="font-mono">GET /api/ai/usage/detail</code> endpoint.
        </p>
      )}
    </div>
  );
}
