import {
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { HelpContext } from './helpContext';
import { FALLBACK_HELP_ENTRY } from './helpContentMap';
import { resolveHelpTarget } from './helpResolver';
import type { ActiveHelpState, HelpEntry } from './helpTypes';

interface HelpProviderProps {
  children: ReactNode;
  onOpenManual: (sectionId?: string) => void;
}

const COLLAPSE_STORAGE_KEY = 'seedbank.help.collapsed';

function pointRect(x: number, y: number): DOMRect {
  return new DOMRect(x - 1, y - 1, 2, 2);
}

export function HelpProvider({ children, onOpenManual }: HelpProviderProps) {
  const [helpMode, setHelpModeState] = useState(false);
  const [activeHelp, setActiveHelp] = useState<ActiveHelpState | null>(null);
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
  });

  const openHelpAtRect = useCallback((id: string, entry: HelpEntry, anchorRect: DOMRect) => {
    setActiveHelp({ id, entry, anchorRect });
  }, []);

  const inspectPoint = useCallback((x: number, y: number) => {
    const target = document
      .elementsFromPoint(x, y)
      .find((element) =>
        element instanceof HTMLElement
        && !element.closest('[data-help-ignore]')
        && !element.hasAttribute('data-help-overlay'),
      );

    if (!(target instanceof HTMLElement)) {
      setActiveHelp({
        id: 'fallback',
        entry: FALLBACK_HELP_ENTRY,
        anchorRect: pointRect(x, y),
      });
      return;
    }

    const resolved = resolveHelpTarget(target);
    const anchorRect = resolved
      ? resolved.element.getBoundingClientRect()
      : pointRect(x, y);
    const id = resolved?.id ?? 'fallback';
    const entry = resolved?.entry ?? FALLBACK_HELP_ENTRY;
    setActiveHelp({ id, entry, anchorRect });
  }, []);

  const closeActiveHelp = useCallback(() => setActiveHelp(null), []);

  const setHelpMode = useCallback((next: boolean) => {
    setHelpModeState(next);
    if (next) {
      setCollapsedState(false);
      return;
    }
    setActiveHelp(null);
  }, []);

  const toggleHelpMode = useCallback(() => {
    setHelpModeState((prev) => {
      const next = !prev;
      if (next) {
        setCollapsedState(false);
      } else {
        setActiveHelp(null);
      }
      return next;
    });
  }, []);

  const exitHelpMode = useCallback(() => {
    setHelpModeState(false);
    setActiveHelp(null);
  }, []);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
  }, []);

  const openManual = useCallback(
    (sectionId?: string) => {
      setHelpModeState(false);
      setActiveHelp(null);
      onOpenManual(sectionId);
    },
    [onOpenManual],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  useEffect(() => {
    document.body.classList.toggle('help-mode-active', helpMode);
    return () => {
      document.body.classList.remove('help-mode-active');
    };
  }, [helpMode]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (helpMode) {
        event.preventDefault();
        exitHelpMode();
        return;
      }
      if (activeHelp) {
        setActiveHelp(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [helpMode, activeHelp, exitHelpMode]);

  useEffect(() => {
    if (!helpMode) return;

    const isIgnored = (target: EventTarget | null) =>
      target instanceof HTMLElement && target.closest('[data-help-ignore]');
    const onKeyDownCapture = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'Tab') return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || isIgnored(target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (event.key === 'Enter' || event.key === ' ') {
        const rect = target.getBoundingClientRect();
        inspectPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => {
      window.removeEventListener('keydown', onKeyDownCapture, true);
    };
  }, [helpMode, inspectPoint]);

  const value = useMemo(
    () => ({
      helpMode,
      setHelpMode,
      toggleHelpMode,
      exitHelpMode,

      collapsed,
      setCollapsed,

      activeHelp,
      closeActiveHelp,
      openHelpAtRect,
      inspectPoint,

      openManual,
    }),
    [
      helpMode,
      setHelpMode,
      toggleHelpMode,
      exitHelpMode,
      collapsed,
      setCollapsed,
      activeHelp,
      closeActiveHelp,
      openHelpAtRect,
      inspectPoint,
      openManual,
    ],
  );

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}
