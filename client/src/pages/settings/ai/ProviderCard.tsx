/**
 * ProviderCard and StatusPill components for the AI & Agents settings page.
 */
import { useEffect, useState } from 'react';
import { ChevronDown, Radio } from 'lucide-react';
import type { AiModelInfo } from '@/lib/types';
import type { ProviderCardStatus } from './types';

// ── StatusPill ────────────────────────────────────────────────────────────────

export function StatusPill({ status }: { status: ProviderCardStatus }) {
  const cfg: Record<ProviderCardStatus, { label: string; classes: string }> = {
    connected:    { label: 'connected',   classes: 'bg-sage-50 text-sage-700 border-sage-200' },
    'key-needed': { label: 'key needed',  classes: 'bg-amber-50 text-amber-700 border-amber-200' },
    unreachable:  { label: 'unreachable', classes: 'bg-red-50 text-red-600 border-red-200' },
    local:        { label: 'local',       classes: 'bg-sage-50 text-sage-700 border-sage-200' },
    'not-tested': { label: 'not tested',  classes: 'bg-ink-50 text-ink-500 border-ink-200' },
  };
  const { label, classes } = cfg[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-badge border text-[10px] font-mono font-semibold uppercase tracking-wide ${classes}`}
    >
      {label}
    </span>
  );
}

// ── ProviderCard ──────────────────────────────────────────────────────────────

export interface ProviderCardProps {
  label: string;
  icon: string;
  isDefault: boolean;
  status: ProviderCardStatus;
  modelLabel: string;
  /** Number of models discovered for this provider instance. */
  discoveredModelCount?: number;
  /** Discovered models to show inside the expanded card. */
  discoveredModels?: AiModelInfo[];
  onSetDefault: () => void;
  /** When false, the "Set default" button is hidden. Default true. */
  canSetDefault?: boolean;
  actions?: React.ReactNode;
  /** Expandable detail row. */
  children?: React.ReactNode;
  /** Expand on first render. Use when the primary action lives in children and is needed immediately. */
  defaultExpanded?: boolean;
  helpId?: string;
  helpTitle?: string;
  helpBody?: string;
  helpDetails?: string;
  helpManualSection?: string;
}

export function ProviderCard({
  label,
  icon,
  isDefault,
  status,
  modelLabel,
  discoveredModelCount,
  discoveredModels = [],
  onSetDefault,
  canSetDefault = true,
  actions,
  children,
  defaultExpanded = false,
  helpId,
  helpTitle,
  helpBody,
  helpDetails,
  helpManualSection,
}: ProviderCardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  // Auto-expand when defaultExpanded transitions to true after mount
  // (e.g. session expiry while page is open — surfaces the login action).
  // Does NOT force-collapse on login so the user stays in context.
  useEffect(() => {
    if (defaultExpanded) setExpanded(true);
  }, [defaultExpanded]);

  return (
    <div
      className={`rounded-card border transition-colors ${
        isDefault ? 'border-sage-300 bg-paper' : 'border-ink-100 bg-paper'
      }`}
      data-help={helpId}
      data-help-title={helpTitle}
      data-help-body={helpBody}
      data-help-details={helpDetails}
      data-help-manual={helpManualSection}
    >
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="text-xl">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-ink-800">{label}</span>
            <StatusPill status={status} />
            {isDefault && (
              <span className="text-[10px] font-mono text-sage-600 uppercase tracking-wide">
                default
              </span>
            )}
          </div>
          <div className="text-xs text-ink-400 font-mono mt-0.5 truncate">
            {modelLabel}
            {typeof discoveredModelCount === 'number' && discoveredModelCount > 0
              ? ` · ${discoveredModelCount} models available`
              : ''}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isDefault && canSetDefault === true && (
            <button
              type="button"
              onClick={onSetDefault}
              className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-badge
                         border border-ink-200 text-ink-600 hover:border-sage-300 hover:text-sage-700
                         hover:bg-sage-50 transition-colors"
            >
              <Radio className="w-3 h-3" />
              Set default
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label} details`}
            className="p-1 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-colors"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {actions && (
        <div className="border-t border-ink-100 px-4 py-3 bg-paper">{actions}</div>
      )}

      {expanded && (
        <div className="border-t border-ink-100 px-4 py-3 bg-paper-warm space-y-3">
          {discoveredModels.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono uppercase tracking-wider text-ink-400">
                Available models
              </p>
              <div className="flex flex-wrap gap-1.5">
                {discoveredModels.slice(0, 12).map((model) => {
                  const label = model.displayName ?? model.name ?? model.id;
                  return (
                    <span
                      key={model.id}
                      title={model.id}
                      className="max-w-full truncate rounded-badge border border-ink-100 bg-paper px-2 py-0.5 text-[11px] font-mono text-ink-600"
                    >
                      {label}
                    </span>
                  );
                })}
                {discoveredModels.length > 12 && (
                  <span className="rounded-badge border border-ink-100 bg-paper px-2 py-0.5 text-[11px] font-mono text-ink-400">
                    +{discoveredModels.length - 12} more
                  </span>
                )}
              </div>
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  );
}
