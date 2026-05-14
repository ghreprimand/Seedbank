/**
 * Seedbank In-App Manual
 *
 * A full-screen modal/sheet with:
 *   - Left index (sections grouped by category)
 *   - Search box with local fuzzy matching
 *   - Section content renderer
 *   - Keyboard shortcuts: Esc = close, ↑↓ navigate index
 *   - Focus trap + restore on close
 *   - Deep-link support: open to a specific section via initialSection prop
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { X, Search, BookOpen, ChevronRight } from 'lucide-react';
import { HelpModeToggle } from './HelpPopover';
import {
  MANUAL_GROUPS,
  ALL_SECTIONS,
  findSection,
  searchManual,
  type ManualSection,
  type ManualBlock,
} from './manualContent';

// ── Props ─────────────────────────────────────────────────────────────────────

interface ManualModalProps {
  onClose: () => void;
  initialSection?: string;
}

// ── Block renderer ────────────────────────────────────────────────────────────

const INLINE_MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

function renderInlineText(text: string): React.ReactNode {
  const matches = Array.from(text.matchAll(INLINE_MARKDOWN_LINK_RE));
  if (matches.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const [matchText, label, href] of matches) {
    const index = text.indexOf(matchText, cursor);
    if (index > cursor) parts.push(text.slice(cursor, index));
    parts.push(
      <a
        key={`${href}-${index}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline decoration-sage-300 underline-offset-2 hover:text-sage-800 focus:outline-none focus:ring-2 focus:ring-sage-300 rounded-sm"
      >
        {label}
      </a>,
    );
    cursor = index + matchText.length;
  }
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

function BlockRenderer({ block }: { block: ManualBlock }) {
  switch (block.type) {
    case 'h3':
      return (
        <h3 className="text-sm font-semibold text-ink-700 mt-5 mb-2 first:mt-0">
          {block.text}
        </h3>
      );
    case 'p':
      return <p className="text-sm text-ink-600 leading-relaxed mb-3">{renderInlineText(block.text)}</p>;
    case 'ul':
      return (
        <ul className="space-y-1.5 mb-3 ml-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2 text-sm text-ink-600 leading-relaxed">
              <ChevronRight className="w-3.5 h-3.5 text-sage-400 shrink-0 mt-0.5" />
              <span>{renderInlineText(item)}</span>
            </li>
          ))}
        </ul>
      );
    case 'tip':
      return (
        <div className="my-3 px-3 py-2.5 bg-paper-warm border border-ink-300 rounded-card text-sm text-ink-800 leading-relaxed">
          <span className="font-semibold text-sage-700">Tip: </span>
          {renderInlineText(block.text)}
        </div>
      );
    case 'kbd':
      return (
        <div className="flex items-center gap-3 mb-2 text-sm">
          <kbd className="px-2 py-0.5 bg-ink-50 border border-ink-200 rounded text-ink-700 font-mono text-xs">
            {block.keys.join(' + ')}
          </kbd>
          <span className="text-ink-500">{block.description}</span>
        </div>
      );
    case 'code':
      return (
        <pre className="my-3 px-3 py-2.5 bg-ink-100 border border-ink-300 text-ink-900 text-xs font-mono rounded-card overflow-x-auto leading-relaxed whitespace-pre-wrap">
          {block.text}
        </pre>
      );
  }
}

// ── Section view ──────────────────────────────────────────────────────────────

function SectionView({ section }: { section: ManualSection }) {
  return (
    <article>
      <h2 className="text-xl font-serif font-semibold text-ink-800 mb-4 pb-3 border-b border-ink-100">
        {section.title}
      </h2>
      {section.blocks.map((block, i) => (
        <BlockRenderer key={i} block={block} />
      ))}
    </article>
  );
}

// ── Search results ────────────────────────────────────────────────────────────

/** Highlight words from `query` found in `text`. Returns an array of spans. */
function highlightTitle(text: string, query: string): React.ReactNode {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return text;

  // Build a regex that matches any of the query words (case-insensitive)
  const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    pattern.test(part)
      ? <mark key={i} className="bg-sage-100 text-sage-700 rounded px-0.5 not-italic">{part}</mark>
      : part,
  );
}

function SearchResults({
  query,
  onSelect,
}: {
  query: string;
  onSelect: (id: string) => void;
}) {
  const results = searchManual(query);

  if (results.length === 0) {
    return (
      <div className="py-8 text-center">
        <BookOpen className="w-8 h-8 text-ink-200 mx-auto mb-2" />
        <p className="text-sm text-ink-400">No sections matched "{query}".</p>
        <p className="text-xs text-ink-300 mt-1">Try a shorter term or browse the index.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-400 font-mono mb-3">
        {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
      </p>
      {results.map((section) => (
        <button
          key={section.id}
          onClick={() => onSelect(section.id)}
          className="w-full text-left px-3 py-2.5 rounded-card hover:bg-paper-warm border border-transparent
                     hover:border-ink-100 transition-colors"
        >
          <div className="text-sm font-medium text-ink-700">
            {highlightTitle(section.title, query)}
          </div>
          <div className="text-xs text-ink-500 mt-0.5 line-clamp-2">
            {section.keywords.slice(0, 4).join(' · ')}
          </div>
        </button>
      ))}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ManualModal({ onClose, initialSection }: ManualModalProps) {
  const [activeId, setActiveId] = useState<string>(
    initialSection ?? ALL_SECTIONS[0]?.id ?? 'overview',
  );
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<Element | null>(null);

  // Save focus target on mount; restore on unmount
  useEffect(() => {
    returnFocusRef.current = document.activeElement;
    // Auto-focus search on open
    setTimeout(() => searchRef.current?.focus(), 50);
    return () => {
      (returnFocusRef.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  // Focus trap
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleSelect = useCallback((id: string) => {
    setActiveId(id);
    setQuery('');
  }, []);

  const activeSection = findSection(activeId);
  const showSearch = query.trim().length > 0;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 bg-ink-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-help="manual-modal"
    >
      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Seedbank manual"
        className="bg-paper w-full max-w-5xl max-h-[90vh] rounded-card shadow-card-hover
                   flex flex-col overflow-hidden border border-ink-100 animate-slide-up"
      >
        {/* ── Header ── */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-ink-100 shrink-0">
          <BookOpen className="w-4 h-4 text-sage-500 shrink-0" />
          <span className="text-sm font-semibold text-ink-700">Manual</span>

          {/* Search */}
          <div className="relative flex-1 max-w-sm">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-300 pointer-events-none">
              <Search className="w-3.5 h-3.5" />
            </span>
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search manual…"
              aria-label="Search manual"
              className="w-full pl-8 pr-3 py-1.5 bg-paper-warm border border-ink-100 rounded-pill text-sm
                         focus:outline-none focus:ring-2 focus:ring-sage-400 focus:border-sage-300
                         transition-all placeholder:text-ink-300"
            />
          </div>

          {/* Help mode toggle (always visible) + keyboard hint (sm+) */}
          <div className="flex items-center gap-3 ml-auto mr-2">
            <HelpModeToggle />
            <span className="hidden sm:inline text-xs text-ink-300 font-mono">Esc to close</span>
          </div>

          <button
            ref={closeRef}
            onClick={onClose}
            aria-label="Close manual"
            className="p-1.5 text-ink-400 hover:text-ink-600 hover:bg-ink-50 rounded-card transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 min-h-0">
          {/* Index sidebar */}
          <nav
            aria-label="Manual sections"
            className="w-52 shrink-0 border-r border-ink-100 overflow-y-auto py-3 hidden sm:block"
          >
            {MANUAL_GROUPS.map((group) => (
              <div key={group.label} className="mb-3">
                <div className="px-4 py-1 text-[10px] font-mono uppercase tracking-wider text-ink-400">
                  {group.label}
                </div>
                {group.sections.map((section) => (
                  <button
                    key={section.id}
                    onClick={() => handleSelect(section.id)}
                    className={`w-full text-left px-4 py-1.5 text-sm transition-colors ${
                      activeId === section.id && !showSearch
                        ? 'text-sage-600 bg-sage-50 font-medium border-r-2 border-sage-400'
                        : 'text-ink-500 hover:text-ink-700 hover:bg-paper-warm'
                    }`}
                  >
                    {section.indexLabel ?? section.title}
                  </button>
                ))}
              </div>
            ))}
          </nav>

          {/* Content area */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6">
            {showSearch ? (
              <SearchResults query={query} onSelect={handleSelect} />
            ) : activeSection ? (
              <SectionView section={activeSection} />
            ) : (
              <p className="text-sm text-ink-400">Section not found.</p>
            )}
          </div>
        </div>

        {/* ── Mobile section picker (below header, visible only on small screens) ── */}
        <div className="sm:hidden border-t border-ink-100 px-4 py-2 shrink-0 bg-paper-warm">
          <select
            value={activeId}
            onChange={(e) => handleSelect(e.target.value)}
            aria-label="Jump to section"
            className="w-full text-sm bg-paper border border-ink-100 rounded-card px-2 py-1.5
                       focus:outline-none focus:ring-2 focus:ring-sage-400 text-ink-700"
          >
            {MANUAL_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.indexLabel ?? s.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
