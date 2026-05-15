import test from 'node:test';
import assert from 'node:assert/strict';
import { newIdea } from '../src/domain.js';
import { parseProjectDraft, promptForProjectDraft } from '../src/ai/prompts.js';

test('project draft prompt works with sparse ideas', () => {
  const idea = newIdea({
    title: 'Lantern Garden Journal',
    stage: 'seed',
  });

  const text = promptForProjectDraft(idea).map((message) => message.content).join('\n');
  assert.match(text, /Lantern Garden Journal/);
  assert.match(text, /Return only JSON/);
  assert.match(text, /files/);
});

test('project draft parser accepts strict JSON', () => {
  const parsed = parseProjectDraft(JSON.stringify({
    summary: 'Starter docs.',
    files: [
      {
        path: 'SPEC.md',
        description: 'Product spec',
        content: '# Spec\n\nSmallest useful version.',
      },
    ],
  }));

  assert.equal(parsed.summary, 'Starter docs.');
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0]?.path, 'SPEC.md');
});

test('project draft parser repairs common Codex JSON-like object output', () => {
  const parsed = parseProjectDraft(`{
    summary: "Starter docs for the idea.",
    files: [
      {
        path: "SPEC.md",
        description: "Product spec",
        content: "# Spec\\n\\nSmallest useful version.",
      },
      {
        path: "TODO.md",
        content: "- Validate the core workflow.",
      },
    ],
  }`);

  assert.equal(parsed.summary, 'Starter docs for the idea.');
  assert.deepEqual(parsed.files.map((file) => file.path), ['SPEC.md', 'TODO.md']);
  assert.match(parsed.files[0]?.content ?? '', /Smallest useful version/);
});

test('project draft repair preserves code-like content inside strings', () => {
  const parsed = parseProjectDraft(`{
    summary: "Starter docs.",
    files: [
      {
        path: "IMPLEMENTATION_NOTES.md",
        content: "Use https://example.com/api and keep examples like { foo: bar } intact.\\n// This is sample code text, not a JSON comment.",
      },
    ],
  }`);

  assert.match(parsed.files[0]?.content ?? '', /https:\/\/example.com\/api/);
  assert.match(parsed.files[0]?.content ?? '', /\{ foo: bar \}/);
  assert.match(parsed.files[0]?.content ?? '', /sample code text/);
});

test('project draft parser still filters unsafe paths after repairing output', () => {
  const parsed = parseProjectDraft(`{
    summary: "Starter docs.",
    files: [
      { path: "../SECRET.md", content: "bad" },
      { path: ".hidden/NOTE.md", content: "bad" },
      { path: "SAFE.md", content: "ok" },
    ],
  }`);

  assert.deepEqual(parsed.files.map((file) => file.path), ['SAFE.md']);
});
