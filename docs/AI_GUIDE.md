# AI Guide

Seedbank's AI features are designed to help you develop your own ideas. The AI is a thinking partner: it asks questions, reflects gaps, and offers focused suggestions without taking over the creative direction.

## Provider Setup

Open the AI panel on an idea detail page and use **Settings** to choose a provider.

### OpenAI

Provide an OpenAI API key and model name. The default model is set in the UI config and can be changed without code changes.

### Anthropic

Provide an Anthropic API key and model name. Anthropic works well for reflective critique and longer contextual responses.

### Ollama

Use Ollama for local models. Configure:

- Ollama base URL, usually `http://localhost:11434`
- Model name, for example `llama3.2`

Ollama is useful when you want local-only experimentation or do not want to send idea context to a hosted provider.

## Stored Configuration

AI configuration is stored in the server `settings` table. Public config responses expose model names and whether a key exists, but not the key value itself. Provider calls are made by the server, not directly from the browser.

The AI service tracks token usage against a daily budget. The budget is configured in the AI settings UI.

## Thinking Partner Chat

The Thinking Partner panel is available on the idea detail page. It sees the current idea fields and the persisted conversation history for that idea.

The system behavior is intentionally constrained:

- Ask questions before suggesting.
- Reflect what is already in the idea.
- Challenge assumptions gently.
- Avoid generating unrelated ideas.
- Keep the user's creativity in control.

Messages are streamed from `POST /api/ai/chat` and persisted per idea.

## Contextual Field Suggestions

Field-level AI prompts use `POST /api/ai/suggest`.

Supported fields:

- `pitch` — sharpen a one-line explanation.
- `risks` — identify missing blockers or failure modes.
- `techStack` — suggest implementation tools and constraints.
- `hook` — clarify the 30-second demo.
- `whyItMightWork` — strengthen the argument for the idea.

Suggestions are shown as suggestions, not silent replacements. The user chooses whether to apply them.

## Organic Prompt Modes

Organic modes are available in the AI chat panel.

### What If

Asks one provocative "what if" question and waits for the user's response before going further.

Good for:

- Breaking a stale framing.
- Finding a surprising angle.
- Exploring inversions or constraints.

### Devil's Advocate

Challenges the weakest assumption in the idea without dismissing it.

Good for:

- Finding hidden risks.
- Testing whether the idea has a real user.
- Separating excitement from evidence.

### Scope Down

Pushes the idea toward the smallest viable test.

Good for:

- Jam projects.
- First prototypes.
- Reducing a broad concept to one screen, one mechanic, or one workflow.

### User Story

Asks about a specific person in a specific situation.

Good for:

- Clarifying who the idea serves.
- Avoiding abstract feature lists.
- Finding the moment of need.

## Idea Health Check

The Idea Health Check appears on the idea detail page. It calls:

```ts
aiSuggest('health-check', { idea, fields })
```

It combines AI summary text with field-by-field readiness feedback for:

- Pitch
- Hook
- Why It Might Work
- Risks
- Tech Stack
- Tags

Each field is marked as strong or needing attention, giving the user a concrete next editing target.

## Smart Cross-Pollinate

Smart Cross-Pollinate lives on the Discover page. Instead of showing only random pairs, Seedbank looks for ideas with useful contrast or shared traits, then asks the AI why they might combine well.

The goal is not to mash everything together. The goal is to uncover hidden relationships in the archive.

## Pattern Insights

Pattern Insights analyze the full archive and surface repeated themes, categories, tags, or constraints.

Example insights:

- Several local-first tools could share infrastructure.
- Multiple game ideas use the same mood or mechanic.
- Several app ideas need the same authentication or sync foundation.

## Failure Modes and Fallbacks

If the AI backend is unavailable, Seedbank keeps working:

- The editor still saves.
- Field checks can show deterministic local guidance.
- Discover still has non-AI pattern summaries.
- The Thinking Partner panel reports provider errors without losing the idea.

This preserves Seedbank's core promise: the archive remains useful even without a model provider.
