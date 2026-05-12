/**
 * Settings page — left-rail tabbed shell.
 *
 * Routes: /settings  →  /settings/general (default redirect)
 *         /settings/:tab
 *
 * Left rail tabs: General, AI & Agents, Theme, API & Server, Backups,
 *                 Integrations, About.
 *
 * Each tab body is a separate component under ./settings/.
 */
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  Settings as SettingsIcon,
  Bot,
  Palette,
  Server,
  Archive,
  Plug,
  Info,
} from 'lucide-react';
import GeneralTab from './settings/GeneralTab';
import AiAgentsTab from './settings/AiAgentsTab';
import ThemeTab from './settings/ThemeTab';
import ApiServerTab from './settings/ApiServerTab';
import BackupsTab from './settings/BackupsTab';
import IntegrationsTab from './settings/IntegrationsTab';
import AboutTab from './settings/AboutTab';

interface TabDef {
  id: string;
  label: string;
  kicker: string;
  icon: React.ElementType;
  component: React.ComponentType;
}

const TABS: TabDef[] = [
  {
    id: 'general',
    label: 'General',
    kicker: 'Data, import / export, keyboard shortcuts',
    icon: SettingsIcon,
    component: GeneralTab,
  },
  {
    id: 'ai-agents',
    label: 'AI & Agents',
    kicker: 'Provider connections, agent linking, token budget',
    icon: Bot,
    component: AiAgentsTab,
  },
  {
    id: 'theme',
    label: 'Theme',
    kicker: 'Color palette, appearance, system preference',
    icon: Palette,
    component: ThemeTab,
  },
  {
    id: 'api',
    label: 'API & Server',
    kicker: 'Server info, personal access tokens, webhooks',
    icon: Server,
    component: ApiServerTab,
  },
  {
    id: 'backups',
    label: 'Backups',
    kicker: 'Schedule, paths, manual backup',
    icon: Archive,
    component: BackupsTab,
  },
  {
    id: 'integrations',
    label: 'Integrations',
    kicker: 'Archon, generic project root, graduation paths',
    icon: Plug,
    component: IntegrationsTab,
  },
  {
    id: 'about',
    label: 'About',
    kicker: 'Version, source, acknowledgements',
    icon: Info,
    component: AboutTab,
  },
];

export default function Settings() {
  const { tab } = useParams<{ tab: string }>();
  const navigate = useNavigate();

  // Default to "general" when no tab param is present
  if (!tab) return <Navigate to="/settings/general" replace />;

  const active = TABS.find((t) => t.id === tab) ?? TABS[0];
  const ActiveComponent = active.component;

  return (
    <div className="animate-fade-in">
      {/* Page heading */}
      <div className="mb-6">
        <h1 className="text-2xl font-serif font-semibold text-ink-900">Settings</h1>
        <p className="text-[11px] font-mono uppercase tracking-widest text-ink-400 mt-1">
          Seedbank preferences and configuration
        </p>
      </div>

      <div className="flex gap-8 items-start">
        {/* ── Left rail ──────────────────────────────────── */}
        <nav
          aria-label="Settings sections"
          className="shrink-0 w-44 space-y-0.5"
        >
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.id === active.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => navigate(`/settings/${t.id}`)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-card text-left
                            transition-all duration-150 text-sm ${
                  isActive
                    ? 'bg-sage-50 text-sage-700 border-l-2 border-sage-500 font-medium'
                    : 'text-ink-500 hover:text-ink-700 hover:bg-ink-50 border-l-2 border-transparent'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </nav>

        {/* ── Content pane ───────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="mb-5 pb-4 border-b border-ink-100">
            <h2 className="text-xl font-serif font-semibold text-ink-900">{active.label}</h2>
            <p className="text-[11px] font-mono uppercase tracking-widest text-ink-400 mt-0.5">
              {active.kicker}
            </p>
          </div>
          <ActiveComponent />
        </div>
      </div>
    </div>
  );
}
