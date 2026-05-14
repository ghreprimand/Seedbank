import { extractSuggestion } from './utils/suggestion-parser.js';
import type {
  AiChatMessage,
  AiFieldAssistMessage,
  AiFeatureId,
  AiProjectDraftFile,
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

export function promptForProjectDraft(idea: Idea, prompt?: string): AiProviderMessage[] {
  const requestedFiles = prompt?.trim() || 'Draft practical starter project files for this idea.';
  return [
    {
      role: 'system',
      content: [
        'You draft reviewable project files from a Seedbank idea.',
        'Return only JSON with keys "summary" and "files".',
        '"files" must be an array of objects with "path", "content", and optional "description".',
        'Use relative paths only. Do not use absolute paths, parent traversal, hidden directories, or generated binaries.',
        'Prefer concise Markdown and plain text files unless the user asks for code.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea) },
    {
      role: 'user',
      content: [
        requestedFiles,
        '',
        'Good default outputs include SPEC.md, IMPLEMENTATION_NOTES.md, RESEARCH_NOTES.md, or TODO.md when they fit the idea.',
        'Keep each file focused enough for the user to review before using it.',
      ].join('\n'),
    },
  ];
}

export function featureForMode(mode: string): AiFeatureId {
  if (mode === 'health-check') return 'health-check';
  if (mode === 'pattern-insights' || mode === 'smart-cross-pollinate') return 'discover-insights';
  return 'default';
}

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
    throw new Error('AI project draft response was not valid JSON.');
  }
}

function sanitizeDraftPath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const raw = value.trim().replace(/\\/g, '/');
  if (!raw || raw.startsWith('/') || raw.startsWith('~') || raw.includes('\0')) return undefined;
  const parts = raw.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..' || part.startsWith('.'))) return undefined;
  return parts.join('/');
}

export function parseProjectDraft(text: string): { summary: string; files: AiProjectDraftFile[] } {
  const parsed = extractJsonObject(text) as { summary?: unknown; files?: unknown };
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.files)) {
    throw new Error('AI project draft response must contain a files array.');
  }
  const files: AiProjectDraftFile[] = [];
  for (const item of parsed.files.slice(0, 8)) {
    if (!item || typeof item !== 'object') continue;
    const file = item as { path?: unknown; content?: unknown; description?: unknown };
    const safePath = sanitizeDraftPath(file.path);
    if (!safePath || typeof file.content !== 'string' || !file.content.trim()) continue;
    files.push({
      path: safePath,
      content: file.content.slice(0, 80000),
      ...(typeof file.description === 'string' && file.description.trim()
        ? { description: file.description.trim().slice(0, 500) }
        : {}),
    });
  }
  if (files.length === 0) throw new Error('AI project draft response did not contain any safe files.');
  return {
    summary: typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim()
      : 'Draft project files generated from this idea.',
    files,
  };
}

export function parseSuggestion(field: AiSuggestionField, text: string): AiSuggestion {
  const { suggestion, rationale } = extractSuggestion(text);
  return {
    field,
    suggestion,
    rationale,
  };
}
