import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSuggestion } from '../src/ai/utils/suggestion-parser.js';

test('extractSuggestion extracts valid JSON', () => {
  const input = '{"suggestion": "Better pitch", "rationale": "Clearer"}';
  assert.deepEqual(extractSuggestion(input), { suggestion: 'Better pitch', rationale: 'Clearer' });
});

test('extractSuggestion extracts JSON from markdown fences', () => {
  const input = 'Here is the result:\n```json\n{"suggestion": "Better pitch", "rationale": "Clearer"}\n```\nHope this helps!';
  assert.deepEqual(extractSuggestion(input), { suggestion: 'Better pitch', rationale: 'Clearer' });
});

test('extractSuggestion extracts JSON from raw fences', () => {
  const input = '```\n{"suggestion": "Better pitch", "rationale": "Clearer"}\n```';
  assert.deepEqual(extractSuggestion(input), { suggestion: 'Better pitch', rationale: 'Clearer' });
});

test('extractSuggestion extracts JSON embedded in prose', () => {
  const input = 'I suggest the following: { "suggestion": "Improved", "rationale": "Better flow" } let me know!';
  assert.deepEqual(extractSuggestion(input), { suggestion: 'Improved', rationale: 'Better flow' });
});

test('extractSuggestion handles missing rationale', () => {
  const input = '{"suggestion": "Just a suggestion"}';
  assert.deepEqual(extractSuggestion(input), { suggestion: 'Just a suggestion', rationale: '' });
});

test('extractSuggestion handles missing suggestion', () => {
  const input = '{"rationale": "Just a rationale"}';
  assert.deepEqual(extractSuggestion(input), { suggestion: '', rationale: 'Just a rationale' });
});

test('extractSuggestion falls back to plain text for non-JSON', () => {
  const input = 'This is just a plain text suggestion.';
  assert.deepEqual(extractSuggestion(input), { suggestion: 'This is just a plain text suggestion.', rationale: '' });
});

test('extractSuggestion falls back to plain text for malformed JSON', () => {
  const input = '{"suggestion": "Broken", "rationale": "Broken';
  assert.deepEqual(extractSuggestion(input), { suggestion: '{"suggestion": "Broken", "rationale": "Broken', rationale: '' });
});

test('extractSuggestion strips fences when falling back to plain text', () => {
  const input = '```\nSome text that is not JSON\n```';
  assert.deepEqual(extractSuggestion(input), { suggestion: 'Some text that is not JSON', rationale: '' });
});

test('extractSuggestion handles empty input', () => {
  assert.deepEqual(extractSuggestion(''), { suggestion: '', rationale: '' });
});

test('extractSuggestion handles whitespace input', () => {
  assert.deepEqual(extractSuggestion('   '), { suggestion: '', rationale: '' });
});

test('extractSuggestion handles the screenshot bug style payload', () => {
  const input = 'Sure, here is the suggestion:\n\n```json\n{\n  "suggestion": "A refined pitch",\n  "rationale": "It targets the core value proposition more effectively."\n}\n```';
  assert.deepEqual(extractSuggestion(input), { suggestion: 'A refined pitch', rationale: 'It targets the core value proposition more effectively.' });
});
