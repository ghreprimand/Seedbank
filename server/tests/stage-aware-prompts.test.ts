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
    assert.ok(messages[1]?.content.includes(`Stage personality: ${promptStageLabel[stage]}.`));
  }
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
