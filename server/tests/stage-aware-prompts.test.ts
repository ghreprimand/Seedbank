import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES } from '../../shared/types.js';
import { newIdea } from '../src/domain.js';
import {
  messagesForChat,
  promptForFieldAssist,
  promptForSuggestion,
  stagePersonality,
} from '../src/ai/prompts.js';

test('stagePersonality returns guidance for every stage', () => {
  for (const stage of STAGES) {
    const text = stagePersonality(stage);
    assert.ok(text.includes('Stage personality'));
    assert.ok(text.length > 20);
  }
});

test('messagesForChat includes stage-aware system guidance', () => {
  const promptStageLabel: Record<(typeof STAGES)[number], string> = {
    seed: 'seed',
    sprout: 'sprout',
    pitch: 'bloom',
    prototype: 'greenhouse',
    plot: 'plot',
    shelved: 'dormant',
    'cold-storage': 'cold-storage',
    shipped: 'market',
  };
  for (const stage of STAGES) {
    const idea = newIdea({ stage });
    const messages = messagesForChat(idea, [], 'Help me move this idea forward.');
    assert.equal(messages[0]?.role, 'system');
    assert.equal(messages[1]?.role, 'system');
    assert.match(messages[0]?.content ?? '', /Ground every question in the supplied idea context/);
    assert.match(messages[0]?.content ?? '', /Treat empty fields as unknown/);
    assert.match(messages[0]?.content ?? '', /first anchor your thinking/);
    assert.match(messages[0]?.content ?? '', /personal daily-driver or learning project/);
    assert.match(messages[0]?.content ?? '', /Do not use markdown bold/);
    assert.ok(messages[1]?.content.includes(`Stage personality: ${promptStageLabel[stage]}.`));
  }
});

test('messagesForChat labels and includes the core idea context fields', () => {
  const idea = newIdea({
    title: 'Offline garden planner',
    pitch: 'Plan a small garden without a cloud account.',
    stage: 'sprout',
    fullNotes: 'Raw notes about seed rotations and low-connectivity use.',
    hook: 'A local-first planting calendar.',
    whyItMightWork: 'Gardeners need reminders even when offline.',
    risks: 'Seasonality data can be wrong by region.',
    techStack: 'SQLite, React, and a local notification scheduler.',
    tags: ['gardening', 'offline'],
  });
  const context = messagesForChat(idea, [], 'What should I think about next?')[2]?.content ?? '';

  assert.match(context, /The Spark \/ Raw Notes \(fullNotes, verbatim\):\nRaw notes about seed rotations/);
  assert.match(context, /Concept \(hook\):\nA local-first planting calendar\./);
  assert.match(context, /The Case \(whyItMightWork\):\nGardeners need reminders even when offline\./);
  assert.match(context, /Build Notes \(techStack\):\nSQLite, React, and a local notification scheduler\./);
  assert.match(context, /Filled fields: .*The Spark \/ Raw Notes.*Concept.*The Case.*Build Notes/);
});

test('messagesForChat adds a current-context reminder after persisted history', () => {
  const idea = newIdea({
    fullNotes: 'This is a personal daily-driver terminal project for repeated git/test/debug loops.',
  });
  const messages = messagesForChat(
    idea,
    [{ id: 'old', ideaId: idea.id, role: 'assistant', content: 'Old generic launch advice.', createdAt: new Date() }],
    'Ask a sharper question.',
  );

  assert.equal(messages.at(-2)?.role, 'system');
  assert.match(messages.at(-2)?.content ?? '', /prioritize the current Seedbank idea context/);
});

test('fresh field assist writes standalone field text without current value', () => {
  const idea = newIdea({
    title: 'Adaptive terminal',
    fullNotes: 'Personal daily-driver terminal with semantic output, workspace memory, and faster git/test/debug loops.',
    techStack: 'Rust, GPU text rendering, cross-platform PTY handling.',
    whyItMightWork: 'Old value that should not be reused.',
  });
  const prompt = promptForFieldAssist(
    idea,
    'whyItMightWork',
    idea.whyItMightWork,
    'Write a new The Case from scratch.',
    'fresh',
    true,
  ).map((message) => message.content).join('\n');

  assert.match(prompt, /write-from-scratch request/);
  assert.match(prompt, /complete standalone value for the target field/);
  assert.match(prompt, /Personal daily-driver terminal/);
  assert.doesNotMatch(prompt, /Current value:/);
  assert.doesNotMatch(prompt, /Old value that should not be reused/);
});

test('field suggestion prompts adapt expectations by stage', () => {
  const seedIdea = newIdea({ stage: 'seed' });
  const pitchIdea = newIdea({ stage: 'pitch' });

  const seedPrompt = promptForSuggestion(seedIdea, 'pitch', '').map((message) => message.content).join('\n');
  const pitchPrompt = promptForSuggestion(pitchIdea, 'pitch', '').map((message) => message.content).join('\n');

  assert.ok(seedPrompt.includes('early-stage drafts can be rough and exploratory'));
  assert.ok(pitchPrompt.includes('should be polished and presentation-ready'));
});

test('field assist prompts include field and intent contracts without thinking-partner question framing', () => {
  const idea = newIdea({ stage: 'prototype' });
  const prompt = promptForFieldAssist(idea, 'techStack', '', undefined, 'explain').map((message) => message.content).join('\n');
  assert.ok(prompt.includes('Output contract for Build Notes'));
  assert.ok(prompt.includes('Mode contract: Expand my draft'));
  assert.ok(prompt.includes('keep output practical and build-oriented'));
  assert.doesNotMatch(prompt, /Stage personality: greenhouse/);
  assert.doesNotMatch(prompt, /Ask "what if" questions/);
});

test('field assist prompts have field-specific output contracts for every generated field', () => {
  const idea = newIdea({
    stage: 'sprout',
    fullNotes: 'Personal terminal project for faster git/test/debug loops.',
  });
  const expectations = [
    ['pitch', 'Output contract for Elevator Pitch', 'one crisp sentence'],
    ['fullNotes', 'Output contract for The Spark / Raw Notes', 'Preserve the user\'s raw thinking'],
    ['hook', 'Output contract for Concept', 'plain-language explanation'],
    ['whyItMightWork', 'Output contract for The Case', 'personal daily-driver'],
    ['risks', 'Output contract for Risks & Blockers', 'failure modes'],
    ['techStack', 'Output contract for Build Notes', 'architecture choices'],
    ['aesthetic', 'Output contract for Aesthetic & Style', 'interaction'],
    ['retrospective', 'Output contract for Retrospective', 'inventing results'],
  ] as const;

  for (const [field, heading, detail] of expectations) {
    const prompt = promptForFieldAssist(idea, field, '', undefined, 'fresh', true)
      .map((message) => message.content)
      .join('\n');
    assert.match(prompt, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(prompt, new RegExp(detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(prompt, /Mode contract: Write from scratch/);
    assert.doesNotMatch(prompt, /Ask "what if" questions/);
  }
});
