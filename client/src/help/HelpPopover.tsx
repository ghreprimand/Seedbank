/**
 * HelpButton + HelpPopover
 *
 * HelpButton — a small accessible ⓘ trigger. Visible always if `alwaysShow`,
 *   or only when help mode is active (default). Supports keyboard + touch.
 *
 * HelpPopover — the rich explanation panel opened by HelpButton.
 *   Closes on Esc, outside click, or the close button.
 *   Always offers "Open manual section →" if a manualSection is provided.
 *
 * Usage:
 *   <HelpButton
 *     helpId="stage-badge"
 *     title="Lifecycle Stages"
 *     summary="Every idea moves through stages from Seed to Shipped."
 *     manualSection="stages"
 *   />
 */
import { useRef, useState, useEffect, useId } from 'react';
import { HelpCircle, X, BookOpen } from 'lucide-react';
import { useHelp } from './useHelp';
// HelpModeToggle is exported from this file — both component and non-component
// exports are present intentionally (context hook in separate file).

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HelpButtonProps {
  /** Unique identifier — used for aria labels. */
  helpId: string;
  /** Popover heading. */
  title: string;
  /** One-sentence summary shown in the popover. */
  summary: string;
  /** Optional longer body (plain text). */
  details?: string;
  /** Manual section id to deep-link into. */
  manualSection?: string;
  /** Show the trigger even when help mode is off. Good for complex settings. */
  alwaysShow?: boolean;
  /** Extra class on the trigger button wrapper. */
  className?: string;
}

// ── Popover panel ─────────────────────────────────────────────────────────────

interface HelpPopoverPanelProps {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  title: string;
  summary: string;
  details?: string;
  manualSection?: string;
  onClose: () => void;
}

function HelpPopoverPanel({
  anchorRef,
  title,
  summary,
  details,
  manualSection,
  onClose,
}: HelpPopoverPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const { openManual } = useHelp();

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose, anchorRef]);

  // Close on Esc
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); anchorRef.current?.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, anchorRef]);

  // Focus first focusable element on mount
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    const first = panel.querySelector<HTMLElement>('button, a, [tabindex]');
    first?.focus();
  }, []);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={title}
      className="absolute z-50 mt-1.5 w-72 bg-paper border border-ink-200 rounded-card shadow-card-hover
                 animate-slide-up left-0 top-full"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-3 pt-3 pb-2 border-b border-ink-100">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5 text-sage-500 shrink-0" />
          <span className="text-xs font-semibold text-ink-700">{title}</span>
        </div>
        <button
          onClick={onClose}
          aria-label="Close help"
          className="p-0.5 text-ink-300 hover:text-ink-500 rounded transition-colors shrink-0"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Body */}
      <div className="px-3 py-2.5 space-y-2">
        <p className="text-xs text-ink-600 leading-relaxed">{summary}</p>
        {details && (
          <p className="text-xs text-ink-500 leading-relaxed">{details}</p>
        )}
      </div>

      {/* Footer — manual link */}
      {manualSection && (
        <div className="px-3 pb-3">
          <button
            onClick={() => { onClose(); openManual(manualSection); }}
            className="flex items-center gap-1.5 text-xs text-sage-600 hover:text-sage-700 transition-colors font-medium"
          >
            <BookOpen className="w-3 h-3" />
            Open manual section →
          </button>
        </div>
      )}
    </div>
  );
}

// ── HelpButton (trigger) ──────────────────────────────────────────────────────

export function HelpButton({
  helpId,
  title,
  summary,
  details,
  manualSection,
  alwaysShow = false,
  className = '',
}: HelpButtonProps) {
  const { helpMode } = useHelp();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const uid = useId();

  // Only render the trigger in help mode OR when alwaysShow
  const visible = helpMode || alwaysShow;
  if (!visible && !open) return null;

  return (
    <span className={`relative inline-flex items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={`Help: ${title}`}
        aria-expanded={open}
        aria-controls={`help-pop-${uid}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className={`rounded-full p-0.5 transition-all focus-visible:outline-none
                    focus-visible:ring-2 focus-visible:ring-sage-400
                    ${open
                      ? 'text-sage-600 bg-sage-50 ring-2 ring-sage-300'
                      : helpMode
                        ? 'text-sage-500 bg-sage-50 ring-2 ring-sage-300 shadow-sm hover:ring-sage-400 hover:text-sage-600'
                        : 'text-ink-300 hover:text-sage-500 hover:bg-sage-50'
                    }`}
        id={`help-btn-${helpId}-${uid}`}
      >
        <HelpCircle className="w-3.5 h-3.5" />
      </button>

      {open && (
        <HelpPopoverPanel
          anchorRef={triggerRef}
          title={title}
          summary={summary}
          details={details}
          manualSection={manualSection}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}

// ── HelpModeToggle ────────────────────────────────────────────────────────────

/**
 * A small toggle that activates/deactivates contextual help mode.
 * Place it in the manual header or settings area.
 */
export function HelpModeToggle({ className = '' }: { className?: string }) {
  const { helpMode, toggleHelpMode } = useHelp();
  return (
    <button
      type="button"
      onClick={toggleHelpMode}
      aria-pressed={helpMode}
      aria-label={helpMode ? 'Exit help mode' : 'Enter help mode'}
      title={helpMode ? 'Exit help mode' : 'Enter help mode — reveal hints near UI elements'}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-pill text-xs font-medium
                  transition-colors focus-visible:outline-none focus-visible:ring-2
                  focus-visible:ring-sage-400 ${
                    helpMode
                      ? 'bg-sage-100 text-sage-700 border border-sage-300'
                      : 'bg-paper-warm text-ink-500 border border-ink-100 hover:border-ink-200 hover:text-ink-700'
                  } ${className}`}
    >
      <HelpCircle className="w-3 h-3" />
      <span className="hidden md:inline">{helpMode ? 'Help mode on' : 'Help mode'}</span>
    </button>
  );
}
