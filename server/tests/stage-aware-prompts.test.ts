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

  assert.match(context, /"fullNotes": "Raw notes about seed rotations/);
  assert.match(context, /"hook": "A local-first planting calendar."/);
  assert.match(context, /"whyItMightWork": "Gardeners need reminders even when offline."/);
  assert.match(context, /"techStack": "SQLite, React, and a local notification scheduler."/);
  assert.match(context, /"fullNotes": "The Spark \/ Raw Notes"/);
  assert.match(context, /"hook": "Concept"/);
  assert.match(context, /"filledFields"/);
});

test('field suggestion prompts adapt expectations by stage', () => {
  const seedIdea = newIdea({ stage: 'seed' });
  const pitchIdea = newIdea({ stage: 'pitch' });

  const seedPrompt = promptForSuggestion(seedIdea, 'pitch', '').map((message) => message.content).join('\n');
  const pitchPrompt = promptForSuggestion(pitchIdea, 'pitch', '').map((message) => message.content).join('\n');

  assert.ok(seedPrompt.includes('early-stage drafts can be rough and exploratory'));
  assert.ok(pitchPrompt.includes('should be polished and presentation-ready'));
});

test('field assist prompts include stage personality and expectation guidance', () => {
  const idea = newIdea({ stage: 'prototype' });
  const prompt = promptForFieldAssist(idea, 'techStack', '').map((message) => message.content).join('\n');
  assert.ok(prompt.includes('Stage personality: greenhouse.'));
  assert.ok(prompt.includes('keep output practical and build-oriented'));
});
