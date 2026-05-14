/**
 * PrivacyNotice — data residency banner shown at the top of the AI & Agents page.
 */
import { Lock, Shield } from 'lucide-react';
import type { AiPreflightResult, AiPublicConfig } from '@/lib/types';
import { defaultInstanceLabel, deriveResidency, isAccountLoginProvider } from './helpers';
import type { DataResidency } from './types';

export function PrivacyNotice({
  ai,
  preflight,
}: {
  ai: AiPublicConfig;
  preflight?: AiPreflightResult | null;
}) {
  const residency = deriveResidency(ai, preflight);
  const providerLabel = defaultInstanceLabel(ai);
  const isAccount = isAccountLoginProvider(ai);

  // For local-instance openai-compatible with 'custom' preset, we cannot claim
  // local residency even if the current URL looks local — user can change it.
  const isLocalInstance = ai.defaultProviderInstanceId === 'local-openai-compatible';
  const activePreset = isLocalInstance ? ai.localOpenaiCompatiblePreset : ai.cloudOpenaiCompatiblePreset;
  const isUserControlledCustom = ai.provider === 'openai-compatible' && activePreset === 'custom';

  const effectiveResidency: DataResidency = isUserControlledCustom ? 'mixed' : residency;

  if (effectiveResidency === 'local') {
    const localLabel = ai.provider === 'ollama' ? 'Ollama' : providerLabel;
    return (
      <div className="flex items-start gap-2.5 px-3 py-2.5 bg-sage-50 border border-sage-200 rounded-card">
        <Lock className="w-4 h-4 text-sage-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-sage-800">Current default provider runs locally</p>
          <p className="text-xs text-sage-700 mt-0.5 leading-relaxed">
            The global default (<span className="font-semibold">{localLabel}</span>) sends idea
            content only to the configured local host. Individual Feature Defaults may route to
            different providers. To keep every AI feature local, set local providers for each Feature
            Default or enable <span className="font-medium">Local-only mode</span> in Advanced
            guardrails.
          </p>
        </div>
      </div>
    );
  }

  if (effectiveResidency === 'cloud') {
    const serverDescription = isAccount
      ? `${providerLabel}'s servers via your account login`
      : `${providerLabel}'s servers`;
    return (
      <div className="flex items-start gap-2.5 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-card">
        <Shield className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-800">
            Idea content is sent to <span className="font-semibold">{providerLabel}</span>
          </p>
          <p className="text-xs text-amber-700 mt-0.5 leading-relaxed">
            When AI features run, field content from your ideas is sent to{' '}
            <span className="font-semibold">{serverDescription}</span> for processing. To keep all
            inference local, switch to Ollama or a local custom endpoint (LM Studio, vLLM, llama.cpp).
          </p>
        </div>
      </div>
    );
  }

  // mixed (custom endpoint — location is user-configured)
  return (
    <div className="flex items-start gap-2.5 px-3 py-2.5 bg-ink-50 border border-ink-200 rounded-card">
      <Shield className="w-4 h-4 text-ink-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-sm font-medium text-ink-700">
          Custom endpoint — data residency is user-configured
        </p>
        <p className="text-xs text-ink-500 mt-0.5 leading-relaxed">
          Whether idea content stays on-machine or leaves depends on the configured endpoint URL.
          Local presets (LM Studio, vLLM, llama.cpp, LocalAI) keep inference on this machine; cloud
          presets (OpenRouter, Groq, Mistral, Together, Fireworks) send content to external servers.
          Check the Custom endpoint card to confirm your preset and base URL.
        </p>
      </div>
    </div>
  );
}
