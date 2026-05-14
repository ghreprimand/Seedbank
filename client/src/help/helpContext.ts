import { createContext } from 'react';
import type { ActiveHelpState, HelpEntry } from './helpTypes';

export interface HelpContextValue {
  helpMode: boolean;
  setHelpMode: (next: boolean) => void;
  toggleHelpMode: () => void;
  exitHelpMode: () => void;

  collapsed: boolean;
  setCollapsed: (next: boolean) => void;
  toggleCollapsed: () => void;

  activeHelp: ActiveHelpState | null;
  closeActiveHelp: () => void;
  openHelpAtRect: (id: string, entry: HelpEntry, anchorRect: DOMRect) => void;

  openManual: (sectionId?: string) => void;
}

export const HelpContext = createContext<HelpContextValue>({
  helpMode: false,
  setHelpMode: () => {},
  toggleHelpMode: () => {},
  exitHelpMode: () => {},

  collapsed: false,
  setCollapsed: () => {},
  toggleCollapsed: () => {},

  activeHelp: null,
  closeActiveHelp: () => {},
  openHelpAtRect: () => {},

  openManual: () => {},
});
