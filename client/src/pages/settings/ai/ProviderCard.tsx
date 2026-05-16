/**
 * ProviderCard and StatusPill components for the AI & Agents settings page.
 */
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, MoreHorizontal } from 'lucide-react';
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

// ── StatusDot ─────────────────────────────────────────────────────────────────

const STATUS_DOT_CLASSES: Record<ProviderCardStatus, string> = {
  connected: 'bg-sage-500',
  local: 'bg-sage-500',
  'key-needed': 'bg-amber-500',
  unreachable: 'bg-red-500',
  'not-tested': 'bg-ink-300',
};

const STATUS_LABEL: Record<ProviderCardStatus, string> = {
  connected: 'Connected',
  local: 'Local',
  'key-needed': 'Key needed',
  unreachable: 'Unreachable',
  'not-tested': 'Not tested',
};

function StatusIndicator({ status }: { status: ProviderCardStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-600">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${STATUS_DOT_CLASSES[status]}`} />
      {STATUS_LABEL[status]}
    </span>
  );
}

// ── KebabMenu ─────────────────────────────────────────────────────────────────

export interface KebabMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}

function KebabMenu({ items, ariaLabel }: { items: KebabMenuItem[]; ariaLabel: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        className="p-1 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-48 rounded-card border border-ink-200 bg-paper shadow-lg py-1"
        >
          {items.map((item, idx) => (
            <button
              key={idx}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={(e) => {
                e.stopPropagation();
                if (item.disabled) return;
                setOpen(false);
                item.onClick();
              }}
              className={`block w-full text-left px-3 py-1.5 text-[12px] transition-colors ${
                item.disabled
                  ? 'text-ink-300 cursor-not-allowed'
                  : item.tone === 'danger'
                    ? 'text-red-600 hover:bg-red-50'
                    : 'text-ink-700 hover:bg-sage-50 hover:text-sage-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
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
  /** When false, "Set as default" menu item is hidden. Default true. */
  canSetDefault?: boolean;
  /**
   * Connection mode hint shown above the model label as a small tag,
   * e.g. "Subscription" or "API key". Optional.
   */
  modeTag?: string;
  /** Extra menu items (e.g. mode switch, sign out) appended after Set-as-default. */
  menuItems?: KebabMenuItem[];
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
  modeTag,
  menuItems = [],
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
  const [lastDefaultExpanded, setLastDefaultExpanded] = useState(defaultExpanded);

  // Auto-expand when defaultExpanded transitions to true after mount
  // (e.g. session expiry while page is open — surfaces the login action).
  // Does NOT force-collapse on login so the user stays in context.
  if (defaultExpanded !== lastDefaultExpanded) {
    setLastDefaultExpanded(defaultExpanded);
    if (defaultExpanded) setExpanded(true);
  }

  const setDefaultItem: KebabMenuItem | null =
    !isDefault && canSetDefault === true
      ? { label: 'Set as default', onClick: onSetDefault }
      : null;
  const allMenuItems: KebabMenuItem[] = [
    ...(setDefaultItem ? [setDefaultItem] : []),
    ...menuItems,
  ];

  const subtitleParts = [
    modeTag,
    modelLabel,
  ].filter(Boolean);

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
      {/* Header row — left area toggles expansion; right cluster has its own controls. */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label} details`}
          className="flex-1 min-w-0 flex items-center gap-3 text-left hover:opacity-90 transition-opacity"
        >
          <span className="text-xl shrink-0">{icon}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-ink-800">{label}</span>
              <StatusIndicator status={status} />
              {isDefault && (
                <span className="text-[10px] font-mono text-sage-600 uppercase tracking-wide">
                  · default
                </span>
              )}
            </div>
            {subtitleParts.length > 0 && (
              <div className="text-xs text-ink-400 font-mono mt-0.5 truncate">
                {subtitleParts.join(' · ')}
                {typeof discoveredModelCount === 'number' && discoveredModelCount > 0
                  ? ` · ${discoveredModelCount} models`
                  : ''}
              </div>
            )}
          </div>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <KebabMenu items={allMenuItems} ariaLabel={`${label} options`} />
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${label} details`}
            className="p-1 rounded text-ink-400 hover:text-ink-700 hover:bg-ink-50 transition-colors"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        </div>
      </div>

      {actions && expanded && (
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
