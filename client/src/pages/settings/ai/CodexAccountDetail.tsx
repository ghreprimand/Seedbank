/**
 * CodexAccountDetail — login + model config for Codex account-based access.
 */
import { useState } from 'react';
import {
  getCodexAccountStatus,
  logoutCodexAccount,
  startCodexAccountLogin,
  type CodexAccountLoginResult,
} from '@/api/client';
import type { AiModelInfo } from '@/lib/types';
import { useSettingsStore } from '@/stores/settings';
import { forgetAccountAuth, rememberAccountAuth } from '@/lib/accountAuthMemory';
import { ModelPicker } from './ModelPicker';
import { ProviderProbe } from './ProviderProbe';
import type { ProviderCardStatus } from './types';

interface CodexAccountDetailProps {
  model: string;
  onSave: (model: string) => Promise<void>;
  authenticated: boolean;
  available: boolean;
  discoveredModels?: AiModelInfo[];
  onStatusChange?: (status: ProviderCardStatus) => void;
}

export function CodexAccountDetail({
  model,
  onSave,
  authenticated,
  available,
  discoveredModels = [],
  onStatusChange,
}: CodexAccountDetailProps) {
  const [localModel, setLocalModel] = useState(model);
  const [saving, setSaving] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginResult, setLoginResult] = useState<CodexAccountLoginResult | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const [account, setAccount] = useState<string | null>(null);
  const [error, setError] = useState('');
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const scheduleSettingsRefresh = () => {
    for (const delayMs of [1500, 4000, 8000]) {
      window.setTimeout(() => void refreshSettings(), delayMs);
    }
  };

  const refreshStatus = async () => {
    setError('');
    try {
      const status = await getCodexAccountStatus();
      setAccount(status.accountEmail ?? status.planType ?? null);
      if (status.authenticated) rememberAccountAuth('codex-account');
      if (status.available === false) {
        setError(
          status.unavailableReason ??
            'Codex app-server is unavailable. Install or update the Codex runtime, then refresh status.',
        );
        onStatusChange?.('unreachable');
      } else {
        onStatusChange?.(status.authenticated ? 'connected' : 'key-needed');
      }
      await refreshSettings();
      if (status.authenticated) scheduleSettingsRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onStatusChange?.('unreachable');
    }
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    setError('');
    try {
      const result = await startCodexAccountLogin();
      setLoginResult(result);
      if (result.loginUrl) window.open(result.loginUrl, '_blank', 'noopener');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onStatusChange?.('unreachable');
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);
    setError('');
    try {
      await logoutCodexAccount();
      forgetAccountAuth('codex-account');
      setLoginResult(null);
      setAccount(null);
      onStatusChange?.('key-needed');
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
      await onSave(localModel);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
        <span className="font-semibold">Beta</span>
        <span>
          — Codex account login uses a local Codex runtime installed on this machine and your
          ChatGPT/Codex subscription. This is a different billing surface from OpenAI API keys. This
          feature requires the <span className="font-mono">codex</span> CLI to be installed and visible
          on the PATH used by Seedbank.
        </span>
      </div>

      {!available && (
        <div className="space-y-1 text-[11px] text-ink-600 bg-ink-50 border border-ink-200 rounded px-2 py-1.5">
          <p>
            <span className="font-semibold text-ink-800">Runtime unavailable:</span> install or update
            the Codex CLI, restart Seedbank, then refresh status.
          </p>
          <p>
            On Windows, if Codex works in a new terminal but Seedbank still cannot find it, restart
            Seedbank from the Start Menu so the server picks up the updated PATH.
          </p>
        </div>
      )}

      {!authenticated ? (
        <div className="space-y-2">
          <p className="text-[12px] text-neutral-600">
            Log in with Codex to use your ChatGPT/Codex account for Seedbank AI features. This is
            separate from the OpenAI API key method above.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleLogin}
              disabled={loginLoading}
              className="px-3 py-1.5 text-[12px] font-medium bg-neutral-800 text-white rounded hover:bg-neutral-900 disabled:opacity-50"
            >
              {loginLoading ? 'Starting...' : 'Log in with Codex'}
            </button>
            <button
              onClick={() => void refreshStatus()}
              className="px-3 py-1.5 text-[12px] font-medium border border-neutral-300 rounded hover:bg-neutral-50"
            >
              Refresh status
            </button>
          </div>
          {loginResult && (
            <div className="space-y-1.5 p-2 bg-neutral-50 border border-neutral-200 rounded text-[11px]">
              <p>{loginResult.message}</p>
              {loginResult.userCode && (
                <p className="font-mono text-neutral-700">Code: {loginResult.userCode}</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-green-700 font-medium">
              ✓ Logged in{account ? ` · ${account}` : ''}
            </span>
            <button
              onClick={handleLogout}
              disabled={logoutLoading}
              className="px-2 py-1 text-[11px] text-neutral-500 hover:text-red-600 underline"
            >
              {logoutLoading ? 'Logging out...' : 'Log out'}
            </button>
          </div>
          <label className="block text-[11px] font-medium text-neutral-700">
            Model
            <ModelPicker
              discoveredModels={discoveredModels}
              value={localModel}
              onChange={setLocalModel}
              placeholder="codex-recommended"
              className="mt-0.5 block w-full rounded border border-neutral-300 bg-paper px-2 py-1 text-[12px] font-mono text-ink-800"
            />
          </label>
          <p className="text-[10px] text-neutral-500">
            Use <code>codex-recommended</code> or choose a resolved model ID from the Codex catalog.
          </p>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 text-[11px] font-medium bg-neutral-800 text-white rounded hover:bg-neutral-900 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <ProviderProbe
            buildConfig={() => ({ provider: 'codex-account', codexAccountModel: localModel })}
            onPickModel={setLocalModel}
            onStatusChange={onStatusChange}
            testLabel="Test connection"
            listLabel="List models"
          />
        </div>
      )}

      {!authenticated && (
        <ProviderProbe
          buildConfig={() => ({ provider: 'codex-account', codexAccountModel: localModel })}
          onPickModel={setLocalModel}
          onStatusChange={onStatusChange}
          listLabel="List known models"
        />
      )}

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
