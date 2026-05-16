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
  assert.match(text, /Return only a single JSON object/);
  assert.match(text, /CRITICAL JSON FORMATTING/);
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
  assert.equal(parsed.files[0]?.content, '# Spec\n\nSmallest useful version.');
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

test('project draft parser normalizes escaped prose content before writing files', () => {
  const parsed = parseProjectDraft(JSON.stringify({
    summary: 'Starter docs.',
    files: [
      {
        path: 'README.md',
        content: "# Point-and-Click Adventure Game\\n\\nA solo-built game inspired by King\\'s Quest.\\n\\tIndented note.",
      },
    ],
  }));

  assert.equal(
    parsed.files[0]?.content,
    "# Point-and-Click Adventure Game\n\nA solo-built game inspired by King's Quest.\n\tIndented note.",
  );
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

test('project draft parser repairs literal newlines inside content strings', () => {
  // Reproduces the Opus 4.7 failure mode: model emits literal newlines (not \n
  // escapes) inside file content strings. Pre-repair this raises
  // "Unexpected token '\\', '\\n/ '... is not valid JSON".
  const parsed = parseProjectDraft(`{
    "summary": "Starter docs.",
    "files": [
      {"path": "README.md", "content": "# Title
/ note line
hello"}
    ]
  }`);

  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0]?.path, 'README.md');
  assert.match(parsed.files[0]?.content ?? '', /\/ note line/);
  assert.match(parsed.files[0]?.content ?? '', /hello$/);
});

test('project draft parser ignores triple-backticks embedded inside string content', () => {
  // Reproduces the failure where Opus emits bare JSON whose file content
  // contains markdown code fences. The old fence-stripping regex matched the
  // first inner ``` and parsed gibberish; the trimmed JSON must win instead.
  const payload = JSON.stringify({
    summary: 'Starter docs.',
    files: [
      {
        path: 'SPEC.md',
        content: '# Spec\n\n```\nScene {\n  background: image\n  hotspots: [Hotspot]\n}\n```\n',
      },
    ],
  });

  const parsed = parseProjectDraft(payload);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0]?.path, 'SPEC.md');
  assert.match(parsed.files[0]?.content ?? '', /Scene \{/);
});

test('project draft parser still strips an outer fenced wrapper', () => {
  const inner = JSON.stringify({
    summary: 'Starter docs.',
    files: [{ path: 'README.md', content: '# Title' }],
  });
  const parsed = parseProjectDraft('```json\n' + inner + '\n```');
  assert.equal(parsed.files[0]?.path, 'README.md');
});

test('project draft parser includes a response preview when the payload is unparseable', () => {
  assert.throws(
    () => parseProjectDraft('Sorry, I can only respond in plain text. Here is what you asked for: ...'),
    /Response preview: "Sorry, I can only respond/,
  );
});
