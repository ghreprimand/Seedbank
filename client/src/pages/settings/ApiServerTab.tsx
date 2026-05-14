/**
 * Settings → API & Server
 *
 * S2  Server info card (port, version, uptime, DB path, last backup)
 * S3  Personal access tokens (create/list/revoke)
 * S4  Webhooks (URL + event toggles)
 * S6  OpenAPI link
 */
import { useEffect, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  ExternalLink,
  Loader2,
  RefreshCw,
  Shield,
  Trash2,
  Webhook,
} from 'lucide-react';
import { HelpButton } from '@/help/HelpPopover';
import {
  listTokens,
  createToken,
  revokeToken,
  apiUrl,
} from '@/api/client';
import {
  useServerInfo,
  useApiSettings,
  useBackupsSettings,
  useSettingsStore,
  useSettingsOffline,
} from '@/stores/settings';
import type { PublicToken } from '@/lib/types';

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtUptime(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

const SCOPES = [
  { value: 'read:ideas',  label: 'Read ideas', desc: 'List and view idea records' },
  { value: 'write:ideas', label: 'Write ideas', desc: 'Create and update ideas' },
  { value: 'ai:suggest',  label: 'AI suggest', desc: 'Call AI suggestion endpoints' },
  { value: 'mcp:read',    label: 'MCP read',   desc: 'Read-only MCP context endpoints' },
] as const;

const WEBHOOK_EVENTS = ['idea.created', 'idea.graduated', 'idea.shipped'] as const;

// ── S2 Server info card ───────────────────────────────────────────────────────

function ServerInfoCard() {
  const info = useServerInfo();
  const backups = useBackupsSettings();
  const [refreshing, setRefreshing] = useState(false);
  const refresh = useSettingsStore((s) => s.refresh);

  const lastBackup =
    backups.lastRun?.timestamp ??
    backups.latestDatabaseBackup?.timestamp ??
    null;

  const handleRefresh = async () => {
    setRefreshing(true);
    try { await refresh(); } finally { setRefreshing(false); }
  };

  return (
    <section className="space-y-3" data-help="settings-api-server">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">Server</h3>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing}
          title="Refresh server info"
          className="p-1 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="rounded-card border border-ink-100 bg-paper divide-y divide-ink-50">
        {[
          { label: 'Port',         value: String(info.port) },
          { label: 'Version',      value: info.version },
          { label: 'Uptime',       value: fmtUptime(info.uptimeMs) },
          { label: 'Database',     value: info.dbPath || '—' },
          { label: 'Last backup',  value: lastBackup ? fmtDate(lastBackup) : 'No backup yet' },
        ].map(({ label, value }) => (
          <div key={label} className="flex items-start gap-4 px-4 py-2.5">
            <span className="text-xs text-ink-500 font-mono w-24 shrink-0">{label}</span>
            <span className="text-xs text-ink-700 font-mono break-all">{value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── S3 Personal access tokens ─────────────────────────────────────────────────

interface TokensState {
  items: PublicToken[];
  loading: boolean;
  error: string | null;
}

function TokensSection() {
  const [ts, setTs] = useState<TokensState>({ items: [], loading: true, error: null });

  // Create form state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newScopes, setNewScopes] = useState<Set<string>>(new Set(['read:ideas']));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Revoke
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = () => {
    setTs((s) => ({ ...s, loading: true, error: null }));
    listTokens()
      .then((items) => setTs({ items, loading: false, error: null }))
      .catch((err) =>
        setTs({ items: [], loading: false, error: err instanceof Error ? err.message : String(err) }),
      );
  };

  useEffect(load, []);

  const handleCreate = async () => {
    if (!newName.trim() || newScopes.size === 0) return;
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createToken({ name: newName.trim(), scopes: [...newScopes] });
      setNewToken(result.token);
      setNewName('');
      setNewScopes(new Set(['read:ideas']));
      setCreateOpen(false);
      load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (id: string) => {
    setRevoking(id);
    try {
      await revokeToken(id);
      load();
    } catch (err) {
      setTs((s) => ({ ...s, error: err instanceof Error ? err.message : String(err) }));
    } finally {
      setRevoking(null);
    }
  };

  const handleCopy = async () => {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  };

  const toggleScope = (scope: string) => {
    setNewScopes((s) => {
      const next = new Set(s);
      if (next.has(scope)) next.delete(scope); else next.add(scope);
      return next;
    });
  };

  return (
    <section className="space-y-3" data-help="settings-api-tokens">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">Personal Access Tokens</h3>
          <HelpButton
            helpId="api-tokens"
            title="Personal Access Tokens"
            summary="Scoped bearer tokens for local scripting or external tools. Tokens are SHA-256 hashed at rest — the raw value is shown once. Creation is restricted to localhost sessions."
            manualSection="settings-api"
            alwaysShow
          />
        </div>
        <button
          type="button"
          onClick={() => { setCreateOpen((v) => !v); setCreateError(null); }}
          className="flex items-center gap-1 text-xs text-sage-700 hover:text-sage-800 font-medium transition-colors"
        >
          {createOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          New token
        </button>
      </div>

      {/* Newly created token — show raw value once */}
      {newToken && (
        <div className="rounded-card border border-sage-300 bg-sage-50 p-3 space-y-2">
          <p className="text-xs font-semibold text-sage-800">
            Token created — copy it now. It will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 min-w-0 px-2 py-1.5 text-xs font-mono bg-paper border border-sage-200 rounded-card text-ink-800 break-all">
              {newToken}
            </code>
            <button
              type="button"
              onClick={() => void handleCopy()}
              className="shrink-0 p-1.5 rounded text-sage-700 hover:bg-sage-100 transition-colors"
              title="Copy token"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <ClipboardCopy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNewToken(null)}
            className="text-[11px] text-sage-600 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {createOpen && (
        <div className="rounded-card border border-ink-100 bg-paper-warm p-4 space-y-3">
          <label className="block text-xs text-ink-500">
            Token name
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. CLI script, n8n automation"
              className="mt-1 w-full px-2 py-1.5 text-sm bg-paper border border-ink-100 rounded-card text-ink-800
                         placeholder:text-ink-300 outline-none focus:ring-2 focus:ring-sage-400"
            />
          </label>
          <div>
            <p className="text-xs text-ink-500 mb-2">Scopes</p>
            <div className="space-y-1.5">
              {SCOPES.map(({ value, desc }) => (
                <label key={value} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newScopes.has(value)}
                    onChange={() => toggleScope(value)}
                    className="mt-0.5 accent-sage-600"
                  />
                  <div>
                    <span className="text-xs font-mono text-ink-700">{value}</span>
                    <span className="ml-1.5 text-[11px] text-ink-500">{desc}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {createError && (
            <p className="text-[11px] text-red-600 font-mono">{createError}</p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating || !newName.trim() || newScopes.size === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                         bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
            >
              {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Shield className="w-3 h-3" />}
              {creating ? 'Creating…' : 'Create token'}
            </button>
            <button
              type="button"
              onClick={() => { setCreateOpen(false); setCreateError(null); }}
              className="px-3 py-1.5 text-xs text-ink-500 hover:bg-ink-50 rounded-card transition-colors"
            >
              Cancel
            </button>
          </div>
          <p className="text-[11px] text-ink-400">
            Token creation is restricted to local browser sessions. Tokens are hashed at rest — the raw value is shown once, here.
          </p>
        </div>
      )}

      {/* Token table */}
      {ts.loading ? (
        <div className="flex items-center gap-2 text-xs text-ink-400 py-4">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading tokens…
        </div>
      ) : ts.error ? (
        <p className="text-xs text-red-600 font-mono">{ts.error}</p>
      ) : ts.items.length === 0 ? (
        <p className="text-xs text-ink-400 py-2">No tokens yet. Create one above to access the API from scripts or external tools.</p>
      ) : (
        <div className="rounded-card border border-ink-100 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-paper-warm border-b border-ink-100">
              <tr>
                <th className="text-left px-3 py-2 font-mono text-ink-500 font-normal">Name</th>
                <th className="text-left px-3 py-2 font-mono text-ink-500 font-normal hidden sm:table-cell">Scopes</th>
                <th className="text-left px-3 py-2 font-mono text-ink-500 font-normal hidden md:table-cell">Created</th>
                <th className="text-left px-3 py-2 font-mono text-ink-500 font-normal hidden md:table-cell">Last used</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-50">
              {ts.items.map((token) => (
                <tr key={token.id} className="hover:bg-paper-warm/50 transition-colors">
                  <td className="px-3 py-2.5 font-mono text-ink-700">{token.name}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {token.scopes.map((scope) => (
                        <span key={scope} className="px-1.5 py-0.5 rounded-badge bg-sage-50 border border-sage-200 text-[10px] font-mono text-sage-700">
                          {scope}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-ink-500 font-mono hidden md:table-cell">
                    {fmtDate(token.createdAt)}
                  </td>
                  <td className="px-3 py-2.5 text-ink-500 font-mono hidden md:table-cell">
                    {token.lastUsedAt ? fmtDate(token.lastUsedAt) : 'Never'}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => void handleRevoke(token.id)}
                      disabled={revoking === token.id}
                      title="Revoke token"
                      className="p-1 rounded text-ink-300 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                      {revoking === token.id
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <Trash2 className="w-3.5 h-3.5" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── S4 Webhooks ───────────────────────────────────────────────────────────────

function WebhooksSection() {
  const api = useApiSettings();
  const offline = useSettingsOffline();
  const patch = useSettingsStore((s) => s.patch);

  const [url, setUrl] = useState(api.webhooks.url ?? '');
  const [events, setEvents] = useState<Set<string>>(new Set(api.webhooks.events));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync local state when store updates (e.g. after refresh)
  const prevApiRef = useRef(api);
  useEffect(() => {
    if (api !== prevApiRef.current) {
      prevApiRef.current = api;
      setUrl(api.webhooks.url ?? '');
      setEvents(new Set(api.webhooks.events));
    }
  }, [api]);

  const toggleEvent = (evt: string) => {
    setEvents((s) => {
      const next = new Set(s);
      if (next.has(evt)) next.delete(evt); else next.add(evt);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await patch('api', { webhooks: { url: url.trim() || null, events: [...events] } });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-3" data-help="settings-api-webhooks">
      <div className="flex items-center gap-1.5">
        <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">Webhooks</h3>
        <HelpButton
          helpId="webhooks"
          title="Outbound Webhooks"
          summary="Fires a JSON POST to your URL on idea lifecycle events: idea.created, idea.graduated, idea.shipped. Payload is the full idea record."
          manualSection="settings-api"
          alwaysShow
        />
      </div>
      <p className="text-xs text-ink-400">
        Outbound HTTP POST on idea lifecycle events. Payload is the full idea record.
      </p>
      <div className="space-y-3">
        <label className="block text-xs text-ink-500">
          Endpoint URL
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… or http://localhost:5678/webhook/…"
            disabled={offline}
            className="mt-1 w-full px-2 py-1.5 text-sm bg-paper border border-ink-100 rounded-card
                       text-ink-800 placeholder:text-ink-300 outline-none focus:ring-2 focus:ring-sage-400
                       disabled:opacity-50"
          />
        </label>
        <div>
          <p className="text-xs text-ink-500 mb-2">Events</p>
          <div className="space-y-1.5">
            {WEBHOOK_EVENTS.map((evt) => (
              <label key={evt} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={events.has(evt)}
                  onChange={() => toggleEvent(evt)}
                  disabled={offline}
                  className="accent-sage-600"
                />
                <span className="text-xs font-mono text-ink-700">{evt}</span>
              </label>
            ))}
          </div>
        </div>
        {saveError && <p className="text-[11px] text-red-600 font-mono">{saveError}</p>}
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving || offline}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold
                     bg-sage-600 hover:bg-sage-700 disabled:bg-ink-300 text-white rounded-card transition-colors"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : saved ? <Check className="w-3 h-3" /> : <Webhook className="w-3 h-3" />}
          {saving ? 'Saving…' : saved ? 'Saved' : 'Save webhook'}
        </button>
      </div>
    </section>
  );
}

// ── S6 OpenAPI ────────────────────────────────────────────────────────────────

function OpenApiSection() {
  const specUrl = apiUrl('/api/openapi.json');
  const restDocsUrl = 'https://github.com/ghreprimand/Seedbank/blob/main/docs/API.md';
  return (
    <section className="space-y-2" data-help="settings-api-reference">
      <h3 className="text-xs font-mono uppercase tracking-wider text-ink-500">API Reference</h3>
      <p className="text-xs text-ink-400">
        Seedbank exposes a machine-readable OpenAPI spec. Open it directly or paste the URL into any OpenAPI viewer.
      </p>
      <div className="flex flex-wrap gap-2 items-center">
        <a
          href={specUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium
                     border border-ink-200 text-ink-600 hover:border-sage-300 hover:text-sage-700
                     hover:bg-sage-50 rounded-card transition-colors"
        >
          <ExternalLink className="w-3 h-3" />
          View openapi.json
        </a>
      </div>
      <p className="text-[11px] text-ink-500 font-mono break-all">{specUrl}</p>
      <p className="text-[11px] text-ink-500">
        Full REST reference:{' '}
        <a
          href={restDocsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="underline decoration-sage-300 underline-offset-2 hover:text-sage-700"
        >
          <code className="font-mono">docs/API.md</code>
        </a>
        .
      </p>
    </section>
  );
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function ApiServerTab() {
  const offline = useSettingsOffline();

  return (
    <div className="space-y-8" data-help="settings-api-server">
      {offline && (
        <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-card text-xs text-amber-800">
          Offline — server data may be stale. Token and webhook changes require the server to be reachable.
        </div>
      )}

      <ServerInfoCard />

      <div className="border-t border-ink-50" />
      <TokensSection />

      <div className="border-t border-ink-50" />
      <WebhooksSection />

      <div className="border-t border-ink-50" />
      <OpenApiSection />
    </div>
  );
}
