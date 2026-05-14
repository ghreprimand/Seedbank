import { FALLBACK_HELP_ENTRY, HELP_CONTENT_MAP } from './helpContentMap';
import type { HelpEntry, ResolvedHelpTarget } from './helpTypes';

function fromDataset(element: HTMLElement): HelpEntry | null {
  const title = element.dataset.helpTitle?.trim();
  const body = element.dataset.helpBody?.trim();
  const details = element.dataset.helpDetails?.trim();
  const manualSection = element.dataset.helpManual?.trim();

  if (!title && !body && !details && !manualSection) return null;

  return {
    title: title || 'Context Help',
    body: body || details || FALLBACK_HELP_ENTRY.body,
    details: details && details !== body ? details : undefined,
    manualSection: manualSection || undefined,
  };
}

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function snippetFromElement(element: HTMLElement): string | null {
  const aria = compactText(element.getAttribute('aria-label') ?? '');
  if (aria) return aria;
  const title = compactText(element.getAttribute('title') ?? '');
  if (title) return title;
  const text = compactText(element.textContent ?? '');
  if (text) return text.slice(0, 90);
  return null;
}

function genericEntryFor(element: HTMLElement): HelpEntry | null {
  const tag = element.tagName.toLowerCase();
  const label = snippetFromElement(element);

  if (tag === 'button') {
    return {
      title: 'Button',
      body: label ? `This button action is "${label}".` : 'This button triggers an action in the current view.',
      details: 'In help mode, clicks are intercepted so you can inspect behavior without triggering changes.',
      manualSection: 'overview',
    };
  }

  if (tag === 'a') {
    return {
      title: 'Link',
      body: label ? `This link is "${label}".` : 'This link navigates to another view or external destination.',
      manualSection: 'overview',
    };
  }

  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    return {
      title: 'Input Field',
      body: label ? `This input is "${label}".` : 'This control captures user input for the current feature.',
      details: 'In help mode, form interactions are blocked so you can inspect controls safely.',
      manualSection: 'overview',
    };
  }

  if (tag === 'section' || tag === 'article' || tag === 'main') {
    return {
      title: 'UI Section',
      body: label ? `This section appears to be "${label}".` : 'This is a section of the current page.',
      manualSection: 'overview',
    };
  }

  return null;
}

export function resolveHelpTarget(origin: HTMLElement): ResolvedHelpTarget | null {
  const element = origin.closest<HTMLElement>('[data-help]');
  if (!element) {
    const genericElement = origin.closest<HTMLElement>('button, a, input, textarea, select, section, article, main');
    if (!genericElement) return null;
    const entry = genericEntryFor(genericElement);
    if (!entry) return null;
    return {
      id: `generic:${genericElement.tagName.toLowerCase()}`,
      element: genericElement,
      entry,
    };
  }

  const id = element.dataset.help?.trim();
  if (!id) return null;

  const mapped = HELP_CONTENT_MAP[id];
  const dataset = fromDataset(element);
  if (!mapped && !dataset) return null;

  return {
    id,
    element,
    entry: {
      ...(mapped ?? {}),
      ...(dataset ?? {}),
      title: dataset?.title ?? mapped?.title ?? FALLBACK_HELP_ENTRY.title,
      body: dataset?.body ?? mapped?.body ?? FALLBACK_HELP_ENTRY.body,
      details: dataset?.details ?? mapped?.details,
      manualSection: dataset?.manualSection ?? mapped?.manualSection,
    },
  };
}

export function resolveHelpById(id: string, overrides?: Partial<HelpEntry>): HelpEntry {
  const mapped = HELP_CONTENT_MAP[id];

  return {
    ...(mapped ?? FALLBACK_HELP_ENTRY),
    ...(overrides ?? {}),
    title: overrides?.title ?? mapped?.title ?? FALLBACK_HELP_ENTRY.title,
    body: overrides?.body ?? mapped?.body ?? FALLBACK_HELP_ENTRY.body,
    details: overrides?.details ?? mapped?.details,
    manualSection: overrides?.manualSection ?? mapped?.manualSection,
  };
}
