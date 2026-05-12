/**
 * HelpContext instance and value type.
 * Plain .ts (no JSX) so react-refresh rules don't complain.
 */
import { createContext } from 'react';

export interface HelpContextValue {
  /** True when the user has activated Help Mode. */
  helpMode: boolean;
  toggleHelpMode: () => void;
  /** Open the manual modal, optionally jumping to a section. */
  openManual: (sectionId?: string) => void;
}

export const HelpContext = createContext<HelpContextValue>({
  helpMode: false,
  toggleHelpMode: () => {},
  openManual: () => {},
});
