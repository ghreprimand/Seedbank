import { useContext } from 'react';
import { HelpContext, type HelpContextValue } from './helpContext';

export function useHelp(): HelpContextValue {
  return useContext(HelpContext);
}
