/**
 * Zustand settings store — single source of truth for all user preferences
 * and server configuration.
 *
 * Hydrates via GET /api/settings on boot (called once; subsequent navigation
 * reads from store). Falls back to localStorage for ui.theme when offline so
 * the theme always applies. All other sections fall back to safe defaults.
 *
 * Write-through: any successful PATCH /api/settings/ui mirrors the resolved
 * theme prefs to localStorage so the pre-paint bootstrap in main.tsx picks up
 * the correct value on next cold boot.
 *
 * Offline flag: `state.offline === true` when the initial hydration (and any
 * subsequent server call) failed. Tabs should show a sage-toned hint.
 */
import { create } from 'zustand';
import type { AggregateSettings, ThemeName } from '@/lib/types';
import {
  getAggregateSettings,
  patchSettings,
  type SettingsSection,
} from '@/api/client';
import {
  readThemePrefs,
  writeThemePrefs,
  applyTheme,
  resolveThemeName,
  migrateThemeName,
  VALID_THEME_NAMES,
} from '@/theme/themeUtils';

// ── Safe defaults (used when offline and no store data yet) ──────────────────

const DEFAULT_SETTINGS: AggregateSettings = {
  ui: {
    theme: { name: 'paper', matchSystem: false },
  },
  ai: {
    provider: 'openai',
    openaiModel: 'gpt-4o',
    anthropicModel: 'claude-opus-4-5',
    ollamaModel: 'llama3.2',
    ollamaBaseUrl: 'http://localhost:11434',
    dailyTokenBudget: 50000,
    hasOpenAIKey: false,
    hasAnthropicKey: false,
  },
  api: {
    tokens: [],
    webhooks: { url: null, events: [] },
  },
  agents: { claudeLinked: false, codexLinked: false },
  backups: {
    config: { frequency: 'daily', exportJson: true },
    lastRun: null,
    latestDatabaseBackup: null,
    latestJsonExport: null,
    paths: { backupsDir: '', exportsDir: '' },
  },
  integrations: [],
  server: { port: 4800, version: '0.0.0', uptimeMs: 0, dbPath: '' },
};

// ── Store shape ───────────────────────────────────────────────────────────────

interface SettingsStore {
  /** The full aggregate settings object, or null while loading. */
  data: AggregateSettings | null;
  /** True once the initial load has completed (successfully or offline). */
  loaded: boolean;
  /** True when the server was unreachable during the last fetch attempt. */
  offline: boolean;

  /**
   * Hydrate the store from GET /api/settings.
   * Called once on app boot (idempotent — skips if already loaded).
   */
  hydrate: () => Promise<void>;

  /**
   * Patch a settings section. Calls PATCH /api/settings/:section.
   * On success, updates the full store with the returned aggregate.
   * If offline and section === 'ui', writes the theme prefs to localStorage only
   * and updates the in-memory store without a server round-trip.
   */
  patch: (section: SettingsSection, body: unknown) => Promise<void>;

  /**
   * Force a full re-hydrate even if already loaded. Useful after
   * a backup run or integration configure that changes server state.
   */
  refresh: () => Promise<void>;
}

// ── Store implementation ──────────────────────────────────────────────────────

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  data: null,
  loaded: false,
  offline: false,

  hydrate: async () => {
    if (get().loaded) return; // already loaded
    return get().refresh();
  },

  refresh: async () => {
    try {
      const data = await getAggregateSettings();

      // Migrate any legacy theme name the server may still return (e.g. 'loam' → 'peat').
      // This is belt-and-suspenders alongside the server-side migration — the client
      // must never store an invalid/legacy name in Zustand because ThemeTab reads the
      // store directly to determine which card is active.
      let resolvedData = data;
      if (data.ui?.theme) {
        const rawName = data.ui.theme.name as string;
        const migratedName: ThemeName = migrateThemeName(rawName);
        if (migratedName !== rawName) {
          resolvedData = {
            ...data,
            ui: { ...data.ui, theme: { ...data.ui.theme, name: migratedName } },
          };
        }
      }

      set({ data: resolvedData, loaded: true, offline: false });

      // Write-through: mirror ui.theme to localStorage so pre-paint bootstrap
      // is correct even if the server is down on next cold boot.
      // Also apply to the DOM immediately so live sessions don't need a reload.
      if (resolvedData.ui?.theme) {
        const prefs = {
          name: (VALID_THEME_NAMES as readonly string[]).includes(resolvedData.ui.theme.name)
            ? (resolvedData.ui.theme.name as ThemeName)
            : 'paper',
          matchSystem: resolvedData.ui.theme.matchSystem,
        };
        writeThemePrefs(prefs);
        applyTheme(resolveThemeName(prefs));
      }
    } catch {
      // Offline — build best-effort state from localStorage
      const localPrefs = readThemePrefs();
      set((s) => ({
        data: s.data ?? {
          ...DEFAULT_SETTINGS,
          ui: { theme: { name: localPrefs.name, matchSystem: localPrefs.matchSystem } },
        },
        loaded: true,
        offline: true,
      }));
    }
  },

  patch: async (section, body) => {
    const { offline, data } = get();

    // When offline and patching ui.theme, apply locally without a server call.
    if (offline && section === 'ui') {
      const uiPatch = body as { theme?: Partial<AggregateSettings['ui']['theme']> };
      if (uiPatch.theme && data) {
        const merged = { ...data.ui.theme, ...uiPatch.theme };
        writeThemePrefs({
          name: (VALID_THEME_NAMES as readonly string[]).includes(merged.name)
            ? (merged.name as ThemeName)
            : 'paper',
          matchSystem: merged.matchSystem,
        });
        set({ data: { ...data, ui: { theme: merged } } });
      }
      return;
    }

    // Online path — call server, replace full aggregate.
    try {
      const next = await patchSettings(section, body);
      set({ data: next, offline: false });

      // Write-through for ui.theme
      if (section === 'ui' && next.ui?.theme) {
        writeThemePrefs({
          name: (VALID_THEME_NAMES as readonly string[]).includes(next.ui.theme.name)
            ? (next.ui.theme.name as ThemeName)
            : 'paper',
          matchSystem: next.ui.theme.matchSystem,
        });
      }
    } catch (err) {
      // If it was an offline error on ui, fall back to localStorage write.
      if (section === 'ui') {
        const uiPatch = body as { theme?: Partial<AggregateSettings['ui']['theme']> };
        if (uiPatch.theme && data) {
          const merged = { ...data.ui.theme, ...uiPatch.theme };
          writeThemePrefs({
            name: (VALID_THEME_NAMES as readonly string[]).includes(merged.name)
              ? (merged.name as ThemeName)
              : 'paper',
            matchSystem: merged.matchSystem,
          });
          set({ data: { ...data, ui: { theme: merged } }, offline: true });
          return;
        }
      }
      throw err;
    }
  },
}));

// ── Section selectors ─────────────────────────────────────────────────────────

export const useUiSettings = () =>
  useSettingsStore((s) => s.data?.ui ?? DEFAULT_SETTINGS.ui);

export const useAiSettings = () =>
  useSettingsStore((s) => s.data?.ai ?? DEFAULT_SETTINGS.ai);

export const useApiSettings = () =>
  useSettingsStore((s) => s.data?.api ?? DEFAULT_SETTINGS.api);

export const useAgentsSettings = () =>
  useSettingsStore((s) => s.data?.agents ?? DEFAULT_SETTINGS.agents);

export const useBackupsSettings = () =>
  useSettingsStore((s) => s.data?.backups ?? DEFAULT_SETTINGS.backups);

export const useIntegrationsSettings = () =>
  useSettingsStore((s) => s.data?.integrations ?? DEFAULT_SETTINGS.integrations);

export const useServerInfo = () =>
  useSettingsStore((s) => s.data?.server ?? DEFAULT_SETTINGS.server);

export const useSettingsOffline = () => useSettingsStore((s) => s.offline);
