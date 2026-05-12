/**
 * HelpProvider — wraps the app and manages help-mode state.
 * Context definition is in helpContext.ts (separate file, no JSX).
 * Hook is in useHelp.ts.
 */
import { useState, useCallback, type ReactNode } from 'react';
import { HelpContext } from './helpContext';

interface HelpProviderProps {
  children: ReactNode;
  onOpenManual: (sectionId?: string) => void;
}

export function HelpProvider({ children, onOpenManual }: HelpProviderProps) {
  const [helpMode, setHelpMode] = useState(false);

  const toggleHelpMode = useCallback(() => setHelpMode((v) => !v), []);
  const openManual = useCallback(
    (sectionId?: string) => onOpenManual(sectionId),
    [onOpenManual],
  );

  return (
    <HelpContext.Provider value={{ helpMode, toggleHelpMode, openManual }}>
      {children}
    </HelpContext.Provider>
  );
}
