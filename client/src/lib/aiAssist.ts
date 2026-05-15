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
  pitch: 'Elevator Pitch',
  fullNotes: 'The Spark / Raw Notes',
  hook: 'Concept',
  whyItMightWork: 'The Case',
  risks: 'Risks & Blockers',
  techStack: 'Build Notes',
  aesthetic: 'Aesthetic & Style',
  retrospective: 'Retrospective',
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
    id: 'scope-down',
    label: 'Scope down',
    description: 'Smallest feasible version you could build.',
    promptPrefix: 'Rewrite this with a feasibility lens. What is the smallest, most concrete version that could realistically be built?',
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
    fields: ['risks'],
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

type OneShotAssistIntent = Exclude<AiAssistIntent, 'question'>;

function fieldRole(field: string): string {
  switch (field) {
    case 'pitch':
      return 'This field should be a crisp elevator pitch: what the project is and its main payoff.';
    case 'fullNotes':
      return 'This field should preserve the user\'s raw notes while making them easier to scan.';
    case 'hook':
      return 'This field should explain the core concept in plain language, not as marketing copy.';
    case 'whyItMightWork':
      return 'This field should explain why the idea is worth building, grounded in the user\'s notes and validation criteria.';
    case 'risks':
      return 'This field should capture concrete risks, blockers, tradeoffs, and failure modes.';
    case 'techStack':
      return 'This field should capture practical build notes: stack, architecture, spikes, scope boundaries, and next steps.';
    case 'aesthetic':
      return 'This field should describe actionable visual, interaction, and tone direction.';
    case 'retrospective':
      return 'This field should capture candid outcome notes, lessons, surprises, and what to carry forward.';
    default:
      return 'This field should be directly usable in the idea.';
  }
}

function fieldIntentInstruction(field: string, label: string, ideaTitle: string, intent: OneShotAssistIntent): string {
  const subject = `the "${label}" field for "${ideaTitle}"`;
  const role = fieldRole(field);

  if (intent === 'fresh') {
    switch (field) {
      case 'pitch':
        return `Write a new ${subject} from scratch. ${role} Use one sentence unless two short sentences are clearly better.`;
      case 'whyItMightWork':
        return `Write a new ${subject} from scratch. ${role} For personal daily-driver or learning projects, focus on the user's own friction, workflow payoff, and learning value rather than launch or market claims.`;
      case 'risks':
        return `Write a new ${subject} from scratch. ${role} Use specific bullets grounded in the idea context.`;
      case 'techStack':
        return `Write a new ${subject} from scratch. ${role} Include concrete early technical decisions and open questions where the notes do not settle them.`;
      case 'fullNotes':
        return `Create a cleaned-up version of ${subject} from scratch using the rest of the idea context. ${role} Keep uncertainty, questions, constraints, and rough edges intact.`;
      default:
        return `Write a new ${subject} from scratch. ${role}`;
    }
  }

  if (intent === 'improve') {
    return `Improve ${subject}. ${role} Preserve the author's intent and factual meaning while making the text clearer, more specific, and easier to use. Do not add unsupported audiences, markets, promises, or technologies.`;
  }

  if (intent === 'explain') {
    return `Expand ${subject}. ${role} Keep the current direction, then add useful depth from the idea context without changing the project scope or replacing the user's framing.`;
  }

  return `Apply the selected playbook to ${subject}. ${role} If the playbook conflicts with this field's purpose or the idea context, prioritize the field purpose and the user's notes.`;
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
    if (pb) {
      base = [
        fieldIntentInstruction(context.field, label, ideaTitle, 'playbook'),
        '',
        `Selected playbook: ${pb.label}.`,
        pb.promptPrefix,
      ].join('\n');
    }
  } else if (intent === 'improve') {
    base = fieldIntentInstruction(context.field, label, ideaTitle, 'improve');
  } else if (intent === 'fresh') {
    base = [
      fieldIntentInstruction(context.field, label, ideaTitle, 'fresh'),
      'Use the rest of the idea context as source material, especially Raw Notes, Concept, Build Notes, risks, and validation criteria when present.',
      'Return only clean field text that could be applied directly. Do not review the field, explain the task, or use markdown formatting.',
      'Do not use the current value as a reference.',
    ].join(' ');
  } else if (intent === 'explain') {
    base = fieldIntentInstruction(context.field, label, ideaTitle, 'explain');
  }

  if (current && intent !== 'fresh') {
    base += `\n\nCurrent value:\n${current}`;
  }

  if (refinement?.trim()) {
    base += `\n\nAdditional instruction: ${refinement.trim()}`;
  }

  return base;
}
