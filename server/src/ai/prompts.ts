import { extractSuggestion } from './utils/suggestion-parser.js';
import type {
  AiChatMessage,
  AiFieldAssistMessage,
  AiFeatureId,
  AiSuggestion,
  AiSuggestionField,
  Idea,
} from '../../../shared/types.js';
import type { AiProviderMessage } from './types.js';

const THINKING_PARTNER_PROMPT = [
  'You are a creative thinking partner.',
  'Your role is to help the user develop THEIR idea through questions, reflections, and gentle challenges.',
  'Never generate ideas unprompted. Ask before suggesting.',
  'Focus on drawing out what the user already intuitively knows.',
  'Keep responses concise and practical. Prefer one or two thoughtful questions over broad ideation.',
].join(' ');

const FIELD_ASSIST_PROMPT = [
  'You are helping a user refine a specific field of their idea.',
  'Respond concisely and practically.',
  'When asked to write or rewrite text, provide a concrete answer immediately without asking for permission first.',
  'Focus only on the specified field — do not comment on or modify other parts of the idea.',
  'Keep responses brief; the user can ask follow-up questions if they want more.',
].join(' ');

function ideaContext(idea: Idea): string {
  return [
    'Current idea context:',
    JSON.stringify({
      title: idea.title,
      pitch: idea.pitch,
      category: idea.category,
      stage: idea.stage,
      tags: idea.tags,
      moodLabels: idea.moodLabels,
      fullNotes: idea.fullNotes,
      hook: idea.hook,
      whyItMightWork: idea.whyItMightWork,
      risks: idea.risks,
      techStack: idea.techStack,
      jamScore: idea.jamScore,
      excitementScore: idea.excitementScore,
      graduatedTo: idea.graduatedTo,
    }, null, 2),
  ].join('\n');
}

export function messagesForChat(idea: Idea, history: AiChatMessage[], nextUserMessage: string): AiProviderMessage[] {
  return [
    { role: 'system', content: THINKING_PARTNER_PROMPT },
    { role: 'system', content: ideaContext(idea) },
    ...history.slice(-20).map((message) => ({ role: message.role, content: message.content })),
    { role: 'user', content: nextUserMessage },
  ];
}

const FIELD_SUGGESTION_PROMPTS: Record<AiSuggestionField, string> = {
  pitch: 'Help sharpen this pitch into a clearer one-line version.',
  fullNotes: 'Help expand, organize, and clarify these full notes while preserving the user\'s raw thinking.',
  risks: 'Identify concrete risks, blind spots, or blockers the user may be missing.',
  techStack: 'Suggest technologies that fit the idea and explain the fit briefly.',
  hook: 'Help find a concise demo hook for this idea.',
  whyItMightWork: 'Strengthen the argument for why this idea might work.',
};

export function promptForSuggestion(idea: Idea, field: AiSuggestionField, currentValue: string): AiProviderMessage[] {
  return [
    {
      role: 'system',
      content: [
        THINKING_PARTNER_PROMPT,
        'For this request, return only JSON with keys "suggestion" and "rationale".',
        'The suggestion must revise or extend the target field, not replace the user as the source of creativity.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea) },
    {
      role: 'user',
      content: [
        FIELD_SUGGESTION_PROMPTS[field],
        '',
        `Target field: ${field}`,
        `Current value: ${currentValue || '(empty)'}`,
      ].join('\n'),
    },
  ];
}

export function promptForFieldAssist(
  idea: Idea,
  field: AiSuggestionField,
  currentValue: string,
  customPrompt?: string,
  omitCurrentValue = false,
): AiProviderMessage[] {
  const currentValueLines = omitCurrentValue
    ? []
    : [
        '',
        `Current value: ${currentValue || '(empty)'}`,
      ];
  return [
    {
      role: 'system',
      content: [
        FIELD_ASSIST_PROMPT,
        'For this field-assist request, return only JSON with keys "suggestion" and "rationale".',
        'The suggestion must revise or extend the target field, not replace the user as the source of creativity.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea) },
    {
      role: 'user',
      content: [
        customPrompt?.trim() || FIELD_SUGGESTION_PROMPTS[field],
        '',
        `Target field: ${field}`,
        ...currentValueLines,
      ].join('\n'),
    },
  ];
}

export function fieldAssistConversationMessages(
  idea: Idea,
  field: AiSuggestionField,
  currentValue: string,
  history: AiFieldAssistMessage[] | undefined,
  nextUserMessage: string,
): AiProviderMessage[] {
  const safeHistory = (history ?? [])
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content.trim())
    .slice(-20)
    .map((message) => ({
      role: message.role,
      content: message.content.trim(),
    }));

  return [
    {
      role: 'system',
      content: [
        FIELD_ASSIST_PROMPT,
        'You are assisting with one specific Seedbank idea field in a modal-local conversation.',
        'Do not use or update the persistent Thinking Partner conversation.',
        'Keep replies focused on the target field. If you draft field text, make it easy to apply.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea) },
    {
      role: 'system',
      content: [
        `Target field: ${field}`,
        `Current value: ${currentValue || '(empty)'}`,
      ].join('\n'),
    },
    ...safeHistory,
    { role: 'user', content: nextUserMessage },
  ];
}

export function promptForMode(mode: string, context: unknown, prompt?: string): AiProviderMessage[] {
  return [
    {
      role: 'system',
      content: [
        THINKING_PARTNER_PROMPT,
        'Answer this Seedbank assistance request directly and concisely.',
        'Do not modify user data. Return plain text only.',
      ].join(' '),
    },
    {
      role: 'user',
      content: [
        `Mode: ${mode}`,
        prompt ? `Prompt: ${prompt}` : '',
        'Context:',
        JSON.stringify(context ?? {}, null, 2),
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function featureForMode(mode: string): AiFeatureId {
  if (mode === 'health-check') return 'health-check';
  if (mode === 'pattern-insights' || mode === 'smart-cross-pollinate') return 'discover-insights';
  return 'default';
}

export function parseSuggestion(field: AiSuggestionField, text: string): AiSuggestion {
  const { suggestion, rationale } = extractSuggestion(text);
  return {
    field,
    suggestion,
    rationale,
  };
}
