import type { Express, Request, Response, NextFunction } from 'express';
import { requireScope } from '../middleware/auth.js';
import type { AiConfigPatch } from './types.js';
import type { AiService } from './service.js';
import type {
  AiFeatureId,
  AiFieldAssistChatRequest,
  AiFieldAssistMessage,
  AiFieldSuggestionRequest,
  AiMethodCapability,
  AiPreflightRequest,
  AiProjectDraftRequest,
  AiLandscapeAnalysisRequest,
  AiProviderInstanceId,
  AiReasoningEffort,
  AiSuggestionField,
  AiTextVerbosity,
} from '../../../shared/types.js';

function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void> | void,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function routeParam(req: Request, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] ?? '' : value;
}

function clientKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'local';
}

const AI_SUGGESTION_FIELDS: readonly AiSuggestionField[] = [
  'pitch',
  'fullNotes',
  'risks',
  'techStack',
  'hook',
  'whyItMightWork',
  'aesthetic',
  'retrospective',
];
const AI_SUGGESTION_FIELD_ERROR = 'field must be one of pitch, fullNotes, risks, techStack, hook, whyItMightWork, aesthetic, or retrospective.';
const AI_FEATURE_IDS: readonly AiFeatureId[] = ['thinking-partner', 'field-suggestions', 'health-check', 'discover-insights', 'landscape-analysis', 'project-drafting', 'default'];
const AI_REASONING_EFFORTS: readonly AiReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];
const AI_TEXT_VERBOSITIES: readonly AiTextVerbosity[] = ['low', 'medium', 'high'];

function parseAiSuggestionField(value: unknown): AiSuggestionField | undefined {
  return typeof value === 'string' && AI_SUGGESTION_FIELDS.includes(value as AiSuggestionField)
    ? value as AiSuggestionField
    : undefined;
}

function parseAiFeatureId(value: unknown): AiFeatureId | undefined {
  return typeof value === 'string' && AI_FEATURE_IDS.includes(value as AiFeatureId)
    ? value as AiFeatureId
    : undefined;
}

function parseAiReasoningEffort(value: unknown): AiReasoningEffort | undefined {
  return typeof value === 'string' && AI_REASONING_EFFORTS.includes(value as AiReasoningEffort)
    ? value as AiReasoningEffort
    : undefined;
}

function parseAiTextVerbosity(value: unknown): AiTextVerbosity | undefined {
  return typeof value === 'string' && AI_TEXT_VERBOSITIES.includes(value as AiTextVerbosity)
    ? value as AiTextVerbosity
    : undefined;
}

function parseProviderInstanceId(value: unknown): AiProviderInstanceId | undefined {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,95}$/.test(value)
    ? value as AiProviderInstanceId
    : undefined;
}

function optionalString(value: unknown, fieldName: string): { ok: true; value?: string } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true };
  if (typeof value !== 'string') return { ok: false, error: `${fieldName} must be a string.` };
  return { ok: true, value };
}

function requiredString(value: unknown, fieldName: string): { ok: true; value: string } | { ok: false; error: string } {
  if (typeof value !== 'string') return { ok: false, error: `${fieldName} must be a string.` };
  const trimmed = value.trim();
  return trimmed ? { ok: true, value: trimmed } : { ok: false, error: `${fieldName} is required.` };
}

function parseFieldAssistHistory(value: unknown): { ok: true; value: AiFieldAssistMessage[] } | { ok: false; error: string } {
  if (value === undefined || value === null) return { ok: true, value: [] };
  if (!Array.isArray(value)) return { ok: false, error: 'history must be an array.' };
  const messages: AiFieldAssistMessage[] = [];
  for (const [index, item] of value.entries()) {
    if (!item || typeof item !== 'object') return { ok: false, error: `history[${index}] must be an object.` };
    const message = item as { role?: unknown; content?: unknown };
    if (message.role !== 'user' && message.role !== 'assistant') {
      return { ok: false, error: `history[${index}].role must be "user" or "assistant".` };
    }
    if (typeof message.content !== 'string') {
      return { ok: false, error: `history[${index}].content must be a string.` };
    }
    messages.push({ role: message.role, content: message.content });
  }
  return { ok: true, value: messages };
}

function contextIdeas(context: unknown): Array<Record<string, unknown>> {
  if (!context || typeof context !== 'object') return [];
  const value = (context as { ideas?: unknown }).ideas;
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object') : [];
}

function contextIdea(context: unknown): Record<string, unknown> | undefined {
  if (!context || typeof context !== 'object') return undefined;
  const value = (context as { idea?: unknown }).idea;
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function stringField(source: Record<string, unknown> | undefined, key: string): string {
  const value = source?.[key];
  return typeof value === 'string' ? value : '';
}

function fallbackAiSuggestion(mode: string, context: unknown): string {
  const ideas = contextIdeas(context);
  const idea = contextIdea(context);
  const title = stringField(idea, 'title') || 'this idea';
  const risks = stringField(idea, 'risks');
  const pitch = stringField(idea, 'pitch');

  if (mode === 'pattern-insights') {
    const categories = new Map<string, number>();
    for (const item of ideas) {
      const category = stringField(item, 'category');
      if (category) categories.set(category, (categories.get(category) ?? 0) + 1);
    }
    const strongest = [...categories.entries()].sort((a, b) => b[1] - a[1])[0];
    return strongest
      ? `Your archive leans toward ${strongest[0]} ideas (${strongest[1]} total). Look for shared infrastructure, reusable UI, or a common starter template that could make several of them easier to test.`
      : 'Your archive is still forming patterns. Add a few more developed pitches, risks, and tech notes, then look for repeated constraints.';
  }

  if (mode === 'smart-cross-pollinate') {
    const first = stringField(ideas[0], 'title') || 'one idea';
    const second = stringField(ideas[1], 'title') || 'another idea';
    return `${first} and ${second} may combine well if one supplies the user workflow and the other supplies the interaction model. Try asking what shared problem both are circling.`;
  }

  if (mode === 'health-check') {
    const missing: string[] = [];
    if (!pitch.trim()) missing.push('pitch');
    if (!risks.trim()) missing.push('risks');
    if (!stringField(idea, 'hook').trim()) missing.push('hook');
    if (!stringField(idea, 'techStack').trim()) missing.push('tech stack');
    return missing.length
      ? `${title} has a useful core, but the next best pass is to fill in ${missing.join(', ')}. Start with one concrete user and one thing that could make the idea fail.`
      : `${title} looks well-rounded. The next useful question is whether the smallest test can be built in a day or needs a narrower first slice.`;
  }

  if (mode === 'devils-advocate') {
    const knownContext = [
      pitch.trim() ? `pitch: ${pitch.trim()}` : '',
      stringField(idea, 'hook').trim() ? `concept: ${stringField(idea, 'hook').trim()}` : '',
      stringField(idea, 'whyItMightWork').trim() ? `case: ${stringField(idea, 'whyItMightWork').trim()}` : '',
      stringField(idea, 'techStack').trim() ? `build notes: ${stringField(idea, 'techStack').trim()}` : '',
      risks.trim() ? `known risks: ${risks.trim()}` : '',
    ].filter(Boolean).join(' ');
    return knownContext
      ? `For ${title}, use this context only: ${knownContext} What specific assumption in that context would most weaken the project if false, and what is the smallest way to test it?`
      : `For ${title}, there is not enough project context to challenge accurately yet. What missing detail would reveal the riskiest assumption: target user, core workflow, technical approach, or why now?`;
  }

  if (mode === 'scope-down') {
    return `What is the smallest version of ${title} that proves the hook without accounts, sync, polish, or edge cases? Keep only one user action and one visible result.`;
  }

  if (mode === 'user-story') {
    return `Who is already trying to solve the problem behind ${title} today, and what are they doing awkwardly instead? Describe that person in one concrete scene.`;
  }

  return `What if ${title} had to be tested with one screen, one interaction, and no setup? What would you keep?`;
}

function aiMethodCapabilities(aiService: AiService): AiMethodCapability[] {
  return aiService.getMethodCapabilities();
}

export function registerAiRoutes(
  app: Express,
  aiService: AiService,
): void {
  app.get('/api/ai/config', requireScope('read:ideas'), asyncRoute((_req, res) => {
    res.json(aiService.getPublicConfig());
  }));

  app.get('/api/ai/providers', requireScope('read:ideas'), asyncRoute((_req, res) => {
    const config = aiService.getPublicConfig();
    res.json({
      providers: aiService.getProviderDescriptors(),
      providerInstances: config.providerInstances,
      providerInstanceRegistry: aiService.getProviderInstanceRegistry(),
      diagnostics: aiService.getProviderInstanceDiagnostics(),
    });
  }));

  app.get('/api/ai/method-capabilities', requireScope('read:ideas'), asyncRoute((_req, res) => {
    res.json({ methods: aiMethodCapabilities(aiService) });
  }));

  app.get('/api/ai/usage', requireScope('read:ideas'), asyncRoute((_req, res) => {
    res.json(aiService.getUsageSummary());
  }));

  app.get('/api/ai/usage/detail', requireScope('read:ideas'), asyncRoute((_req, res) => {
    res.json(aiService.getUsageDetail());
  }));

  app.post('/api/ai/config', requireScope('write:ideas'), asyncRoute((req, res) => {
    res.json(aiService.configure(req.body ?? {}));
  }));

  app.post('/api/ai/preflight', requireScope('read:ideas'), asyncRoute((req, res) => {
    const body = (req.body ?? {}) as Partial<AiPreflightRequest>;
    const feature = parseAiFeatureId(body.feature);
    if (!feature) {
      res.status(400).json({ error: 'feature must be a known AI feature id.' });
      return;
    }
    const model = optionalString(body.model, 'model');
    if (!model.ok) {
      res.status(400).json({ error: model.error });
      return;
    }
    res.json(aiService.preflight(feature, {
      providerInstanceId: parseProviderInstanceId(body.providerInstanceId),
      ...(model.value?.trim() ? { model: model.value.trim() } : {}),
      effort: parseAiReasoningEffort(body.effort),
      verbosity: parseAiTextVerbosity(body.verbosity),
    }));
  }));

  app.post('/api/ai/test', requireScope('write:ideas'), asyncRoute(async (req, res) => {
    res.json(await aiService.testProvider((req.body ?? {}) as AiConfigPatch));
  }));

  app.post('/api/ai/models', requireScope('write:ideas'), asyncRoute(async (req, res) => {
    res.json(await aiService.listModels((req.body ?? {}) as AiConfigPatch));
  }));

  app.post('/api/ai/list-models', requireScope('write:ideas'), asyncRoute(async (req, res) => {
    res.json(await aiService.listModels((req.body ?? {}) as AiConfigPatch));
  }));

  app.get('/api/settings/ai', requireScope('read:ideas'), asyncRoute((_req, res) => {
    res.json(aiService.getPublicConfig());
  }));

  app.post('/api/settings/ai', requireScope('write:ideas'), asyncRoute((req, res) => {
    res.json(aiService.configure((req.body ?? {}) as AiConfigPatch));
  }));

  app.get('/api/ai/claude-account/status', requireScope('read:ideas'), asyncRoute(async (_req, res) => {
    const { loadTokens, claudeAccountRuntimeAvailability } = await import('./claude-account/auth.js');
    const gate = claudeAccountRuntimeAvailability();
    if (!gate.available) {
      res.json({ available: false, unavailableReason: gate.reason, authenticated: false });
      return;
    }
    const { setCachedClaudeAccountAuth } = await import('./service.js');
    const tokens = await loadTokens();
    const authenticated = tokens !== null && tokens.expiresAt > Date.now();
    setCachedClaudeAccountAuth(authenticated);
    if (authenticated) await aiService.refreshDiscoveredModels('claude-account');
    res.json({
      available: true,
      authenticated,
      expiresAt: tokens?.expiresAt ?? null,
      obtainedAt: tokens?.obtainedAt ?? null,
    });
  }));

  app.post('/api/ai/claude-account/login', requireScope('write:ideas'), asyncRoute(async (_req, res) => {
    const { claudeAccountRuntimeAvailability } = await import('./claude-account/auth.js');
    const gate = claudeAccountRuntimeAvailability();
    if (!gate.available) {
      res.status(503).json({ error: gate.reason });
      return;
    }
    const { startBootstrap } = await import('./claude-account/oauth.js');
    const result = await startBootstrap();
    res.json(result);
  }));

  app.post('/api/ai/claude-account/login/complete', requireScope('write:ideas'), asyncRoute(async (req, res) => {
    const { claudeAccountRuntimeAvailability } = await import('./claude-account/auth.js');
    const gate = claudeAccountRuntimeAvailability();
    if (!gate.available) {
      res.status(503).json({ error: gate.reason });
      return;
    }
    const body = req.body as { url?: string };
    if (!body.url || typeof body.url !== 'string') {
      res.status(400).json({ error: 'url is required (paste the callback redirect URL).' });
      return;
    }
    const { completeBootstrap } = await import('./claude-account/oauth.js');
    const { setCachedClaudeAccountAuth } = await import('./service.js');
    await completeBootstrap(body.url);
    setCachedClaudeAccountAuth(true);
    await aiService.refreshDiscoveredModels('claude-account');
    res.json({ ok: true });
  }));

  app.post('/api/ai/claude-account/logout', requireScope('write:ideas'), asyncRoute(async (_req, res) => {
    const { clearTokens, claudeAccountRuntimeAvailability } = await import('./claude-account/auth.js');
    const gate = claudeAccountRuntimeAvailability();
    if (!gate.available) {
      res.status(503).json({ error: gate.reason });
      return;
    }
    const { setCachedClaudeAccountAuth } = await import('./service.js');
    await clearTokens();
    setCachedClaudeAccountAuth(false);
    res.json({ ok: true });
  }));

  app.get('/api/ai/codex-account/status', requireScope('read:ideas'), asyncRoute(async (_req, res) => {
    const { codexAccountSession } = await import('./codex-account/session.js');
    const { setCachedCodexAccountAuth } = await import('./service.js');
    const status = await codexAccountSession.status();
    setCachedCodexAccountAuth(status.authenticated);
    if (status.authenticated) await aiService.refreshDiscoveredModels('codex-account');
    res.json(status);
  }));

  app.post('/api/ai/codex-account/login', requireScope('write:ideas'), asyncRoute(async (_req, res) => {
    const { codexAccountSession } = await import('./codex-account/session.js');
    res.json(await codexAccountSession.startLogin());
  }));

  app.post('/api/ai/codex-account/logout', requireScope('write:ideas'), asyncRoute(async (_req, res) => {
    const { codexAccountSession } = await import('./codex-account/session.js');
    const { setCachedCodexAccountAuth } = await import('./service.js');
    await codexAccountSession.logout();
    setCachedCodexAccountAuth(false);
    res.json({ ok: true });
  }));

  app.get('/api/ai/conversations/:ideaId', requireScope('read:ideas'), asyncRoute((req, res) => {
    res.json({ messages: aiService.getConversation(routeParam(req, 'ideaId')) });
  }));

  app.post('/api/ai/suggest', requireScope('ai:suggest'), asyncRoute(async (req, res) => {
    const body = req.body as {
      ideaId?: unknown;
      field?: unknown;
      currentValue?: unknown;
      prompt?: unknown;
      omitCurrentValue?: unknown;
      aiConfirmationToken?: unknown;
      providerInstanceId?: unknown;
      model?: unknown;
      effort?: unknown;
      verbosity?: unknown;
      mode?: unknown;
      context?: unknown;
    };
    const prompt = optionalString(body.prompt, 'prompt');
    if (!prompt.ok) {
      res.status(400).json({ error: prompt.error });
      return;
    }
    const aiConfirmationToken = optionalString(body.aiConfirmationToken, 'aiConfirmationToken');
    if (!aiConfirmationToken.ok) {
      res.status(400).json({ error: aiConfirmationToken.error });
      return;
    }

    if (body.ideaId !== undefined || body.field !== undefined) {
      const ideaId = requiredString(body.ideaId, 'ideaId');
      if (!ideaId.ok) {
        res.status(400).json({ error: ideaId.error });
        return;
      }
      const field = parseAiSuggestionField(body.field);
      if (!field) {
        res.status(400).json({ error: AI_SUGGESTION_FIELD_ERROR });
        return;
      }
      const currentValue = optionalString(body.currentValue, 'currentValue');
      if (!currentValue.ok) {
        res.status(400).json({ error: currentValue.error });
        return;
      }
      if (body.omitCurrentValue !== undefined && typeof body.omitCurrentValue !== 'boolean') {
        res.status(400).json({ error: 'omitCurrentValue must be a boolean.' });
        return;
      }
      const model = optionalString(body.model, 'model');
      if (!model.ok) {
        res.status(400).json({ error: model.error });
        return;
      }
      const suggestionRequest: AiFieldSuggestionRequest = {
        ideaId: ideaId.value,
        field,
        currentValue: currentValue.value ?? '',
        ...(prompt.value?.trim() ? { prompt: prompt.value.trim() } : {}),
        ...(body.omitCurrentValue === true ? { omitCurrentValue: true } : {}),
        providerInstanceId: parseProviderInstanceId(body.providerInstanceId),
        ...(model.value?.trim() ? { model: model.value.trim() } : {}),
        effort: parseAiReasoningEffort(body.effort),
        verbosity: parseAiTextVerbosity(body.verbosity),
      };
      const suggestion = await aiService.suggestField(
        suggestionRequest.ideaId,
        suggestionRequest.field,
        suggestionRequest.currentValue,
        clientKey(req),
        suggestionRequest.prompt,
        suggestionRequest.omitCurrentValue,
        aiConfirmationToken.value,
        {
          providerInstanceId: suggestionRequest.providerInstanceId,
          model: suggestionRequest.model,
          effort: suggestionRequest.effort,
          verbosity: suggestionRequest.verbosity,
        },
      );
      res.json(suggestion);
      return;
    }

    const mode = typeof body.mode === 'string' ? body.mode : 'suggest';
    try {
      res.json({
        mode,
        text: await aiService.assistMode(mode, body.context ?? {}, prompt.value, clientKey(req), aiConfirmationToken.value),
      });
    } catch (error) {
      if (typeof (error as { statusCode?: unknown })?.statusCode === 'number') throw error;
      res.json({
        mode,
        text: fallbackAiSuggestion(mode, body.context ?? {}),
      });
    }
  }));

  app.post('/api/ai/field-chat', requireScope('ai:suggest'), async (req, res) => {
    const body = req.body as Partial<AiFieldAssistChatRequest>;
    const field = parseAiSuggestionField(body.field);
    const ideaId = requiredString(body.ideaId, 'ideaId');
    const userMessage = requiredString(body.message, 'message');
    const currentValue = optionalString(body.currentValue, 'currentValue');
    const aiConfirmationToken = optionalString((body as { aiConfirmationToken?: unknown }).aiConfirmationToken, 'aiConfirmationToken');
    const model = optionalString(body.model, 'model');
    const history = parseFieldAssistHistory(body.history);
    if (!ideaId.ok) {
      res.status(400).json({ error: ideaId.error });
      return;
    }
    if (!field) {
      res.status(400).json({ error: AI_SUGGESTION_FIELD_ERROR });
      return;
    }
    if (!userMessage.ok) {
      res.status(400).json({ error: userMessage.error });
      return;
    }
    if (!currentValue.ok) {
      res.status(400).json({ error: currentValue.error });
      return;
    }
    if (!aiConfirmationToken.ok) {
      res.status(400).json({ error: aiConfirmationToken.error });
      return;
    }
    if (!model.ok) {
      res.status(400).json({ error: model.error });
      return;
    }
    if (!history.ok) {
      res.status(400).json({ error: history.error });
      return;
    }

    try {
      aiService.assertFeatureAllowed('field-suggestions', clientKey(req), aiConfirmationToken.value, {
        providerInstanceId: parseProviderInstanceId(body.providerInstanceId),
        ...(model.value?.trim() ? { model: model.value.trim() } : {}),
        effort: parseAiReasoningEffort(body.effort),
        verbosity: parseAiTextVerbosity(body.verbosity),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI field assistance blocked.';
      const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;
      res.status(statusCode).json({ error: message });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    try {
      const assistantMessage = await aiService.streamFieldAssist(
        {
          ideaId: ideaId.value,
          field,
          currentValue: currentValue.value,
          message: userMessage.value,
          history: history.value,
          providerInstanceId: parseProviderInstanceId(body.providerInstanceId),
          ...(model.value?.trim() ? { model: model.value.trim() } : {}),
          effort: parseAiReasoningEffort(body.effort),
          verbosity: parseAiTextVerbosity(body.verbosity),
        },
        clientKey(req),
        (delta) => {
          res.write(`event: delta\ndata: ${JSON.stringify({ delta })}\n\n`);
        },
        aiConfirmationToken.value,
      );
      res.write(`event: message\ndata: ${JSON.stringify({ message: assistantMessage })}\n\n`);
      res.write('event: done\ndata: {}\n\n');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI field assistance failed.';
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.end();
    }
  });

  app.post('/api/ai/project-draft', requireScope('ai:suggest'), asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Partial<AiProjectDraftRequest>;
    const ideaId = requiredString(body.ideaId, 'ideaId');
    const prompt = optionalString(body.prompt, 'prompt');
    const aiConfirmationToken = optionalString(body.aiConfirmationToken, 'aiConfirmationToken');
    const model = optionalString(body.model, 'model');
    if (!ideaId.ok) {
      res.status(400).json({ error: ideaId.error });
      return;
    }
    if (!prompt.ok) {
      res.status(400).json({ error: prompt.error });
      return;
    }
    if (!aiConfirmationToken.ok) {
      res.status(400).json({ error: aiConfirmationToken.error });
      return;
    }
    if (!model.ok) {
      res.status(400).json({ error: model.error });
      return;
    }

    res.json(await aiService.draftProject(
      {
        ideaId: ideaId.value,
        ...(prompt.value?.trim() ? { prompt: prompt.value.trim() } : {}),
        providerInstanceId: parseProviderInstanceId(body.providerInstanceId),
        ...(model.value?.trim() ? { model: model.value.trim() } : {}),
        effort: parseAiReasoningEffort(body.effort),
        verbosity: parseAiTextVerbosity(body.verbosity),
      },
      clientKey(req),
      aiConfirmationToken.value,
    ));
  }));

  app.post('/api/ai/landscape-analysis', requireScope('ai:suggest'), asyncRoute(async (req, res) => {
    const body = (req.body ?? {}) as Partial<AiLandscapeAnalysisRequest>;
    const ideaId = requiredString(body.ideaId, 'ideaId');
    const prompt = optionalString(body.prompt, 'prompt');
    const aiConfirmationToken = optionalString(body.aiConfirmationToken, 'aiConfirmationToken');
    const model = optionalString(body.model, 'model');
    if (!ideaId.ok) {
      res.status(400).json({ error: ideaId.error });
      return;
    }
    if (!prompt.ok) {
      res.status(400).json({ error: prompt.error });
      return;
    }
    if (!aiConfirmationToken.ok) {
      res.status(400).json({ error: aiConfirmationToken.error });
      return;
    }
    if (!model.ok) {
      res.status(400).json({ error: model.error });
      return;
    }

    res.json(await aiService.landscapeAnalysis(
      {
        ideaId: ideaId.value,
        ...(prompt.value?.trim() ? { prompt: prompt.value.trim() } : {}),
        providerInstanceId: parseProviderInstanceId(body.providerInstanceId),
        ...(model.value?.trim() ? { model: model.value.trim() } : {}),
        effort: parseAiReasoningEffort(body.effort),
        verbosity: parseAiTextVerbosity(body.verbosity),
      },
      clientKey(req),
      aiConfirmationToken.value,
    ));
  }));

  app.post('/api/ai/chat', requireScope('ai:suggest'), async (req, res) => {
    const body = req.body as { ideaId?: string; message?: string; aiConfirmationToken?: unknown };
    if (!body.ideaId || !body.message?.trim()) {
      res.status(400).json({ error: 'ideaId and message are required.' });
      return;
    }
    const aiConfirmationToken = optionalString(body.aiConfirmationToken, 'aiConfirmationToken');
    if (!aiConfirmationToken.ok) {
      res.status(400).json({ error: aiConfirmationToken.error });
      return;
    }

    try {
      aiService.assertFeatureAllowed('thinking-partner', clientKey(req), aiConfirmationToken.value);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI chat blocked.';
      const statusCode = typeof (err as { statusCode?: unknown })?.statusCode === 'number'
        ? (err as { statusCode: number }).statusCode
        : 500;
      res.status(statusCode).json({ error: message });
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    });

    try {
      const message = await aiService.streamChat(
        body.ideaId,
        body.message.trim(),
        clientKey(req),
        (delta) => {
          res.write(`event: delta\ndata: ${JSON.stringify({ delta })}\n\n`);
        },
        aiConfirmationToken.value,
      );
      res.write(`event: message\ndata: ${JSON.stringify({ message })}\n\n`);
      res.write('event: done\ndata: {}\n\n');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI chat failed.';
      res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    } finally {
      res.end();
    }
  });
}
