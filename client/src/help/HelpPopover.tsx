import { HelpCircle } from 'lucide-react';
import { resolveHelpById } from './helpResolver';
import { useHelp } from './useHelp';

export interface HelpButtonProps {
  helpId: string;
  title: string;
  summary: string;
  details?: string;
  manualSection?: string;
  alwaysShow?: boolean;
  className?: string;
}

export function HelpButton({
  helpId,
  title,
  summary,
  details,
  manualSection,
  alwaysShow = false,
  className = '',
}: HelpButtonProps) {
  const { helpMode, openHelpAtRect } = useHelp();

  const visible = helpMode || alwaysShow;
  if (!visible) return null;

  return (
    <span className={`inline-flex items-center ${className}`}>
      <button
        type="button"
        data-help={helpId}
        data-help-title={title}
        data-help-body={summary}
        data-help-details={details}
        data-help-manual={manualSection}
        aria-label={`Help: ${title}`}
        onClick={(event) => {
          event.stopPropagation();
          const entry = resolveHelpById(helpId, {
            title,
            body: summary,
            details,
            manualSection,
          });
          openHelpAtRect(helpId, entry, event.currentTarget.getBoundingClientRect());
        }}
        className={`rounded-full p-0.5 transition-all focus-visible:outline-none
                    focus-visible:ring-2 focus-visible:ring-sage-400 ${
                      helpMode
                        ? 'bg-sage-50 text-sage-600 ring-2 ring-sage-300 shadow-sm hover:ring-sage-400'
                        : 'text-ink-300 hover:bg-sage-50 hover:text-sage-600'
                    }`}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

export function HelpModeToggle({ className = '' }: { className?: string }) {
  const { helpMode, toggleHelpMode } = useHelp();

  return (
    <button
      type="button"
      onClick={toggleHelpMode}
      aria-pressed={helpMode}
      aria-label={helpMode ? 'Exit help mode' : 'Enter help mode'}
      className={`flex items-center gap-1.5 rounded-pill border px-2.5 py-1.5 text-xs font-medium transition-colors ${
        helpMode
          ? 'border-sage-300 bg-sage-100 text-sage-700'
          : 'border-ink-100 bg-paper-warm text-ink-500 hover:border-ink-200 hover:text-ink-700'
      } ${className}`}
    >
      <HelpCircle className="h-3 w-3" />
      <span className="hidden md:inline">{helpMode ? 'Help mode on' : 'Help mode'}</span>
    </button>
  );
}
