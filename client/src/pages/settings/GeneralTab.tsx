/** Settings → General: import/export and keyboard shortcuts. */
import { useState, useCallback } from 'react';
import { ArrowUpDown, Keyboard } from 'lucide-react';
import ImportExportModal from '@/components/ImportExportModal';
import ShortcutRecorder from '@/components/ShortcutRecorder';
import { useNavigate } from 'react-router-dom';
import { HelpButton } from '@/help/HelpPopover';
import { useSettingsStore } from '@/stores/settings';
import { bindingLabel, DEFAULT_SHORTCUTS } from '@/lib/shortcuts';
import { patchSettings } from '@/api/client';
import type { ShortcutBinding, ShortcutConfig } from '@/lib/types';

// ── Action metadata ───────────────────────────────────────────────────────────

type ActionId = keyof ShortcutConfig;
const EMPTY_SHORTCUTS: ShortcutConfig = {};

const ACTIONS: { id: ActionId; label: string; description: string }[] = [
  {
    id: 'focusSearch',
    label: 'Focus search',
    description: 'Moves focus to the search bar.',
  },
  {
    id: 'openQuickCapture',
    label: 'Open quick capture',
    description: 'Opens the quick idea capture modal.',
  },
  {
    id: 'openManual',
    label: 'Open manual',
    description: 'Opens the in-app manual.',
  },
];

// ── Conflict detection ────────────────────────────────────────────────────────

function findConflict(
  targetId: ActionId,
  binding: ShortcutBinding,
  effective: Record<ActionId, ShortcutBinding>,
): string | null {
  for (const action of ACTIONS) {
    if (action.id === targetId) continue;
    const other = effective[action.id];
    if (
      other.key.toLowerCase() === binding.key.toLowerCase() &&
      !!other.ctrl  === !!binding.ctrl  &&
      !!other.alt   === !!binding.alt   &&
      !!other.shift === !!binding.shift &&
      !!other.meta  === !!binding.meta
    ) {
      return action.label;
    }
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GeneralTab() {
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const navigate = useNavigate();

  const storedShortcuts = useSettingsStore((s) => s.data?.ui?.shortcuts ?? EMPTY_SHORTCUTS);
  const refreshSettings = useSettingsStore((s) => s.refresh);

  // Effective bindings: stored overrides merged over defaults
  const effective: Record<ActionId, ShortcutBinding> = {
    focusSearch:      storedShortcuts.focusSearch      ?? DEFAULT_SHORTCUTS.focusSearch,
    openQuickCapture: storedShortcuts.openQuickCapture ?? DEFAULT_SHORTCUTS.openQuickCapture,
    openManual:       storedShortcuts.openManual       ?? DEFAULT_SHORTCUTS.openManual,
  };

  const saveBinding = useCallback(async (id: ActionId, binding: ShortcutBinding | null) => {
    setSaving(true);
    setSaveError(null);
    try {
      // null = reset to default (server removes the stored override)
      await patchSettings('ui', { shortcuts: { [id]: binding } });
      await refreshSettings();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Could not save shortcut.');
    } finally {
      setSaving(false);
    }
  }, [refreshSettings]);

  return (
    <div className="space-y-8" data-help="settings-general-data">
      {/* Import / Export */}
      <section data-help="settings-general-data">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-serif font-semibold text-ink-800">Data</h3>
          <HelpButton
            helpId="general-data"
            title="Import & Export"
            summary="Export your full idea archive as JSON (machine-readable, includes version history) or Markdown (human-readable). Both formats can be imported back."
            details="JSON is the safest format for backups and migration. Markdown is readable in any text editor or shareable with others."
            manualSection="import-export"
            alwaysShow
          />
        </div>
        <p className="text-sm text-ink-400 mb-4">
          Export your entire idea archive or import from a previous export.
        </p>
        <button
          onClick={() => setImportExportOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium
                     bg-paper border border-ink-200 hover:border-sage-300 hover:bg-sage-50
                     text-ink-700 rounded-card shadow-card hover:shadow-card-hover
                     transition-all duration-200"
        >
          <ArrowUpDown className="w-4 h-4" />
          Import &amp; Export
        </button>
      </section>

      {/* Keyboard shortcuts */}
      <section data-help="settings-general-shortcuts">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-serif font-semibold text-ink-800 flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-ink-400" />
            Keyboard shortcuts
          </h3>
          <HelpButton
            helpId="general-shortcuts"
            title="Keyboard Shortcuts"
            summary="Click any binding to record a new key combination. Esc is always reserved for closing modals and cannot be changed."
            details="Modifier keys (Ctrl, Alt, ⌘) can be combined with any letter or number. Bindings with modifiers work even while typing in a field. Plain-key bindings (no modifiers) only fire when no input is focused."
            manualSection="settings-general"
            alwaysShow
          />
        </div>
        <p className="text-sm text-ink-400 mb-4">
          Click a binding to record a new key. Esc always closes modals and cannot be reassigned.
        </p>

        <div className="divide-y divide-ink-100 border border-ink-100 rounded-card overflow-hidden">
          {ACTIONS.map((action) => {
            const binding = effective[action.id];
            const isDefault = !storedShortcuts[action.id];
            const conflict = findConflict(action.id, binding, effective);

            return (
              <div
                key={action.id}
                className="flex items-center justify-between gap-4 px-4 py-3 bg-paper"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium text-ink-700">{action.label}</div>
                  <div className="text-xs text-ink-400 mt-0.5">{action.description}</div>
                </div>
                <div className="shrink-0">
                  <ShortcutRecorder
                    value={binding}
                    isDefault={isDefault}
                    onChange={(newBinding) => { void saveBinding(action.id, newBinding); }}
                    onReset={() => { void saveBinding(action.id, null); }}
                    conflict={conflict ?? undefined}
                    disabled={saving}
                  />
                </div>
              </div>
            );
          })}

          {/* Reserved / fixed shortcut — always shown last */}
          <div className="flex items-center justify-between gap-4 px-4 py-3 bg-paper-warm/40">
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink-500">Close modal / blur search</div>
              <div className="text-xs text-ink-400 mt-0.5">Always reserved — cannot be changed.</div>
            </div>
            <div className="shrink-0 flex items-center gap-2">
              <kbd className="px-2 py-0.5 text-[11px] font-mono bg-paper border border-ink-200 text-ink-400 rounded shadow-sm">
                Esc
              </kbd>
              <span className="text-[10px] text-ink-400 font-mono">reserved</span>
            </div>
          </div>
        </div>

        {saveError && (
          <p className="mt-2 text-xs text-red-600">{saveError}</p>
        )}
        {saving && (
          <p className="mt-2 text-xs text-ink-400 font-mono">Saving…</p>
        )}

        {/* Quick reference of current bindings */}
        <p className="mt-3 text-xs text-ink-400">
          Active:{' '}
          {ACTIONS.map((a) => `${a.label} → ${bindingLabel(effective[a.id])}`).join(' · ')}
        </p>
      </section>

      {importExportOpen && (
        <ImportExportModal
          onClose={() => setImportExportOpen(false)}
          onImported={() => {
            setImportExportOpen(false);
            navigate('/');
          }}
        />
      )}
    </div>
  );
}
