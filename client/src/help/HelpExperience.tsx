import { useLayoutEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  HelpCircle,
  MousePointerClick,
  X,
} from 'lucide-react';
import { useHelp } from './useHelp';

function HelpModeCaptureLayer() {
  const { helpMode, inspectPoint } = useHelp();
  if (!helpMode) return null;

  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  return (
    <div
      data-help-ignore
      data-help-overlay
      className="fixed inset-0 z-[35]"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        stop(event.nativeEvent);
        inspectPoint(event.clientX, event.clientY);
      }}
      onClick={(event) => {
        stop(event.nativeEvent);
      }}
      onContextMenu={(event) => {
        stop(event.nativeEvent);
      }}
    />
  );
}

function HelpModeBanners() {
  const { helpMode, exitHelpMode } = useHelp();
  if (!helpMode) return null;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className="fixed top-14 left-0 right-0 z-40 border-b border-sage-300 bg-sage-100/95 backdrop-blur px-4 py-2"
        data-help-ignore
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="flex items-center gap-2 text-xs font-medium text-sage-900">
            <MousePointerClick className="h-3.5 w-3.5" />
            Help mode is on. Click any labeled UI region for contextual guidance.
          </p>
          <button
            type="button"
            onClick={exitHelpMode}
            className="inline-flex items-center gap-1 rounded-pill border border-sage-300 bg-sage-200 px-2 py-1 text-xs font-medium text-sage-800 hover:bg-sage-300"
          >
            <X className="h-3 w-3" />
            Exit
          </button>
        </div>
      </div>

      <div
        className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-pill border border-sage-300 bg-sage-100/95 px-3 py-1.5 text-[11px] font-mono text-sage-900 shadow-card"
        data-help-ignore
      >
        Esc to exit help mode
      </div>
    </>
  );
}

function HelpSelectionOutline() {
  const { helpMode, activeHelp } = useHelp();
  if (!helpMode || !activeHelp) return null;

  const { left, top, width, height } = activeHelp.anchorRect;
  if (width <= 0 || height <= 0) return null;

  return (
    <div
      data-help-ignore
      aria-hidden="true"
      className="fixed z-[38] pointer-events-none rounded-md border-2 border-dashed border-sage-500 shadow-[0_0_0_9999px_rgba(0,0,0,0.02)]"
      style={{
        left: `${Math.max(0, left - 3)}px`,
        top: `${Math.max(0, top - 3)}px`,
        width: `${Math.max(6, width + 6)}px`,
        height: `${Math.max(6, height + 6)}px`,
      }}
    />
  );
}

function ContextHelpPopover() {
  const { activeHelp, closeActiveHelp, openManual } = useHelp();
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  useLayoutEffect(() => {
    if (!activeHelp || !panelRef.current) return;

    const panel = panelRef.current;
    const margin = 12;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const { anchorRect } = activeHelp;

    let left = anchorRect.left + anchorRect.width / 2 - width / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));

    let top = anchorRect.bottom + 10;
    if (top + height > window.innerHeight - margin) {
      top = anchorRect.top - height - 10;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - height - margin));

    setPosition({ top, left });
  }, [activeHelp]);

  if (!activeHelp) return null;

  return (
    <div
      ref={panelRef}
      data-help-ignore
      data-help-popover
      role="dialog"
      aria-label={activeHelp.entry.title}
      className="fixed z-[90] w-[min(22rem,calc(100vw-1.5rem))] rounded-card border border-ink-200 bg-paper shadow-modal"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
    >
      <div className="flex items-start justify-between gap-2 border-b border-ink-100 px-3 py-2.5">
        <div className="flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5 text-sage-600" />
          <h3 className="text-xs font-semibold text-ink-800">{activeHelp.entry.title}</h3>
        </div>
        <button
          type="button"
          onClick={closeActiveHelp}
          aria-label="Close contextual help"
          className="rounded p-0.5 text-ink-400 hover:bg-ink-50 hover:text-ink-600"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-2 px-3 py-2.5">
        <p className="text-xs leading-relaxed text-ink-700">{activeHelp.entry.body}</p>
        {activeHelp.entry.details && (
          <p className="text-xs leading-relaxed text-ink-500">{activeHelp.entry.details}</p>
        )}
      </div>

      {activeHelp.entry.manualSection && (
        <div className="border-t border-ink-100 px-3 py-2.5">
          <button
            type="button"
            onClick={() => openManual(activeHelp.entry.manualSection)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-sage-700 hover:text-sage-800"
          >
            <BookOpen className="h-3.5 w-3.5" />
            Open manual section
          </button>
        </div>
      )}
    </div>
  );
}

function FloatingHelpControl() {
  const {
    collapsed,
    setCollapsed,
    helpMode,
    toggleHelpMode,
    openManual,
  } = useHelp();

  if (collapsed && !helpMode) {
    return (
      <div className="fixed bottom-5 right-5 z-[95]" data-help-ignore>
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          aria-label="Expand help controls"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-ink-200 bg-paper text-ink-500 shadow-card hover:text-ink-700 hover:shadow-card-hover"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-[95]" data-help-ignore>
      <div className="flex items-center gap-1 rounded-pill border border-ink-200 bg-paper p-1 shadow-card-hover">
        <button
          type="button"
          onClick={toggleHelpMode}
          className={`inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-medium transition-colors ${
            helpMode
              ? 'bg-sage-600 text-white'
              : 'text-ink-700 hover:bg-ink-50'
          }`}
          aria-pressed={helpMode}
          aria-label={helpMode ? 'Exit help mode' : 'Enter help mode'}
        >
          <HelpCircle className="h-3.5 w-3.5" />
          {helpMode ? 'Help Mode On' : 'Help Mode'}
        </button>

        <button
          type="button"
          onClick={() => openManual()}
          className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1.5 text-xs text-ink-600 hover:bg-ink-50"
          aria-label="Open manual"
          title="Open manual"
        >
          <BookOpen className="h-3.5 w-3.5" />
          Manual
        </button>

        {!helpMode && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            aria-label="Collapse help controls"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-400 hover:bg-ink-50 hover:text-ink-700"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function HelpExperience() {
  return (
    <>
      <HelpModeCaptureLayer />
      <HelpSelectionOutline />
      <HelpModeBanners />
      <ContextHelpPopover />
      <FloatingHelpControl />
    </>
  );
}
