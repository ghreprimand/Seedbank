import fs from 'node:fs';
import { extractSuggestion } from './utils/suggestion-parser.js';
import type {
  AiChatMessage,
  AiFieldAssistIntent,
  AiFieldAssistMessage,
  AiFeatureId,
  AiLandscapeAnalysisSections,
  AiProjectDraftFile,
  AiSuggestion,
  AiSuggestionField,
  Idea,
  Stage,
} from '../../../shared/types.js';
import { assessReadiness } from '../../../shared/stageReadiness.js';
import type { AiProviderMessage } from './types.js';

const THINKING_PARTNER_PROMPT = [
  'You are a creative thinking partner.',
  'Your role is to help the user develop THEIR idea through questions, reflections, and gentle challenges.',
  'Never generate ideas unprompted. Ask before suggesting.',
  'Focus on drawing out what the user already intuitively knows.',
  'Ground every question in the supplied idea context, using the field labels provided with that context.',
  'Use concrete details from the title, pitch, raw notes, concept, risks, build notes, tags, and scores when they are present.',
  'Treat empty fields as unknown. Do not infer unstated audiences, markets, technology, or constraints.',
  'If the context is sparse, ask for the most important missing detail instead of making a generic or invented critique.',
  'For each reply, first anchor your thinking to one or two concrete details from the supplied context, then ask a high-leverage question.',
  'When asked for Devil\'s Advocate, name the specific assumption you are challenging and tie it to a concrete note before asking the question.',
  'Avoid generic product-coaching questions when the raw notes already identify sharper tradeoffs, constraints, or validation criteria.',
  'If the notes frame the idea as a personal daily-driver or learning project, focus on the user\'s own workflow and validation criteria instead of launch, market, or external-user metrics unless external users are explicitly mentioned.',
  'Do not imply the project has been built, dogfooded, used daily, launched, tested, or measured unless the context explicitly says that already happened.',
  'Treat validation criteria as planned criteria unless the notes include actual results. Ask about intended first trials, benchmarks, or decisions rather than completed logs.',
  'When a preset asks for a grounded insight, actionable next move, and question, provide all three as natural short sentences.',
  'When the user asks for a single question, return only the question or the explicitly requested short setup plus question.',
  'Write in plain text for an app UI. Do not use markdown bold, markdown headings, or decorative labels.',
  'Do not format replies as labeled sections such as "Assumption:", "Implied by note:", or "Testable question:". Write naturally.',
  'Do not echo or restate the user\'s instruction text.',
  'Keep responses concise and practical. Prefer one or two thoughtful questions over broad ideation.',
].join(' ');

const FIELD_ASSIST_PROMPT = [
  'You are helping a user refine a specific field of their idea.',
  'Respond concisely and practically.',
  'When asked to write or rewrite text, provide a concrete answer immediately without asking for permission first.',
  'Focus only on the specified field — do not comment on or modify other parts of the idea.',
  'Use the supplied idea context as source material and avoid generic product-coaching language.',
  'Do not add audiences, markets, users, deadlines, technologies, or claims that are not supported by the supplied idea context.',
  'Treat empty fields as unknown — never invent details to fill the gap.',
  'If the notes frame the idea as a personal daily-driver or learning project, write for the user\'s own workflow unless external users are explicitly mentioned.',
  'Write in plain text for an app UI. Do not use markdown bold, markdown headings, or decorative labels.',
  'Do not return meta-commentary about the request. Return directly usable field text.',
  'Keep responses brief; the user can ask follow-up questions if they want more.',
].join(' ');

const THINKING_PARTNER_FIELD_LABELS = {
  pitch: 'Elevator Pitch',
  fullNotes: 'The Spark / Raw Notes',
  hook: 'Concept',
  whyItMightWork: 'The Case',
  risks: 'Risks & Blockers',
  techStack: 'Build Notes',
  aesthetic: 'Aesthetic & Style',
  retrospective: 'Retrospective',
  jamScore: 'Feasibility',
  excitementScore: 'Personal Excitement',
  tags: 'Tags',
  moodLabels: 'Mood Labels',
  graduatedTo: 'Local Project Folder',
} as const;

function hasContextValue(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'number') return value > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function formatContextValue(value: unknown): string {
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '(empty)';
  if (typeof value === 'number') return value > 0 ? String(value) : '(empty)';
  if (typeof value === 'string') return value.trim() || '(empty)';
  return value === null || value === undefined ? '(empty)' : String(value);
}

function ideaContext(idea: Idea, omitFields: AiSuggestionField[] = []): string {
  const omitted = new Set<AiSuggestionField>(omitFields);
  const labeledFields = {
    pitch: idea.pitch,
    fullNotes: idea.fullNotes,
    hook: idea.hook,
    whyItMightWork: idea.whyItMightWork,
    risks: idea.risks,
    techStack: idea.techStack,
    aesthetic: idea.aesthetic,
    retrospective: idea.retrospective,
    jamScore: idea.jamScore,
    excitementScore: idea.excitementScore,
    tags: idea.tags,
    moodLabels: idea.moodLabels,
    graduatedTo: idea.graduatedTo,
  };
  const filledFields = Object.entries(labeledFields)
    .filter(([field, value]) => !omitted.has(field as AiSuggestionField) && hasContextValue(value))
    .map(([field]) => THINKING_PARTNER_FIELD_LABELS[field as keyof typeof THINKING_PARTNER_FIELD_LABELS]);
  const valueFor = (field: AiSuggestionField, value: unknown): string =>
    omitted.has(field) ? '(omitted for this write-from-scratch request)' : formatContextValue(value);

  return [
    'Current Seedbank idea context. Use this context over prior assistant messages.',
    '',
    `Title: ${idea.title}`,
    `Category: ${idea.category}`,
    `Stage: ${idea.stage}`,
    `Filled fields: ${filledFields.length > 0 ? filledFields.join(', ') : 'none beyond title/category/stage'}`,
    '',
    `Elevator Pitch (pitch): ${valueFor('pitch', idea.pitch)}`,
    '',
    'The Spark / Raw Notes (fullNotes, verbatim):',
    valueFor('fullNotes', idea.fullNotes),
    '',
    'Concept (hook):',
    valueFor('hook', idea.hook),
    '',
    'The Case (whyItMightWork):',
    valueFor('whyItMightWork', idea.whyItMightWork),
    '',
    'Risks & Blockers (risks):',
    valueFor('risks', idea.risks),
    '',
    'Build Notes (techStack):',
    valueFor('techStack', idea.techStack),
    '',
    'Aesthetic & Style (aesthetic):',
    valueFor('aesthetic', idea.aesthetic),
    '',
    'Retrospective (retrospective):',
    valueFor('retrospective', idea.retrospective),
    '',
    `Tags: ${formatContextValue(idea.tags)}`,
    `Mood Labels: ${formatContextValue(idea.moodLabels)}`,
    `Feasibility (jamScore): ${formatContextValue(idea.jamScore)}`,
    `Personal Excitement (excitementScore): ${formatContextValue(idea.excitementScore)}`,
    `Local Project Folder (graduatedTo): ${formatContextValue(idea.graduatedTo)}`,
  ].join('\n');
}

export function stagePersonality(stage: Stage): string {
  if (stage === 'seed' || stage === 'sprout') {
    return [
      `Stage personality: ${stage}.`,
      'Be generative and exploratory.',
      'Help the user brainstorm and expand.',
      'Ask "what if" questions.',
      'Use planning and future-tense language because the idea is still being shaped.',
      'Focus questions on what to build first, what assumption to test first, and what would make the first attempt worthwhile.',
      'Keep critique lightweight unless the user explicitly asks for it.',
      'When the user asks for Devil\'s Advocate, challenge only assumptions visible in the supplied context.',
    ].join(' ');
  }

  if (stage === 'pitch') {
    return [
      'Stage personality: bloom.',
      'Be critical and sharpening.',
      'The idea has bloomed. Help tighten the concept.',
      'Ask about audience, differentiators, and constraints.',
    ].join(' ');
  }

  if (stage === 'prototype' || stage === 'plot') {
    return [
      `Stage personality: ${stage === 'prototype' ? 'greenhouse' : 'plot'}.`,
      'Be practical and implementation-focused.',
      stage === 'prototype'
        ? 'The idea is in the greenhouse. Focus on technical feasibility, architecture decisions, and next concrete steps.'
        : 'Focus on technical feasibility, architecture decisions, and next concrete steps.',
    ].join(' ');
  }

  if (stage === 'shelved' || stage === 'cold-storage') {
    return [
      `Stage personality: ${stage === 'shelved' ? 'dormant' : 'cold-storage'}.`,
      'Be reflective.',
      stage === 'shelved'
        ? 'This idea is dormant. Help the user decide if it deserves revival.'
        : 'This idea is in cold storage. Help the user decide if it deserves revival.',
      'Ask what changed since it was paused.',
    ].join(' ');
  }

  return [
    'Stage personality: market.',
    'Be retrospective.',
    'This idea has gone to market. Help the user reflect on what worked, what did not, and what to carry forward.',
  ].join(' ');
}

function fieldSuggestionStageExpectation(stage: Stage, field: AiSuggestionField): string {
  const label = AI_FIELD_DISPLAY_LABELS[field];
  if (stage === 'seed' || stage === 'sprout') {
    return [
      `Stage expectation for ${label}: early-stage drafts can be rough and exploratory.`,
      'Prioritize momentum, clarity of direction, and options over polish.',
    ].join(' ');
  }
  if (stage === 'pitch') {
    return [
      `Stage expectation for ${label}: this should be polished and presentation-ready.`,
      'Prioritize precision, confidence, and concrete differentiation.',
    ].join(' ');
  }
  if (stage === 'prototype' || stage === 'plot') {
    return [
      `Stage expectation for ${label}: keep output practical and build-oriented.`,
      'Prefer concrete execution details, constraints, and implementation choices.',
    ].join(' ');
  }
  if (stage === 'shelved' || stage === 'cold-storage') {
    return [
      `Stage expectation for ${label}: optimize for re-entry and reassessment.`,
      'Capture what should be revisited now that context may have changed.',
    ].join(' ');
  }
  return [
    `Stage expectation for ${label}: support retrospective clarity.`,
    'Focus on lessons learned and transferability to future ideas.',
  ].join(' ');
}

function fieldOutputContract(field: AiSuggestionField): string {
  const contracts: Record<AiSuggestionField, string[]> = {
    pitch: [
      'Output contract for Elevator Pitch:',
      'If Concept (hook) is filled, the pitch must distill that exact concept — do not invent a different framing. If Concept is empty, fall back to Raw Notes, then The Case, then the title.',
      'Write one crisp sentence, or two short sentences only if needed.',
      'Say what the project is and the main value it creates.',
      'For personal tools, frame the payoff around the user\'s own workflow instead of a market claim.',
    ],
    fullNotes: [
      'Output contract for The Spark / Raw Notes:',
      'Preserve the user\'s raw thinking while making it easier to scan.',
      'Use short paragraphs or simple hyphen bullets when useful.',
      'Do not polish away uncertainty, questions, constraints, or rough edges that matter to the idea.',
    ],
    hook: [
      'Output contract for Concept:',
      'Build the explanation from what the user wrote in Raw Notes (fullNotes); fall back to the title and Elevator Pitch if Raw Notes are empty.',
      'Write a concise plain-language explanation of what this thing is.',
      'Name the core mechanism, workflow, or experience when the context supports it.',
      'Do not turn the concept into a marketing pitch.',
    ],
    whyItMightWork: [
      'Output contract for The Case:',
      'Treat the Concept (hook) field as the source of truth for what this project is. If Concept is filled, your case must argue why building that specific thing is worth the effort — do not redescribe or redefine it. If Concept is empty, fall back to the Raw Notes and Elevator Pitch, in that order.',
      'Write one or two plain paragraphs that answer why this is worth building from the captured idea context.',
      'For a personal daily-driver or learning project, center the user\'s own friction, learning goals, workflow payoff, and validation criteria.',
      'Do not turn it into a launch, market, growth, or external-user argument unless those are explicitly present in the notes.',
    ],
    risks: [
      'Output contract for Risks & Blockers:',
      'Ground risks in the project as defined by Concept and (if filled) Build Notes — risks should attach to the actual mechanism, scope, and stack, not generic project risk.',
      'List concrete risks, blockers, tradeoffs, and failure modes grounded in the supplied idea context.',
      'Prefer specific implementation, scope, validation, usability, or maintenance risks over generic startup risk language.',
      'Simple hyphen bullets are appropriate for this field.',
    ],
    techStack: [
      'Output contract for Build Notes:',
      'Write practical implementation notes: stack direction, architecture choices, early spikes, scope boundaries, and first build steps.',
      'Name concrete technologies only when the context supports them.',
      'Include tradeoffs or open decisions instead of pretending every technical choice is settled.',
    ],
    aesthetic: [
      'Output contract for Aesthetic & Style:',
      'Describe actionable visual, interaction, and tone direction.',
      'Use concrete UI qualities, references, constraints, and feel.',
      'Avoid vague vibe-only phrasing that would not help someone design the project.',
    ],
    retrospective: [
      'Output contract for Retrospective:',
      'Write candid notes about outcome, lessons, surprises, and what to carry forward.',
      'Use past-tense outcome language only when the idea context supports it.',
      'If the project is not complete, frame this as a retrospective scaffold or evaluation notes instead of inventing results.',
    ],
  };

  return [
    ...contracts[field],
    'Return directly usable field text.',
    'Do not ask questions, explain your process, write a review, or include headings or decorative labels.',
  ].join(' ');
}

function fieldAssistIntentContract(intent: AiFieldAssistIntent | undefined, omitCurrentValue = false): string {
  if (omitCurrentValue || intent === 'fresh') {
    return [
      'Mode contract: Write from scratch.',
      'Ignore the current value entirely.',
      'Use the rest of the idea context as source material.',
      'Return a complete standalone value for the target field.',
    ].join(' ');
  }

  if (intent === 'improve') {
    return [
      'Mode contract: Improve this field.',
      'Preserve the user\'s intent and factual meaning while improving clarity, specificity, and usefulness.',
      'Do not add unsupported audiences, markets, promises, or technologies.',
    ].join(' ');
  }

  if (intent === 'explain') {
    return [
      'Mode contract: Expand my draft.',
      'Keep the current direction, then add useful depth from the idea context.',
      'Do not change the project scope or replace the user\'s framing.',
    ].join(' ');
  }

  if (intent === 'playbook') {
    return [
      'Mode contract: Apply the selected playbook only where it fits the target field and idea context.',
      'If the playbook wording conflicts with the field output contract or the idea context, obey the field output contract.',
      'If multiple playbooks are active and they conflict, prioritize playbooks in this order: 1) Honest & Direct, 2) Devil\'s Advocate, 3) Scope Down, 4) Technical, 5) Marketing. Lower-priority playbooks contribute only where they do not contradict higher-priority ones.',
      'For personal daily-driver projects, do not force external-user or market framing unless the notes explicitly call for it.',
    ].join(' ');
  }

  return [
    'Mode contract: Suggest a useful field revision.',
    'Revise or extend the field while preserving the user\'s intent.',
  ].join(' ');
}

export function messagesForChat(idea: Idea, history: AiChatMessage[], nextUserMessage: string): AiProviderMessage[] {
  return [
    { role: 'system', content: THINKING_PARTNER_PROMPT },
    { role: 'system', content: stagePersonality(idea.stage) },
    { role: 'system', content: ideaContext(idea) },
    ...history.slice(-20).map((message) => ({ role: message.role, content: message.content })),
    {
      role: 'system',
      content: 'For the next reply, prioritize the current Seedbank idea context over older conversation turns. Keep the answer plain-text, concrete, and specific to the filled fields.',
    },
    { role: 'user', content: nextUserMessage },
  ];
}

const FIELD_SUGGESTION_PROMPTS: Record<AiSuggestionField, string> = {
  pitch: 'Help distill this concept into a clearer one-line elevator pitch.',
  fullNotes: 'Help expand, organize, and clarify The Spark / Raw Notes while preserving the user\'s unfiltered thinking.',
  risks: 'Identify concrete risks, blind spots, or blockers the user may be missing.',
  techStack: 'Strengthen the Build Notes with practical stack choices, architecture direction, scope boundaries, and first steps.',
  hook: 'Help clarify the Concept: what this thing is, explained in plain language.',
  whyItMightWork: 'Strengthen The Case for why this idea is worth building.',
  aesthetic: 'Refine the visual direction: describe aesthetic style, references, and mood in actionable terms.',
  retrospective: 'Help write a candid retrospective with outcomes, lessons learned, and what to carry forward.',
};

const AI_FIELD_DISPLAY_LABELS: Record<AiSuggestionField, string> = {
  pitch: 'Elevator Pitch',
  fullNotes: 'The Spark / Raw Notes',
  risks: 'Risks & Blockers',
  techStack: 'Build Notes',
  hook: 'Concept',
  whyItMightWork: 'The Case',
  aesthetic: 'Aesthetic & Style',
  retrospective: 'Retrospective',
};

export function promptForSuggestion(idea: Idea, field: AiSuggestionField, currentValue: string): AiProviderMessage[] {
  return [
    {
      role: 'system',
      content: [
        FIELD_ASSIST_PROMPT,
        fieldSuggestionStageExpectation(idea.stage, field),
        fieldOutputContract(field),
        fieldAssistIntentContract('improve'),
        'For this request, return only JSON with keys "suggestion" and "rationale".',
        'The suggestion must revise or extend the target field, not replace the user as the source of creativity.',
        'The suggestion value must be usable field text, not a review of the field or a description of what you would change.',
        'Do not include markdown formatting in the suggestion or rationale.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea) },
    {
      role: 'user',
      content: [
        FIELD_SUGGESTION_PROMPTS[field],
        '',
        `Target field: ${field} (${AI_FIELD_DISPLAY_LABELS[field]})`,
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
  intent?: AiFieldAssistIntent,
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
        fieldSuggestionStageExpectation(idea.stage, field),
        fieldOutputContract(field),
        fieldAssistIntentContract(intent, omitCurrentValue),
        'For this field-assist request, return only JSON with keys "suggestion" and "rationale".',
        omitCurrentValue
          ? 'This is a write-from-scratch request. The suggestion must be a complete standalone value for the target field using the rest of the idea context as source material.'
          : 'The suggestion must revise or extend the target field, not replace the user as the source of creativity.',
        'The suggestion value must be usable field text, not a review of the field or a description of what you would change.',
        'Do not include markdown formatting in the suggestion or rationale.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea, omitCurrentValue ? [field] : []) },
    {
      role: 'user',
      content: [
        customPrompt?.trim() || FIELD_SUGGESTION_PROMPTS[field],
        '',
        `Target field: ${field} (${AI_FIELD_DISPLAY_LABELS[field]})`,
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
        fieldSuggestionStageExpectation(idea.stage, field),
        fieldOutputContract(field),
        'You are assisting with one specific Seedbank idea field in a modal-local conversation.',
        'Do not use or update the persistent Thinking Partner conversation.',
        'Keep replies focused on the target field. If you draft field text, make it easy to apply.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea) },
    {
      role: 'system',
      content: [
        `Target field: ${field} (${AI_FIELD_DISPLAY_LABELS[field]})`,
        `Current value: ${currentValue || '(empty)'}`,
      ].join('\n'),
    },
    ...safeHistory,
    { role: 'user', content: nextUserMessage },
  ];
}

export function promptForMode(mode: string, context: unknown, prompt?: string): AiProviderMessage[] {
  const stageAwareHealthContext = mode === 'health-check'
    ? healthCheckStageContext(context)
    : undefined;
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
        ...(stageAwareHealthContext ? [stageAwareHealthContext] : []),
        'Context:',
        JSON.stringify(context ?? {}, null, 2),
      ].filter(Boolean).join('\n'),
    },
  ];
}

function healthCheckStageContext(context: unknown): string {
  if (!context || typeof context !== 'object') return '';
  const idea = (context as { idea?: unknown }).idea;
  if (!idea || typeof idea !== 'object') return '';
  const stage = (idea as { stage?: unknown }).stage;
  if (typeof stage !== 'string') return '';

  try {
    const readiness = assessReadiness(idea as Idea);
    return [
      `Health-check stage context: current stage is "${stage}".`,
      `Readiness toward "${readiness.nextStage}": ${readiness.ready ? 'ready' : 'not ready'}.`,
      readiness.met.length > 0 ? `Criteria met: ${readiness.met.join('; ')}` : 'Criteria met: none yet.',
      readiness.missing.length > 0 ? `Criteria missing: ${readiness.missing.join('; ')}` : 'Criteria missing: none.',
      'Calibrate your critique to this stage. Do not penalize early-stage ideas for fields that are intentionally later-stage.',
    ].join('\n');
  } catch {
    return `Health-check stage context: current stage is "${stage}". Calibrate feedback to this stage and avoid irrelevant late-stage criticism.`;
  }
}

export function promptForProjectDraft(idea: Idea, prompt?: string): AiProviderMessage[] {
  const requestedFiles = prompt?.trim() || 'Draft practical starter project files for this idea.';
  return [
    {
      role: 'system',
      content: [
        'You draft reviewable project files from a Seedbank idea.',
        'Return only a single JSON object with keys "summary" and "files". No prose, no markdown fences, no commentary before or after.',
        '"files" must be an array of objects with "path", "content", and optional "description".',
        'Use relative paths only. Do not use absolute paths, parent traversal, hidden directories, or generated binaries.',
        'Prefer concise Markdown and plain text files unless the user asks for code.',
        'CRITICAL JSON FORMATTING: every "content" value is a JSON string. All newlines inside file content MUST be escaped as \\n. All tabs as \\t. All literal backslashes as \\\\. All double quotes as \\". Never emit a raw newline, tab, or unescaped backslash inside a string value — that produces invalid JSON and the response will be rejected.',
        'If you would normally wrap your answer in a markdown code fence, do not — return the raw JSON object only.',
      ].join(' '),
    },
    { role: 'system', content: ideaContext(idea) },
    {
      role: 'user',
      content: [
        requestedFiles,
        '',
        'Good default outputs include README.md, SPEC.md, IMPLEMENTATION_NOTES.md, and TODO.md when they fit the idea.',
        'Keep each file focused enough for the user to review before using it.',
      ].join('\n'),
    },
  ];
}

export function promptForLandscapeAnalysis(idea: Idea, prompt?: string): AiProviderMessage[] {
  const requestedScope = prompt?.trim() || 'Assess this idea’s competitive landscape and viability honestly.';
  const context: Record<string, unknown> = {};
  if (idea.title) context.title = idea.title;
  if (idea.pitch) context.pitch = idea.pitch;
  if (idea.category) context.category = idea.category;
  if (idea.stage) context.stage = idea.stage;
  if (idea.tags?.length) context.tags = idea.tags;
  if (idea.fullNotes) context.fullNotes = idea.fullNotes;
  if (idea.hook) context.hook = idea.hook;
  if (idea.whyItMightWork) context.whyItMightWork = idea.whyItMightWork;
  if (idea.risks) context.risks = idea.risks;
  if (idea.techStack) context.techStack = idea.techStack;
  if (idea.moodLabels?.length) context.moodLabels = idea.moodLabels;
  if (idea.aesthetic) context.aesthetic = idea.aesthetic;
  if (idea.retrospective) context.retrospective = idea.retrospective;

  return [
    {
      role: 'system',
      content: [
        'You evaluate product/idea landscapes with candid, evidence-oriented reasoning.',
        'Return only JSON with keys: "existingAlternatives", "gapsAndPainPoints", "demandSignals", "positioningAngle", "overallViability".',
        'Each JSON value must be a readable string, not a nested object or array.',
        'Be honest over optimistic. Call out when the space is crowded, weakly demanded, or unclear.',
        'Avoid cheerleading. Include uncertainty when evidence is thin.',
      ].join(' '),
    },
    {
      role: 'system',
      content: [
        'Landscape analysis context:',
        JSON.stringify(context, null, 2),
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        requestedScope,
        '',
        'Cover these sections clearly:',
        '1) Existing Alternatives (overlap and maturity)',
        '2) Gaps & Pain Points (underserved needs, user frustration)',
        '3) Demand Signals (evidence users seek solutions)',
        '4) Positioning Angle (what could make this compelling)',
        '5) Overall Viability (candid conclusion)',
      ].join('\n'),
    },
  ];
}

export function featureForMode(mode: string): AiFeatureId {
  if (mode === 'health-check') return 'health-check';
  if (mode === 'pattern-insights' || mode === 'smart-cross-pollinate') return 'discover-insights';
  if (mode === 'landscape-analysis') return 'landscape-analysis';
  return 'default';
}

function extractJsonObject(text: string, errorMessage = 'AI response was not valid JSON.'): unknown {
  const trimmed = text.trim();

  // Always try the raw trimmed text first. Only fall through to fence-stripping
  // when the response actually starts with a code fence — otherwise the regex
  // greedily matches the *first* pair of triple-backticks anywhere in the text,
  // which for project-draft responses lands inside a generated markdown file's
  // own code fence and discards the surrounding JSON.
  const parseCandidates: string[] = [trimmed];
  if (trimmed.startsWith('```')) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const fencedInner = fenced?.[1]?.trim();
    if (fencedInner) parseCandidates.push(fencedInner);
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) parseCandidates.push(trimmed.slice(start, end + 1));

  let lastError: unknown;
  for (const item of parseCandidates) {
    // Order matters: try the raw item, then progressively more aggressive repairs.
    // stripStructuralInvisibles removes zero-width / control chars that V8 rejects
    // as unexpected tokens; sanitizeJsonStringContents handles the common Opus
    // failure where file content strings contain literal newlines or stray
    // backslashes; repairJsonLikeObject handles unquoted keys and trailing commas.
    const stripped = stripStructuralInvisibles(item);
    const sanitized = sanitizeJsonStringContents(stripped);
    const attempts = [
      item,
      stripped,
      sanitized,
      repairJsonLikeObject(stripped),
      repairJsonLikeObject(sanitized),
    ];
    for (const attempt of attempts) {
      try {
        return JSON.parse(attempt);
      } catch (err) {
        lastError = err;
      }
    }
  }

  // Emit the failing payload + diagnostics. The character-code dump near the
  // failure position is the difference between guessing and knowing for the
  // invisible-character class of failures.
  const detail = lastError instanceof Error ? ` ${lastError.message}` : '';
  const preview = text.trim().slice(0, 240).replace(/\s+/g, ' ');
  const previewSuffix = preview ? ` Response preview: "${preview}${text.length > 240 ? '\u2026' : ''}"` : '';
  const charCodes = text.trim().slice(0, 16).split('').map((c) => `U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join(' ');
  const codesSuffix = charCodes ? ` First chars: [${charCodes}]` : '';
  // Persist the full raw response to a debug log so the bytes can be inspected
  // offline. Truncated at 200KB to keep things bounded. Best-effort only \u2014 never
  // throw from the diagnostics path.
  try {
    const debugDir = '/tmp/seedbank-ai-debug';
    fs.mkdirSync(debugDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const file = `${debugDir}/json-parse-fail-${stamp}.txt`;
    fs.writeFileSync(file, text.slice(0, 200_000), 'utf8');
    console.error(`[ai] parse-failure raw response written to ${file}`);
  } catch {
    // ignore \u2014 diagnostics are best-effort
  }
  throw new Error(`${errorMessage}${detail}${previewSuffix}${codesSuffix}`);
}

/**
 * Strip zero-width, BOM, and structural control characters that appear OUTSIDE
 * JSON string values. These don't match \s in JS regex but V8's JSON.parse
 * rejects them as unexpected tokens. Characters preserved inside string values
 * because the model may legitimately have included them in content.
 */
function stripStructuralInvisibles(value: string): string {
  // Characters to nuke when not inside a string: BOM (U+FEFF), zero-width space
  // (U+200B), zero-width non-joiner (U+200C), zero-width joiner (U+200D),
  // word joiner (U+2060), left-to-right mark (U+200E), right-to-left mark (U+200F),
  // and other C0/C1 control chars that aren't valid JSON whitespace.
  // JSON's allowed whitespace is just space, tab, newline, CR.
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? '';
    const code = char.charCodeAt(0);

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    // Outside a string: drop BOM, zero-width family, bidi marks, and any C0
    // control char that isn't \t (0x09), \n (0x0A), or \r (0x0D).
    if (code === 0xFEFF || code === 0x200B || code === 0x200C || code === 0x200D
        || code === 0x200E || code === 0x200F || code === 0x2060
        || code === 0x00A0 // non-breaking space \u2192 drop
        || (code < 0x20 && code !== 0x09 && code !== 0x0A && code !== 0x0D)
        || (code >= 0x7F && code <= 0x9F) // C1 controls
    ) {
      // skip
      continue;
    }
    output += char;
  }
  return output;
}

function repairJsonLikeObject(value: string): string {
  return removeTrailingCommasOutsideStrings(quoteObjectKeysOutsideStrings(value.replace(/^\uFEFF/, '')));
}

/**
 * Repair a JSON-ish payload where the model emitted literal control characters
 * (newlines, tabs, carriage returns) inside string values, or bare backslashes
 * not followed by a valid JSON escape character. Walks the text tracking string
 * state with the same approach as quoteObjectKeysOutsideStrings.
 */
function sanitizeJsonStringContents(value: string): string {
  let output = '';
  let inString = false;
  let quote = '';

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? '';

    if (!inString) {
      if (char === '"' || char === "'") {
        inString = true;
        quote = char;
      }
      output += char;
      continue;
    }

    if (char === '\\') {
      const next = value[index + 1];
      // Valid JSON escape characters per the spec, plus single-quote which some models emit.
      if (next !== undefined && /["\\/bfnrtu']/.test(next)) {
        output += char + next;
        index += 1;
      } else {
        // Bare backslash with no valid escape continuation \u2014 double it.
        output += '\\\\';
      }
      continue;
    }

    if (char === quote) {
      inString = false;
      quote = '';
      output += char;
      continue;
    }

    // Inside a string: replace literal control characters with their JSON escapes.
    if (char === '\n') output += '\\n';
    else if (char === '\r') output += '\\r';
    else if (char === '\t') output += '\\t';
    else if (char === '\b') output += '\\b';
    else if (char === '\f') output += '\\f';
    else output += char;
  }

  return output;
}

function quoteObjectKeysOutsideStrings(value: string): string {
  let output = '';
  let index = 0;
  let inString = false;
  let quote = '';
  let escaped = false;

  while (index < value.length) {
    const char = value[index] ?? '';
    output += char;

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = '';
      }
      index += 1;
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      index += 1;
      continue;
    }

    if (char !== '{' && char !== ',') {
      index += 1;
      continue;
    }

    let cursor = index + 1;
    while (cursor < value.length && /\s/.test(value[cursor] ?? '')) {
      output += value[cursor] ?? '';
      cursor += 1;
    }

    const keyStart = cursor;
    const first = value[cursor] ?? '';
    if (!/[A-Za-z_$]/.test(first)) {
      index = cursor;
      continue;
    }

    cursor += 1;
    while (cursor < value.length && /[\w$-]/.test(value[cursor] ?? '')) cursor += 1;
    const key = value.slice(keyStart, cursor);
    let colonCursor = cursor;
    while (colonCursor < value.length && /\s/.test(value[colonCursor] ?? '')) colonCursor += 1;

    if (value[colonCursor] === ':') {
      output += `"${key}"`;
      output += value.slice(cursor, colonCursor + 1);
      index = colonCursor + 1;
    } else {
      output += key;
      index = cursor;
    }
  }

  return output;
}

function removeTrailingCommasOutsideStrings(value: string): string {
  let output = '';
  let inString = false;
  let quote = '';
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? '';

    if (inString) {
      output += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        inString = false;
        quote = '';
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inString = true;
      quote = char;
      output += char;
      continue;
    }

    if (char === ',') {
      let cursor = index + 1;
      while (cursor < value.length && /\s/.test(value[cursor] ?? '')) cursor += 1;
      if (value[cursor] === '}' || value[cursor] === ']') continue;
    }

    output += char;
  }

  return output;
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
  const parsed = extractJsonObject(text, 'AI project draft response was not valid JSON.') as { summary?: unknown; files?: unknown };
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

export function parseLandscapeAnalysis(text: string): AiLandscapeAnalysisSections {
  const isRecord = (value: unknown): value is Record<string, unknown> => (
    Boolean(value) && typeof value === 'object' && !Array.isArray(value)
  );

  const labelForKey = (key: string): string => key
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());

  const indent = (value: string, prefix: string): string => value
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');

  const formatLandscapeValue = (value: unknown): string => {
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          const formatted = formatLandscapeValue(item);
          if (!formatted) return '';
          return formatted.includes('\n') ? `- ${formatted.replace(/\n/g, '\n  ')}` : `- ${formatted}`;
        })
        .filter(Boolean)
        .join('\n');
    }
    if (isRecord(value)) {
      return Object.entries(value)
        .map(([key, item]) => {
          const formatted = formatLandscapeValue(item);
          if (!formatted) return '';
          const label = labelForKey(key);
          return Array.isArray(item) || formatted.includes('\n')
            ? `${label}:\n${indent(formatted, '  ')}`
            : `${label}: ${formatted}`;
        })
        .filter(Boolean)
        .join('\n');
    }
    return '';
  };

  // Try to find a value across common key-name variations.
  const findKey = (obj: Record<string, unknown>, ...candidates: string[]): string => {
    for (const key of candidates) {
      if (obj[key] !== undefined) {
        const formatted = formatLandscapeValue(obj[key]);
        if (formatted) return formatted;
      }
    }
    // Also try case-insensitive match.
    const lowerCandidates = candidates.map((c) => c.toLowerCase());
    for (const [k, v] of Object.entries(obj)) {
      if (lowerCandidates.includes(k.toLowerCase())) {
        const formatted = formatLandscapeValue(v);
        if (formatted) return formatted;
      }
    }
    return '';
  };

  try {
    const parsed = extractJsonObject(text, 'AI landscape analysis response was not valid JSON.') as Record<string, unknown>;

    const result: AiLandscapeAnalysisSections = {
      existingAlternatives: findKey(parsed, 'existingAlternatives', 'existing_alternatives', 'alternatives', 'existingAlternative'),
      gapsAndPainPoints: findKey(parsed, 'gapsAndPainPoints', 'gaps_and_pain_points', 'gapsPainPoints', 'gaps', 'painPoints', 'gapsAndPains'),
      demandSignals: findKey(parsed, 'demandSignals', 'demand_signals', 'demand'),
      positioningAngle: findKey(parsed, 'positioningAngle', 'positioning_angle', 'positioning'),
      overallViability: findKey(parsed, 'overallViability', 'overall_viability', 'viability', 'overall'),
    };

    // If JSON parsed but all sections are empty, the AI returned JSON with unexpected keys
    // Fall back to raw text so the user at least sees something
    const allEmpty = Object.values(result).every((v) => !v);
    if (allEmpty) {
      return {
        existingAlternatives: '',
        gapsAndPainPoints: '',
        demandSignals: '',
        positioningAngle: '',
        overallViability: text.trim() || 'No analysis returned.',
      };
    }
    return result;
  } catch {
    // JSON extraction failed entirely — try parsing markdown headers
    const sections: AiLandscapeAnalysisSections = {
      existingAlternatives: '',
      gapsAndPainPoints: '',
      demandSignals: '',
      positioningAngle: '',
      overallViability: '',
    };

    const headerMap: Array<[RegExp, keyof AiLandscapeAnalysisSections]> = [
      [/#+\s*existing\s+alternatives?/i, 'existingAlternatives'],
      [/#+\s*gaps?\s*(?:&|and)\s*pain\s*points?/i, 'gapsAndPainPoints'],
      [/#+\s*demand\s+signals?/i, 'demandSignals'],
      [/#+\s*positioning\s+angle/i, 'positioningAngle'],
      [/#+\s*overall\s+viability/i, 'overallViability'],
    ];

    const lines = text.split('\n');
    let currentKey: keyof AiLandscapeAnalysisSections | null = null;
    const buffer: string[] = [];

    for (const line of lines) {
      let matched = false;
      for (const [pattern, key] of headerMap) {
        if (pattern.test(line)) {
          if (currentKey && buffer.length) {
            sections[currentKey] = buffer.join('\n').trim();
            buffer.length = 0;
          }
          currentKey = key;
          matched = true;
          break;
        }
      }
      if (!matched && currentKey) {
        buffer.push(line);
      }
    }
    if (currentKey && buffer.length) {
      sections[currentKey] = buffer.join('\n').trim();
    }

    // If markdown parsing also found nothing, put raw text in overallViability
    const allEmpty = Object.values(sections).every((v) => !v);
    if (allEmpty) {
      sections.overallViability = text.trim() || 'No analysis returned.';
    }

    return sections;
  }
}

export function parseSuggestion(field: AiSuggestionField, text: string): AiSuggestion {
  const { suggestion, rationale } = extractSuggestion(text);
  return {
    field,
    suggestion,
    rationale,
  };
}
