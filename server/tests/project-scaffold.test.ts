import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { newIdea } from '../src/domain.js';
import { writeBaseScaffold } from '../src/integrations/scaffold.js';

test('base project scaffold writes neutral agent guide instead of Claude-specific file', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'seedbank-scaffold-'));
  try {
    const projectDir = path.join(root, 'sample-project');
    const idea = newIdea({
      title: 'Sample Project',
      pitch: 'A small useful project.',
      category: 'app',
      stage: 'prototype',
    });

    const files = writeBaseScaffold(projectDir, idea, 'Test Integration');

    assert.ok(files.includes('README.md'));
    assert.ok(files.includes('AGENTS.md'));
    assert.ok(!files.includes('CLAUDE.md'));
    assert.ok(fs.existsSync(path.join(projectDir, 'AGENTS.md')));
    assert.equal(fs.existsSync(path.join(projectDir, 'CLAUDE.md')), false);
    assert.match(fs.readFileSync(path.join(projectDir, 'AGENTS.md'), 'utf8'), /# Sample Project - Agent Guide/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
