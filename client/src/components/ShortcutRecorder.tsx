/**
 * ShortcutRecorder — click-to-record keyboard binding widget.
 *
 * Renders the current binding as modifier chips + key badge. Clicking enters
 * "recording" state where the next keydown (that isn't a bare modifier) is
 * captured and returned via onChange. Esc cancels the recording. Tab/browser-
 * reserved combos are rejected with an inline error.
 */
import { useState, useEffect, useRef } from 'react';
import { X, RotateCcw } from 'lucide-react';
import type { ShortcutBinding } from '@/lib/types';
import { bindingLabel } from '@/lib/shortcuts';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Keys that cannot be used as the primary key (bare modifiers, navigation keys). */
const ILLEGAL_PRIMARY_KEYS = new Set([
  'escape', 'tab', 'control', 'alt', 'shift', 'meta', 'os',
  'capslock', 'numlock', 'scrolllock', 'pause', 'printscreen',
  'f1','f2','f3','f4','f5','f6','f7','f8','f9','f10','f11','f12',
]);

/** Ctrl/Meta + these keys are browser-reserved and cannot be overridden. */
const BROWSER_RESERVED_WITH_CTRL = new Set([
  'w','t','n','r','l','p','s','a','c','v','x','z','y','f4',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function keyDisplay(key: string): string {
  if (key === ' ') return 'Space';
  if (key.length === 1) return key.toUpperCase();
  return key;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ShortcutRecorderProps {
  value: ShortcutBinding;
  isDefault: boolean;
  onChange: (binding: ShortcutBinding) => void;
  onReset: () => void;
  conflict?: string;
  disabled?: boolean;
}

export default function ShortcutRecorder({
  value,
  isDefault,
  onChange,
  onReset,
  conflict,
  disabled = false,
}: ShortcutRecorderProps) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const handleClick = () => {
    if (disabled) return;
    setError(null);
    setRecording((r) => !r);
  };

  // Cancel on outside click
  useEffect(() => {
    if (!recording) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (buttonRef.current && !buttonRef.current.contains(e.target as Node)) {
        setRecording(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [recording]);

  // Capture keydown while recording
  useEffect(() => {
    if (!recording) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') { setRecording(false); return; }

      // Ignore bare modifier presses — wait for the actual key
      if (['Control','Alt','Shift','Meta','OS'].includes(e.key)) return;

      const key = e.key.toLowerCase();

      if (ILLEGAL_PRIMARY_KEYS.has(key)) {
        setError(`"${e.key}" cannot be used as a shortcut key.`);
        setRecording(false);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && BROWSER_RESERVED_WITH_CTRL.has(key)) {
        const mod = e.ctrlKey ? 'Ctrl' : '⌘';
        setError(`${mod} + ${key.toUpperCase()} is reserved by the browser.`);
        setRecording(false);
        return;
      }

      const binding: ShortcutBinding = {
        key,
        ...(e.ctrlKey  ? { ctrl:  true } : {}),
        ...(e.altKey   ? { alt:   true } : {}),
        ...(e.shiftKey ? { shift: true } : {}),
        ...(e.metaKey  ? { meta:  true } : {}),
      };

      setError(null);
      setRecording(false);
      onChange(binding);
    };

    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [recording, onChange]);

  const modifiers: string[] = [];
  if (value.ctrl)  modifiers.push('Ctrl');
  if (value.alt)   modifiers.push('Alt');
  if (value.shift) modifiers.push('Shift');
  if (value.meta)  modifiers.push('⌘');

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <button
          ref={buttonRef}
          type="button"
          onClick={handleClick}
          disabled={disabled}
          aria-label={
            recording
              ? 'Press a key combination…'
              : `Current shortcut: ${bindingLabel(value)}. Click to change.`
          }
          className={[
            'relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-card text-sm',
            'border transition-all select-none outline-none',
            'focus-visible:ring-2 focus-visible:ring-sage-400',
            recording
              ? 'bg-sage-50 border-sage-400 text-sage-700 ring-2 ring-sage-300 animate-pulse'
              : 'bg-paper-warm border-ink-200 text-ink-700 hover:border-sage-300 hover:bg-sage-50 cursor-pointer',
            disabled ? 'opacity-50 cursor-not-allowed' : '',
          ].join(' ')}
        >
          {recording ? (
            <span className="font-medium text-sage-600 text-xs tracking-wide">Press a key…</span>
          ) : (
            <>
              {modifiers.map((mod) => (
                <span
                  key={mod}
                  className="px-1.5 py-0.5 text-[10px] font-mono bg-paper border border-ink-200 text-ink-500 rounded"
                >
                  {mod}
                </span>
              ))}
              {modifiers.length > 0 && (
                <span className="text-ink-300 text-[10px]">+</span>
              )}
              <kbd className="px-1.5 py-0.5 text-[11px] font-mono bg-paper border border-ink-200 text-ink-600 rounded shadow-sm">
                {keyDisplay(value.key)}
              </kbd>
            </>
          )}
        </button>

        {/* Reset to default */}
        {!isDefault && !recording && (
          <button
            type="button"
            onClick={onReset}
            disabled={disabled}
            title="Reset to default"
            aria-label="Reset to default"
            className="p-1 text-ink-400 hover:text-ink-600 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}

        {/* Cancel recording */}
        {recording && (
          <button
            type="button"
            onClick={() => setRecording(false)}
            aria-label="Cancel recording"
            className="p-1 text-ink-400 hover:text-ink-600 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {isDefault && !recording && (
          <span className="text-[10px] text-ink-400 font-mono">default</span>
        )}
      </div>

      {error && (
        <p className="text-[11px] text-red-600 ml-0.5">{error}</p>
      )}
      {conflict && !error && (
        <p className="text-[11px] text-amber-600 ml-0.5">⚠ Conflicts with &ldquo;{conflict}&rdquo;</p>
      )}
    </div>
  );
}
