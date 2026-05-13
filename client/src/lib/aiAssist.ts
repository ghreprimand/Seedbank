/**
 * AI Slice 3 — Guided Assistance: client-side types and playbook registry.
 *
 * These types live in the client layer only (not shared/types.ts) so they
 * do not create a merge conflict with Codex Heavy's Slice 2 shared-type work.
 *
 * Slice 2 wiring TODO:
 *   - Replace `featureKey?: string` with `featureKey?: AiFeatureKey` once
 *     Codex Heavy's AiFeatureKey type lands in shared/types.ts.
 *   - Import from '@/lib/types' and drop this comment.
 */

import type { Idea } from '@/lib/types';

// ── Suggestion field labels (client display only) ─────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
  pitch: 'Pitch',
  hook: 'Hook / 30-second demo',
  whyItMightWork: 'Why It Might Work',
  risks: 'Risks & Blockers',
  techStack: 'Tech Stack Notes',
};

// ── Intent types ──────────────────────────────────────────────────────────────

/**
 * What the user wants from the AI for a specific field.
 *
 * - `improve`   — Rewrite/improve the existing value while preserving intent
 * - `fresh`     — Write from scratch, ignoring the current value
 * - `explain`   — Expand, clarify, or add detail to the current draft
 * - `question`  — Open-ended conversation about this field (conversation mode)
 * - `playbook`  — Use a named preset prompt (selected via the playbooks panel,
 *                 not as a top-level intent chip — see IntentSelector)
 */
export type AiAssistIntent =
  | 'improve'
  | 'fresh'
  | 'explain'
  | 'question'
  | 'playbook';

/**
 * U-3 fix: `playbook` is not shown as a top-level intent chip — it is selected
 * via the collapsible playbooks panel. Its entry is retained here so that
 * `buildAssistPrompt` can handle `intent === 'playbook'`, but `oneShot: true`
 * is set to ensure it always takes the one-shot path.
 *
 * The `mainIntents` list in `IntentSelector` explicitly omits 'playbook'.
 */
export const INTENT_CONFIG: Record<
  AiAssistIntent,
  { label: string; description: string; emoji: string; oneShot: boolean }
> = {
  improve:  { label: 'Improve this field',    description: 'Rewrite while preserving your intent',  emoji: '✏️',  oneShot: true  },
  fresh:    { label: 'Write from scratch',     description: 'Ignore the current value entirely',     emoji: '🌱',  oneShot: true  },
  explain:  { label: 'Expand my draft',        description: 'Add depth and detail to what\'s here',  emoji: '🔍',  oneShot: true  },
  question: { label: 'Ask a question',         description: 'Chat about this field conversationally',emoji: '💬',  oneShot: false },
  // 'playbook' not shown as a top-level chip — selected via the playbooks panel.
  playbook: { label: 'Use a playbook',         description: 'Apply a named prompt template',         emoji: '📋',  oneShot: true  },
};

// ── Playbooks ─────────────────────────────────────────────────────────────────

export interface AiPlaybook {
  id: string;
  label: string;
  description: string;
  /** Prepended to the user prompt before field context. */
  promptPrefix: string;
  /** Which fields this playbook applies to. Empty array = all fields. */
  fields: string[];
}

export const BUILTIN_PLAYBOOKS: AiPlaybook[] = [
  {
    id: 'marketing',
    label: 'Marketing pitch',
    description: 'Lead with benefit, audience focus, concise.',
    promptPrefix: 'Write this as a concise marketing pitch that leads with the clear benefit to the target user. Avoid jargon.',
    fields: ['pitch', 'hook'],
  },
  {
    id: 'jam',
    label: 'Jam / hackathon',
    description: 'Smallest version that ships in a weekend.',
    promptPrefix: 'Rewrite this with a hackathon lens. What is the smallest, most concrete version that could ship in 48 hours?',
    fields: ['pitch', 'hook', 'techStack'],
  },
  {
    id: 'honest',
    label: 'Honest & direct',
    description: 'Plain language, no buzzwords or hype.',
    promptPrefix: 'Rewrite this in plain, honest language. No buzzwords, no hype. Describe exactly what this is and who it is for.',
    fields: ['pitch', 'whyItMightWork', 'risks'],
  },
  {
    id: 'risks-devil',
    label: 'Surface hidden risks',
    description: 'Non-obvious risks and failure modes.',
    promptPrefix: 'Play devil\'s advocate. What are the non-obvious risks, hidden assumptions, or failure modes that could undermine this idea?',
    fields: ['risks', 'whyItMightWork'],
  },
  {
    id: 'technical',
    label: 'Technical depth',
    description: 'Specific stack choices and trade-offs.',
    promptPrefix: 'Rewrite this with more technical specificity. Name concrete technologies, libraries, and trade-offs rather than staying abstract.',
    fields: ['techStack', 'risks'],
  },
];

/** Filter playbooks to those applicable for the given field. */
export function playbooksForField(field: string): AiPlaybook[] {
  return BUILTIN_PLAYBOOKS.filter(
    (pb) => pb.fields.length === 0 || pb.fields.includes(field),
  );
}

// ── Assist context / request ──────────────────────────────────────────────────

/** The field + idea context passed into the modal. */
export interface AiAssistContext {
  idea: Idea;
  /** The idea field being assisted (matches AiSuggestionField keys). */
  field: string;
  /** Human-readable label for the field. */
  fieldLabel: string;
  /** Current text value of the field. */
  currentValue: string;
}

/**
 * The resolved request built from the user's intent selection.
 *
 * Slice 2 wiring: replace `featureKey?: string` with `featureKey?: AiFeatureKey`
 * once the type is available from Codex Heavy's Slice 2 work.
 */
export interface AiAssistRequest {
  context: AiAssistContext;
  intent: AiAssistIntent;
  /** Selected playbook id when intent === 'playbook'. */
  playbookId?: string;
  /** Follow-up refinement instruction supplied via the "Refine…" flow. */
  refinement?: string;
  /**
   * Per-feature routing key — Slice 2 TODO.
   * Once AiFeatureKey is available from shared/types.ts, change this to
   * `featureKey?: AiFeatureKey` and wire it through to the API call.
   */
  featureKey?: string;
}

// ── Prompt builder ────────────────────────────────────────────────────────────

/** Build the user-facing prompt string for a non-conversation request. */
export function buildAssistPrompt(req: AiAssistRequest): string {
  const { context, intent, playbookId, refinement } = req;
  const label = context.fieldLabel;
  const current = context.currentValue.trim();
  const ideaTitle = context.idea.title.trim() || 'this idea';

  let base = '';

  if (intent === 'playbook' && playbookId) {
    const pb = BUILTIN_PLAYBOOKS.find((p) => p.id === playbookId);
    if (pb) base = `${pb.promptPrefix}\n\nFor the "${label}" field of "${ideaTitle}":`;
  } else if (intent === 'improve') {
    base = `Improve the "${label}" field for "${ideaTitle}". Keep the author's intent but make it clearer and more compelling.`;
  } else if (intent === 'fresh') {
    base = `Write a new "${label}" for "${ideaTitle}" from scratch. Do not use the current value as a reference.`;
  } else if (intent === 'explain') {
    base = `Expand and add depth to the "${label}" for "${ideaTitle}". Keep the core idea and add useful specificity.`;
  }

  if (current && intent !== 'fresh') {
    base += `\n\nCurrent value:\n${current}`;
  }

  if (refinement?.trim()) {
    base += `\n\nAdditional instruction: ${refinement.trim()}`;
  }

  return base;
}
