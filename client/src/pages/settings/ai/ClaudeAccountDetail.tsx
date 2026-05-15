/**
 * ClaudeAccountDetail — login + model config for Claude account-based access.
 */
import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import type { AiModelInfo } from '@/lib/types';
import {
  completeClaudeAccountLogin,
  getClaudeAccountStatus,
  logoutClaudeAccount,
  startClaudeAccountLogin,
  type ClaudeAccountLoginResult,
} from '@/api/client';
import { useSettingsStore } from '@/stores/settings';
import { forgetAccountAuth, rememberAccountAuth } from '@/lib/accountAuthMemory';
import { ModelPicker } from './ModelPicker';
import { ProviderProbe } from './ProviderProbe';
import type { ProviderCardStatus } from './types';

interface ClaudeAccountDetailProps {
  model: string;
  compactEnabled: boolean;
  onSave: (model: string, compactEnabled: boolean) => Promise<void>;
  authenticated: boolean;
  available: boolean;
  discoveredModels?: AiModelInfo[];
  onStatusChange?: (status: ProviderCardStatus) => void;
}

export function ClaudeAccountDetail({
  model,
  compactEnabled,
  onSave,
  authenticated,
  available,
  discoveredModels = [],
  onStatusChange,
}: ClaudeAccountDetailProps) {
  const [localModel, setLocalModel] = useState(model);
  const [compact, setCompact] = useState(compactEnabled);
  const [lastCompactEnabled, setLastCompactEnabled] = useState(compactEnabled);
  const [listedModels, setListedModels] = useState<AiModelInfo[]>([]);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginPolling, setLoginPolling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loginResult, setLoginResult] = useState<ClaudeAccountLoginResult | null>(null);
  const [manualCallbackUrl, setManualCallbackUrl] = useState('');
  const [completing, setCompleting] = useState(false);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [error, setError] = useState('');
  const loginPollTimerRef = useRef<number | null>(null);
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const scheduleSettingsRefresh = () => {
    for (const delayMs of [1500, 4000, 8000]) {
      window.setTimeout(() => void refreshSettings(), delayMs);
    }
  };
  const clearLoginPollTimer = () => {
    if (loginPollTimerRef.current !== null) {
      window.clearTimeout(loginPollTimerRef.current);
      loginPollTimerRef.current = null;
    }
  };
  const stopLoginStatusPolling = () => {
    clearLoginPollTimer();
    setLoginPolling(false);
  };

  if (compactEnabled !== lastCompactEnabled) {
    setLastCompactEnabled(compactEnabled);
    setCompact(compactEnabled);
  }

  const refreshStatus = async () => {
    if (!available) {
      setExpiresAt(null);
      onStatusChange?.('unreachable');
      return;
    }
    setRefreshing(true);
    setError('');
    try {
      const status = await getClaudeAccountStatus();
      setExpiresAt(status.expiresAt ?? null);
      if (status.authenticated) rememberAccountAuth('claude-account');
      onStatusChange?.(status.authenticated ? 'connected' : 'key-needed');
      await refreshSettings();
      if (status.authenticated) scheduleSettingsRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onStatusChange?.('unreachable');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!available) return;
    const timeout = window.setTimeout(() => void refreshStatus(), 0);
    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [available]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (authenticated) clearLoginPollTimer();
  }, [authenticated]);

  useEffect(() => () => clearLoginPollTimer(), []);

  const startLoginStatusPolling = () => {
    stopLoginStatusPolling();
    const startedAt = Date.now();
    setLoginPolling(true);

    const poll = async () => {
      if (!available) {
        stopLoginStatusPolling();
        return;
      }

      try {
        const status = await getClaudeAccountStatus();
        setExpiresAt(status.expiresAt ?? null);
        if (status.authenticated) {
          rememberAccountAuth('claude-account');
          onStatusChange?.('connected');
          await refreshSettings();
          scheduleSettingsRefresh();
          stopLoginStatusPolling();
          return;
        }
        onStatusChange?.('key-needed');
      } catch {
        // Keep polling briefly; the callback server may still be exchanging tokens.
      }

      if (Date.now() - startedAt >= 120_000) {
        stopLoginStatusPolling();
        return;
      }

      loginPollTimerRef.current = window.setTimeout(poll, 2000);
    };

    loginPollTimerRef.current = window.setTimeout(poll, 2000);
  };

  const handleStartLogin = async () => {
    if (!available) return;
    setLoginLoading(true);
    setError('');
    try {
      const result = await startClaudeAccountLogin();
      setLoginResult(result);
      window.open(result.authorizationUrl, '_blank', 'noopener');
      if (!result.manualFallback) startLoginStatusPolling();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onStatusChange?.('unreachable');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleCompleteManual = async () => {
    if (!available) return;
    const callbackUrl = manualCallbackUrl.trim();
    if (!callbackUrl) {
      setError('Paste the full callback URL from the browser after login.');
      return;
    }
    setCompleting(true);
    setError('');
    try {
      stopLoginStatusPolling();
      await completeClaudeAccountLogin(callbackUrl);
      setManualCallbackUrl('');
      await refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCompleting(false);
    }
  };

  const handleLogout = async () => {
    if (!available) return;
    setLogoutLoading(true);
    setError('');
    try {
      stopLoginStatusPolling();
      await logoutClaudeAccount();
      forgetAccountAuth('claude-account');
      await refreshSettings();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLogoutLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(localModel, compact);
    } finally {
      setSaving(false);
    }
  };

  const modelOptions = listedModels.length > 0 ? listedModels : discoveredModels;
  const compactSupported = modelOptions.some(
    (item) =>
      (item.id === localModel || item.name === localModel || item.displayName === localModel) &&
      item.capabilities?.compact === true,
  );

  return (
    <div className="space-y-3">
      {!available ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <span className="font-semibold">Runtime unavailable</span>
            <span>
              — Claude account login is not reachable. Refresh status or restart the server.
            </span>
          </div>
          <p className="text-[11px] text-ink-500 leading-relaxed">
            Use the <span className="font-semibold text-ink-700">Anthropic API</span> method with an
            API key from{' '}
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-sage-700"
            >
              console.anthropic.com
            </a>
            .
          </p>
        </div>
      ) : !authenticated ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
            <span className="font-semibold">Sign-in required</span>
            <span>— Log in with your Claude account subscription to enable this method.</span>
          </div>
          {expiresAt !== null && expiresAt < now && (
            <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <span className="font-semibold">Session expired</span>
              <span>
                — Your previous Claude account session expired. Sign in again to continue.
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleStartLogin}
              disabled={loginLoading}
              className="px-3 py-1.5 text-[12px] font-medium bg-neutral-800 text-white rounded hover:bg-neutral-900 disabled:opacity-50"
            >
              {loginLoading ? 'Starting…' : 'Log in with Claude'}
            </button>
            <button
              type="button"
              onClick={() => void refreshStatus()}
              disabled={refreshing}
              className="px-3 py-1.5 text-[12px] font-medium border border-neutral-300 rounded hover:bg-neutral-50 disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh status'}
            </button>
          </div>

          {loginResult && (
            <div className="space-y-1.5 p-2 bg-neutral-50 border border-neutral-200 rounded text-[11px]">
              <p>
                {loginResult.manualFallback
                  ? 'Manual callback is required in this environment.'
                  : loginPolling
                    ? 'Browser sign-in opened in a new tab. Waiting for Claude to finish linking…'
                    : 'Browser sign-in opened in a new tab. After the callback page says Claude is linked, return here.'}
              </p>
              {loginResult.manualReason && (
                <p className="text-ink-500">{loginResult.manualReason}</p>
              )}
            </div>
          )}

          <div className="space-y-2 p-2 bg-paper-warm border border-ink-100 rounded">
            <label className="block text-[11px] text-ink-600">
              Manual callback URL
              <input
                type="text"
                value={manualCallbackUrl}
                onChange={(event) => setManualCallbackUrl(event.target.value)}
                placeholder="Only paste this if the callback tab cannot reach Seedbank"
                className="mt-1 w-full px-2 py-1.5 bg-paper border border-ink-100 rounded-card text-xs text-ink-800"
              />
            </label>
            <button
              type="button"
              onClick={handleCompleteManual}
              disabled={completing}
              className="px-3 py-1.5 text-[12px] font-medium border border-ink-200 text-ink-700 rounded hover:bg-ink-50 disabled:opacity-50"
            >
              {completing ? 'Completing…' : 'Complete login from callback URL'}
            </button>
          </div>

          <div className="flex items-start gap-2 px-2.5 py-2 bg-paper-warm border border-ink-100 rounded text-[11px] text-ink-700">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0 text-ink-400" />
            <div>
              <p className="font-semibold">Need Claude model access now?</p>
              <p className="mt-0.5 text-ink-600">
                Use the Anthropic API method above with an API key from{' '}
                <a
                  href="https://console.anthropic.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-sage-700"
                >
                  console.anthropic.com
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {expiresAt !== null && expiresAt - now < 30 * 60_000 && expiresAt > now && (
            <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              <span className="font-semibold">Token expiring soon</span>
              <span>
                — Your session expires at {new Date(expiresAt).toLocaleTimeString()}. Re-login to
                avoid interruption.
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-green-700 font-medium">✓ Logged in</span>
            {expiresAt && (
              <span className="text-[11px] text-ink-500">
                expires {new Date(expiresAt).toLocaleString()}
              </span>
            )}
            <button
              type="button"
              onClick={() => void refreshStatus()}
              disabled={refreshing}
              className="px-2 py-1 text-[11px] text-ink-500 hover:text-ink-700 underline disabled:opacity-50"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={logoutLoading}
              className="px-2 py-1 text-[11px] text-neutral-500 hover:text-red-600 underline"
            >
              {logoutLoading ? 'Logging out…' : 'Log out'}
            </button>
          </div>

          <label className="block text-[11px] font-medium text-neutral-700">
            Model
            <ModelPicker
              discoveredModels={modelOptions}
              value={localModel}
              onChange={setLocalModel}
              placeholder="claude-sonnet-latest"
              className="mt-0.5 block w-full rounded border border-neutral-300 bg-paper px-2 py-1 text-[12px] font-mono text-ink-800"
            />
          </label>
          <p className="text-[10px] text-neutral-500">
            Use an alias like <code>claude-sonnet-latest</code> or a specific version like{' '}
            <code>claude-sonnet-4-20250514</code>.
          </p>
          {compactSupported && (
            <label className="flex items-start gap-2 rounded border border-neutral-200 bg-neutral-50 px-2 py-1.5 text-[11px] text-neutral-700">
              <input
                type="checkbox"
                checked={compact}
                onChange={(event) => setCompact(event.target.checked)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium">Use Claude context compaction</span>
                <span className="block text-neutral-500">
                  On by default for compact-capable Claude account models.
                </span>
              </span>
            </label>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-[11px] font-medium bg-neutral-800 text-white rounded hover:bg-neutral-900 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <ProviderProbe
            buildConfig={() => ({
              provider: 'claude-account',
              claudeAccountModel: localModel,
              claudeAccountCompact: compact,
            })}
            onPickModel={setLocalModel}
            onModelsListed={setListedModels}
            onStatusChange={onStatusChange}
            testLabel="Test connection"
            listLabel="List models"
          />
        </div>
      )}

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
