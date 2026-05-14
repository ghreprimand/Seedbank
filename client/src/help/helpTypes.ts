export interface HelpEntry {
  title: string;
  body: string;
  details?: string;
  manualSection?: string;
}

export interface ResolvedHelpTarget {
  id: string;
  entry: HelpEntry;
  element: HTMLElement;
}

export interface ActiveHelpState {
  id: string;
  entry: HelpEntry;
  anchorRect: DOMRect;
}
