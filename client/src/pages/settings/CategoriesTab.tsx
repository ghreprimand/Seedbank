/**
 * Settings → Categories
 *
 * Manage the taxonomy of idea categories: add, rename, recolor, reorder,
 * archive, and delete. Built-in categories can be renamed or archived but
 * not permanently deleted. Custom categories can be deleted only when no
 * ideas use them; otherwise the user must first reassign affected ideas.
 */
import { useState, useEffect, useRef } from 'react';
import {
  Plus,
  Pencil,
  Check,
  X,
  Trash2,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from 'lucide-react';
import type { CategoryDefinition } from '@/lib/types';
import { useCategoriesSettings, useSettingsStore } from '@/stores/settings';
import { getStats } from '@/api/client';
import { HelpButton } from '@/help/HelpPopover';

// ── Preset badge colors ───────────────────────────────────────────────────────

const PRESET_COLORS: { value: string; label: string }[] = [
  { value: '#6b7280', label: 'Slate' },
  { value: '#059669', label: 'Green' },
  { value: '#0284c7', label: 'Blue' },
  { value: '#7c3aed', label: 'Violet' },
  { value: '#db2777', label: 'Pink' },
  { value: '#d97706', label: 'Amber' },
  { value: '#dc2626', label: 'Red' },
  { value: '#0891b2', label: 'Cyan' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface ColorSwatchProps {
  selected: string | undefined;
  onChange: (color: string | undefined) => void;
}

function ColorSwatch({ selected, onChange }: ColorSwatchProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {/* No-color option */}
      <button
        type="button"
        title="Default color"
        onClick={() => onChange(undefined)}
        className={`w-5 h-5 rounded-full border-2 bg-paper transition-colors ${
          !selected ? 'border-sage-500' : 'border-ink-200 hover:border-ink-300'
        }`}
      />
      {PRESET_COLORS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          title={label}
          onClick={() => onChange(value)}
          style={{ backgroundColor: value }}
          className={`w-5 h-5 rounded-full border-2 transition-colors ${
            selected === value ? 'border-ink-900 scale-110' : 'border-transparent hover:scale-105'
          }`}
        />
      ))}
    </div>
  );
}

// ── AddCategoryForm ──────────────────────────────────────────────────────────

interface AddCategoryFormProps {
  existingIds: Set<string>;
  onAdd: (def: Omit<CategoryDefinition, 'sortOrder' | 'builtIn'>) => void;
  onCancel: () => void;
}

function AddCategoryForm({ existingIds, onAdd, onCancel }: AddCategoryFormProps) {
  const [label, setLabel] = useState('');
  const [color, setColor] = useState<string | undefined>(undefined);
  const [icon, setIcon] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const candidateId = slugify(label);
  const duplicate = candidateId && existingIds.has(candidateId);
  const canSave = label.trim().length > 0 && !duplicate;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSave) return;
    onAdd({
      id: candidateId,
      label: label.trim(),
      color: color || undefined,
      icon: icon.trim() || undefined,
      archived: false,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-card border border-sage-200 bg-sage-50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label className="block text-[11px] font-medium text-ink-400 uppercase tracking-wider mb-1 font-mono">
            Category name
          </label>
          <input
            ref={inputRef}
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Hardware Project"
            maxLength={50}
            className="w-full px-3 py-2 bg-paper border border-ink-200 rounded-card text-sm
                       focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                       text-ink-900 placeholder:text-ink-300"
          />
          {duplicate && (
            <p className="mt-1 text-[11px] text-amber-600 font-mono">
              ID <code>{candidateId}</code> already exists — choose a different name.
            </p>
          )}
          {candidateId && !duplicate && (
            <p className="mt-1 text-[11px] text-ink-300 font-mono">ID: {candidateId}</p>
          )}
        </div>
        <div className="shrink-0">
          <label className="block text-[11px] font-medium text-ink-400 uppercase tracking-wider mb-1 font-mono">
            Icon
          </label>
          <input
            type="text"
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="🌱"
            maxLength={4}
            className="w-16 px-2 py-2 bg-paper border border-ink-200 rounded-card text-lg text-center
                       focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300"
          />
        </div>
      </div>

      <div>
        <label className="block text-[11px] font-medium text-ink-400 uppercase tracking-wider mb-1.5 font-mono">
          Badge color
        </label>
        <ColorSwatch selected={color} onChange={setColor} />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={!canSave}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-sage-600 text-paper
                     rounded-card hover:bg-sage-700 disabled:opacity-40 disabled:cursor-not-allowed
                     transition-colors"
        >
          <Check className="w-3.5 h-3.5" />
          Add category
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-3 py-1.5 text-sm text-ink-500 hover:text-ink-700 hover:bg-ink-50
                     rounded-card transition-colors border border-ink-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ── CategoryRow ──────────────────────────────────────────────────────────────

interface CategoryRowProps {
  def: CategoryDefinition;
  index: number;
  total: number;
  usageCount: number;
  onUpdate: (updated: CategoryDefinition) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  onDelete: (id: string, label: string, usageCount: number) => void;
}

function CategoryRow({
  def,
  index,
  total,
  usageCount,
  onUpdate,
  onMove,
  onArchive,
  onRestore,
  onDelete,
}: CategoryRowProps) {
  const [editing, setEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(def.label);
  const [editIcon, setEditIcon] = useState(def.icon ?? '');
  const [editColor, setEditColor] = useState<string | undefined>(def.color);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = () => {
    setEditLabel(def.label);
    setEditIcon(def.icon ?? '');
    setEditColor(def.color);
    setEditing(true);
    setShowColorPicker(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const cancelEdit = () => {
    setEditing(false);
    setShowColorPicker(false);
  };

  const saveEdit = () => {
    if (!editLabel.trim()) return;
    onUpdate({
      ...def,
      label: editLabel.trim(),
      icon: editIcon.trim() || undefined,
      color: editColor,
    });
    setEditing(false);
    setShowColorPicker(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') { e.preventDefault(); saveEdit(); }
    if (e.key === 'Escape') cancelEdit();
  };

  const badgeStyle: React.CSSProperties = def.color ? { borderColor: def.color, color: def.color } : {};

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-card border transition-colors ${
        def.archived
          ? 'bg-ink-50 border-ink-100 opacity-60'
          : 'bg-paper border-ink-100 hover:border-ink-200'
      }`}
    >
      {/* Drag handle / reorder */}
      <div className="flex flex-col gap-0.5 shrink-0">
        <button
          type="button"
          onClick={() => onMove(index, 'up')}
          disabled={index === 0}
          aria-label="Move up"
          className="text-ink-300 hover:text-ink-500 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronUp className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={() => onMove(index, 'down')}
          disabled={index === total - 1}
          aria-label="Move down"
          className="text-ink-300 hover:text-ink-500 disabled:opacity-20 disabled:cursor-not-allowed"
        >
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* Color dot */}
      <div
        className="w-2.5 h-2.5 rounded-full border shrink-0"
        style={def.color ? { backgroundColor: def.color, borderColor: def.color } : { backgroundColor: '#e5e7eb', borderColor: '#d1d5db' }}
      />

      {/* Icon + label */}
      {editing ? (
        <div className="flex-1 flex items-start gap-2 flex-wrap">
          <input
            ref={inputRef}
            type="text"
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={50}
            className="flex-1 min-w-[120px] px-2 py-1 border border-sage-300 rounded-badge text-sm
                       focus:outline-none focus:ring-1 focus:ring-sage-400 bg-paper text-ink-900"
          />
          <input
            type="text"
            value={editIcon}
            onChange={(e) => setEditIcon(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="🌱"
            maxLength={4}
            className="w-12 px-2 py-1 border border-sage-300 rounded-badge text-base text-center
                       focus:outline-none focus:ring-1 focus:ring-sage-400 bg-paper"
          />
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowColorPicker((v) => !v)}
              className="w-6 h-6 rounded-full border-2 border-ink-200 hover:border-ink-400 transition-colors"
              style={editColor ? { backgroundColor: editColor } : { backgroundColor: '#f9fafb' }}
              aria-label="Pick color"
            />
            {showColorPicker && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setShowColorPicker(false)} />
                <div className="absolute left-0 top-8 z-30 bg-paper border border-ink-200 rounded-card shadow-modal p-3">
                  <ColorSwatch selected={editColor} onChange={(c) => { setEditColor(c); setShowColorPicker(false); }} />
                </div>
              </>
            )}
          </div>
          <button type="button" onClick={saveEdit} disabled={!editLabel.trim()} className="text-sage-600 hover:text-sage-800 disabled:opacity-40">
            <Check className="w-4 h-4" />
          </button>
          <button type="button" onClick={cancelEdit} className="text-ink-400 hover:text-ink-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <div className="flex-1 flex items-center gap-2 min-w-0">
          {def.icon && <span className="text-base leading-none">{def.icon}</span>}
          <span
            className="text-sm font-medium text-ink-800 truncate"
            style={badgeStyle}
          >
            {def.label}
          </span>
          {def.builtIn && (
            <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 bg-ink-50 text-ink-400 rounded-badge border border-ink-100">
              built-in
            </span>
          )}
          {def.archived && (
            <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded-badge border border-amber-100">
              archived
            </span>
          )}
          {usageCount > 0 && (
            <span className="shrink-0 text-[10px] font-mono text-ink-300 ml-auto">
              {usageCount} {usageCount === 1 ? 'idea' : 'ideas'}
            </span>
          )}
        </div>
      )}

      {/* Actions */}
      {!editing && (
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={startEdit}
            title="Rename / recolor"
            className="p-1 text-ink-300 hover:text-ink-600 transition-colors rounded-badge hover:bg-ink-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          {def.archived ? (
            <button
              type="button"
              onClick={() => onRestore(def.id)}
              title="Restore from archive"
              className="p-1 text-ink-300 hover:text-sage-600 transition-colors rounded-badge hover:bg-sage-50"
            >
              <ArchiveRestore className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onArchive(def.id)}
              title={def.builtIn ? 'Archive (built-in categories cannot be deleted)' : 'Archive'}
              className="p-1 text-ink-300 hover:text-amber-600 transition-colors rounded-badge hover:bg-amber-50"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          )}

          {!def.builtIn && (
            <button
              type="button"
              onClick={() => onDelete(def.id, def.label, usageCount)}
              title="Delete permanently"
              className="p-1 text-ink-300 hover:text-red-600 transition-colors rounded-badge hover:bg-red-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── DeleteDialog ──────────────────────────────────────────────────────────────

interface DeleteDialogProps {
  categoryId: string;
  categoryLabel: string;
  usageCount: number;
  onConfirm: (id: string) => void;
  onClose: () => void;
}

function DeleteDialog({
  categoryId,
  categoryLabel,
  usageCount,
  onConfirm,
  onClose,
}: DeleteDialogProps) {
  if (usageCount > 0) {
    // Cannot delete — show a message about reassigning ideas first
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm">
        <div
          className="bg-paper w-full max-w-sm rounded-card shadow-modal border border-ink-100 p-6"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-2 mb-3 text-amber-600">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <h3 className="font-serif font-semibold text-ink-900">Category in use</h3>
          </div>
          <p className="text-sm text-ink-600 mb-2">
            <strong>{categoryLabel}</strong> is assigned to{' '}
            {usageCount === 1 ? '1 idea' : `${usageCount} ideas`}. Reassign or archive
            those ideas first, then come back to delete this category.
          </p>
          <p className="text-sm text-ink-400 mb-5">
            Or archive this category — it will stop appearing in the category picker
            while existing ideas keep their assignment.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 text-sm font-medium bg-paper border border-ink-200
                         text-ink-700 rounded-card hover:bg-ink-50 transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/30 backdrop-blur-sm">
      <div
        className="bg-paper w-full max-w-sm rounded-card shadow-modal border border-ink-100 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="font-serif font-semibold text-ink-900 mb-2">Delete "{categoryLabel}"?</h3>
        <p className="text-sm text-ink-500 mb-5">
          No ideas currently use this category. This action cannot be undone.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(categoryId)}
            className="flex-1 px-3 py-2 text-sm font-medium bg-red-600 text-paper
                       rounded-card hover:bg-red-700 transition-colors"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-3 py-2 text-sm font-medium bg-paper border border-ink-200
                       text-ink-700 rounded-card hover:bg-ink-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── CategoriesTab ─────────────────────────────────────────────────────────────

export default function CategoriesTab() {
  const categorySettings = useCategoriesSettings();
  const patch = useSettingsStore((s) => s.patch);

  // Local draft — updated optimistically; persisted on every change
  const [items, setItems] = useState<CategoryDefinition[]>(() =>
    [...categorySettings.items].sort((a, b) => a.sortOrder - b.sortOrder),
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string; usage: number } | null>(null);

  // Sync from store when external changes arrive (e.g. initial hydration)
  const prevSettingsRef = useRef(categorySettings);
  useEffect(() => {
    if (prevSettingsRef.current !== categorySettings) {
      prevSettingsRef.current = categorySettings;
      setItems([...categorySettings.items].sort((a, b) => a.sortOrder - b.sortOrder));
    }
  }, [categorySettings]);

  // Fetch category usage counts once on mount
  useEffect(() => {
    getStats().then((stats) => setUsageCounts(stats.categoryStats)).catch(() => {});
  }, []);

  // Persist whenever local items change
  const persist = async (nextItems: CategoryDefinition[]) => {
    setSaving(true);
    setError(null);
    try {
      await patch('categories', { items: nextItems });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save categories.');
    } finally {
      setSaving(false);
    }
  };

  const updateItems = (next: CategoryDefinition[]) => {
    setItems(next);
    persist(next);
  };

  // ── Operations ──

  const handleAdd = (def: Omit<CategoryDefinition, 'sortOrder' | 'builtIn'>) => {
    const sortOrder = items.length > 0 ? Math.max(...items.map((i) => i.sortOrder)) + 1 : 0;
    const next = [...items, { ...def, sortOrder, builtIn: false }];
    updateItems(next);
    setShowAddForm(false);
  };

  const handleUpdate = (updated: CategoryDefinition) => {
    const next = items.map((item) => (item.id === updated.id ? updated : item));
    updateItems(next);
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const visible = activeItems;
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= visible.length) return;

    // Swap sortOrder values
    const a = visible[index];
    const b = visible[swapIndex];
    const next = items.map((item) => {
      if (item.id === a.id) return { ...item, sortOrder: b.sortOrder };
      if (item.id === b.id) return { ...item, sortOrder: a.sortOrder };
      return item;
    });
    updateItems(next.sort((x, y) => x.sortOrder - y.sortOrder));
  };

  const handleArchive = (id: string) => {
    const next = items.map((item) => (item.id === id ? { ...item, archived: true } : item));
    updateItems(next);
  };

  const handleRestore = (id: string) => {
    const next = items.map((item) => (item.id === id ? { ...item, archived: false } : item));
    updateItems(next);
  };

  const handleDeleteRequest = (id: string, label: string, usage: number) => {
    setDeleteTarget({ id, label, usage });
  };

  const handleDeleteConfirm = (id: string) => {
    const next = items.filter((item) => item.id !== id);
    updateItems(next);
    setDeleteTarget(null);
  };

  // ── Derived ──

  const activeItems = items.filter((i) => !i.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const archivedItems = items.filter((i) => i.archived).sort((a, b) => a.sortOrder - b.sortOrder);
  const existingIds = new Set(items.map((i) => i.id));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-ink-500 leading-relaxed">
            Categories describe what kind of project an idea is — a game, an app, a tool, and so
            on. You can add your own, rename the built-ins, and change their order and color.
          </p>
          <p className="text-sm text-ink-400 mt-1">
            Built-in categories can be renamed or archived, but not deleted. Archived categories
            stop appearing in pickers; ideas already assigned to them keep their category.
          </p>
        </div>
        <HelpButton
          helpId="categories-settings"
          title="Managing Categories"
          summary="Add, rename, reorder, or archive the categories used to organise ideas."
          details="Built-in categories (App, Game, Tool, etc.) can be renamed or archived but not permanently deleted. Custom categories you create can be deleted as long as no ideas are currently assigned to them. Archived categories disappear from the category picker but don't affect existing ideas."
          manualSection="settings-categories"
          className="shrink-0 mt-1"
        />
      </div>

      {/* Save error */}
      {error && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-card text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Active categories list */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink-700 font-serif">
            Categories
            {saving && (
              <span className="ml-2 text-[11px] font-mono text-ink-300 font-normal animate-pulse">
                Saving…
              </span>
            )}
          </h3>
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-sage-50
                       border border-sage-200 text-sage-700 rounded-card hover:bg-sage-100
                       transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add category
          </button>
        </div>

        {showAddForm && (
          <div className="mb-3">
            <AddCategoryForm
              existingIds={existingIds}
              onAdd={handleAdd}
              onCancel={() => setShowAddForm(false)}
            />
          </div>
        )}

        <div className="space-y-1.5">
          {activeItems.length === 0 ? (
            <p className="text-sm text-ink-300 py-4 text-center">
              All categories are archived. Add a new one or restore an archived category.
            </p>
          ) : (
            activeItems.map((def, index) => (
              <CategoryRow
                key={def.id}
                def={def}
                index={index}
                total={activeItems.length}
                usageCount={usageCounts[def.id] ?? 0}
                onUpdate={handleUpdate}
                onMove={handleMove}
                onArchive={handleArchive}
                onRestore={handleRestore}
                onDelete={handleDeleteRequest}
              />
            ))
          )}
        </div>
      </section>

      {/* Archived section */}
      {archivedItems.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex items-center gap-1.5 text-sm text-ink-400 hover:text-ink-600 transition-colors"
          >
            {showArchived ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            Archived ({archivedItems.length})
          </button>

          {showArchived && (
            <div className="mt-2 space-y-1.5">
              {archivedItems.map((def, index) => (
                <CategoryRow
                  key={def.id}
                  def={def}
                  index={index}
                  total={archivedItems.length}
                  usageCount={usageCounts[def.id] ?? 0}
                  onUpdate={handleUpdate}
                  onMove={handleMove}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                  onDelete={handleDeleteRequest}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Delete confirmation dialog */}
      {deleteTarget && (
        <DeleteDialog
          categoryId={deleteTarget.id}
          categoryLabel={deleteTarget.label}
          usageCount={deleteTarget.usage}
          onConfirm={handleDeleteConfirm}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
