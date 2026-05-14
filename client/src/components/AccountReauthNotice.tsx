import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getClaudeAccountStatus, getCodexAccountStatus } from '@/api/client';
import { useSettingsStore } from '@/stores/settings';
import {
  hasRememberedAccountAuth,
  rememberAccountAuth,
  type AccountAuthProvider,
} from '@/lib/accountAuthMemory';

const CHECK_INTERVAL_MS = 60_000;

interface AccountStatusTarget {
  provider: AccountAuthProvider;
  label: string;
  available: boolean;
  authenticated: boolean;
}

export default function AccountReauthNotice() {
  const ai = useSettingsStore((s) => s.data?.ai);
  const offline = useSettingsStore((s) => s.offline);
  const refreshSettings = useSettingsStore((s) => s.refresh);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');

  useEffect(() => {
    if (ai?.claudeAccountAuthenticated) rememberAccountAuth('claude-account');
    if (ai?.codexAccountAuthenticated) rememberAccountAuth('codex-account');
  }, [ai?.claudeAccountAuthenticated, ai?.codexAccountAuthenticated]);

  const accountTargets: AccountStatusTarget[] = ai
    ? [
        {
          provider: 'claude-account',
          label: 'Claude',
          available: ai.claudeAccountAvailable,
          authenticated: ai.claudeAccountAuthenticated,
        },
        {
          provider: 'codex-account',
          label: 'Codex',
          available: ai.codexAccountAvailable,
          authenticated: ai.codexAccountAuthenticated,
        },
      ]
    : [];

  const rememberedTargets = accountTargets.filter((target) =>
    hasRememberedAccountAuth(target.provider),
  );
  const reauthTargets = rememberedTargets.filter((target) =>
    target.available && !target.authenticated,
  );

  const refreshAccountStatuses = async () => {
    if (offline || rememberedTargets.length === 0) return;
    setChecking(true);
    setCheckError('');
    try {
      const results = await Promise.allSettled(
        rememberedTargets.map(async (target) => {
          if (target.provider === 'claude-account') {
            const status = await getClaudeAccountStatus();
            if (status.authenticated) rememberAccountAuth('claude-account');
            return;
          }
          const status = await getCodexAccountStatus();
          if (status.authenticated) rememberAccountAuth('codex-account');
        }),
      );
      if (results.some((result) => result.status === 'rejected')) {
        setCheckError('Could not verify account auth status.');
      }
      await refreshSettings();
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (offline || rememberedTargets.length === 0) return undefined;
    const initialId = window.setTimeout(() => void refreshAccountStatuses(), 0);
    const id = window.setInterval(() => void refreshAccountStatuses(), CHECK_INTERVAL_MS);
    return () => {
      window.clearTimeout(initialId);
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, rememberedTargets.map((target) => target.provider).join('|')]);

  if (reauthTargets.length === 0) return null;

  const label = reauthTargets.map((target) => target.label).join(' and ');
  const plural = reauthTargets.length > 1;

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-[calc(100vw-2rem)] max-w-sm rounded-card border border-amber-200 bg-amber-50 shadow-card px-3 py-3 text-amber-900"
      data-help="account-reauth-notice"
    >
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <p className="text-[12px] font-semibold">
              {label} {plural ? 'need' : 'needs'} reauth
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-amber-800">
              Seedbank previously saw {plural ? 'these accounts' : 'this account'} signed in, but
              current auth is missing. AI features routed through {label} will pause until you sign
              in again.
            </p>
            {checkError && <p className="mt-1 text-[10px] text-amber-700">{checkError}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/settings/ai-agents"
              className="rounded bg-amber-800 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-amber-900"
            >
              Open AI settings
            </Link>
            <button
              type="button"
              onClick={() => void refreshAccountStatuses()}
              disabled={checking}
              className="inline-flex items-center gap-1 rounded border border-amber-300 px-2.5 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
            >
              <RefreshCw className={`h-3 w-3 ${checking ? 'animate-spin' : ''}`} />
              {checking ? 'Checking' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
