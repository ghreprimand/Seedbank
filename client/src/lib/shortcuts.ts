import type { ShortcutBinding } from '@/lib/types';

export const DEFAULT_SHORTCUTS = {
  focusSearch: { key: '/' } as ShortcutBinding,
  openQuickCapture: { key: 'n' } as ShortcutBinding,
  openManual: { key: '?' } as ShortcutBinding,
} as const;

export function bindingLabel(binding: ShortcutBinding): string {
  const parts: string[] = [];
  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('Cmd');
  parts.push(
    binding.key === ' '
      ? 'Space'
      : binding.key.length === 1
        ? binding.key.toUpperCase()
        : binding.key,
  );
  return parts.join(' + ');
}

export function matchBinding(event: KeyboardEvent, binding: ShortcutBinding): boolean {
  return (
    event.key.toLowerCase() === binding.key.toLowerCase() &&
    Boolean(event.ctrlKey) === Boolean(binding.ctrl) &&
    Boolean(event.altKey) === Boolean(binding.alt) &&
    Boolean(event.shiftKey) === Boolean(binding.shift) &&
    Boolean(event.metaKey) === Boolean(binding.meta)
  );
}

export function hasShortcutModifier(binding: ShortcutBinding): boolean {
  return Boolean(binding.ctrl || binding.alt || binding.meta);
}
