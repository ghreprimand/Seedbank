/**
 * Theme utility types and helpers shared between ThemeTab and main.tsx.
 * Kept in a separate file so ThemeTab only exports components (fast-refresh rule).
 */

export type ThemeName = 'paper' | 'parchment' | 'meadow' | 'dusk' | 'loam' | 'moss';

export const THEME_STORAGE_KEY = 'seedbank.ui.theme';

export const VALID_THEME_NAMES: readonly ThemeName[] = [
  'paper', 'parchment', 'meadow', 'dusk', 'loam', 'moss',
];

export interface ThemePrefs {
  name: ThemeName;
  matchSystem: boolean;
}

export function readThemePrefs(): ThemePrefs {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ThemePrefs;
  } catch { /* ignore */ }
  return { name: 'paper', matchSystem: false };
}

export function writeThemePrefs(prefs: ThemePrefs): void {
  localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(prefs));
}

export function resolveThemeName(prefs: ThemePrefs): ThemeName {
  if (!prefs.matchSystem) return prefs.name;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'loam' : 'paper';
}

export function applyTheme(name: ThemeName): void {
  document.documentElement.dataset.theme = name;
}

/** Read the theme currently applied to <html data-theme>. */
export function currentAppliedTheme(): ThemeName {
  const v = document.documentElement.dataset.theme;
  return (VALID_THEME_NAMES as readonly string[]).includes(v ?? '')
    ? (v as ThemeName)
    : 'paper';
}
