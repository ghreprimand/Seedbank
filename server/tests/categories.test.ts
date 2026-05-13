import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { newIdea, snapshotFrom } from '../src/domain.js';
import { parseMarkdownIdea } from '../src/markdown.js';
import { SeedbankRepository } from '../src/repository.js';
import { CATEGORIES, DEFAULT_CATEGORY_DEFINITIONS } from '../../shared/types.js';

function repositoryFixture(): { db: Database.Database; repository: SeedbankRepository } {
  const db = new Database(':memory:');
  const migration = fs.readFileSync(path.resolve('migrations/001_initial_schema.sql'), 'utf8');
  db.exec(migration);
  return { db, repository: new SeedbankRepository(db) };
}

test('newIdea preserves unknown category IDs and falls back only for missing values', () => {
  assert.equal(newIdea({ category: 'hardware-lab' }).category, 'hardware-lab');
  assert.equal(newIdea({ category: ' hardware-lab ' }).category, 'hardware-lab');
  assert.equal(newIdea({ category: '' }).category, 'app');
  assert.equal(newIdea({ category: undefined }).category, 'app');
});

test('built-in category defaults are seeded from the existing category list', () => {
  assert.deepEqual(
    DEFAULT_CATEGORY_DEFINITIONS.map((category) => category.id),
    [...CATEGORIES],
  );
  assert.ok(DEFAULT_CATEGORY_DEFINITIONS.every((category, index) => category.builtIn === true && category.sortOrder === index));
});

test('repository create, filter, export, and import round-trip custom category IDs', () => {
  const { db, repository } = repositoryFixture();
  try {
    const idea = repository.createIdea({
      id: 'idea-custom-category',
      title: 'Custom taxonomy idea',
      category: 'hardware-lab',
      stage: 'seed',
    });

    assert.equal(repository.getIdea(idea.id)?.category, 'hardware-lab');
    assert.equal(repository.listIdeas({ categories: ['hardware-lab'] }).items.map((item) => item.id)[0], idea.id);

    const exported = repository.exportArchive(true);
    assert.equal(exported.ideas[0]?.category, 'hardware-lab');

    const replacement = repository.importArchive({ ideas: exported.ideas, versions: [] }, 'replace');
    assert.equal(replacement.imported, 1);
    assert.equal(repository.getIdea(idea.id)?.category, 'hardware-lab');
  } finally {
    db.close();
  }
});

test('version snapshots preserve custom category IDs', () => {
  const idea = newIdea({
    id: 'idea-snapshot-category',
    title: 'Snapshot category',
    category: 'research-hardware',
  });

  assert.equal(snapshotFrom(idea).category, 'research-hardware');
});

test('markdown imports preserve unknown category IDs while keeping built-in label compatibility', () => {
  const custom = parseMarkdownIdea([
    '# Custom category idea',
    '> **Category:** hardware-lab',
    '> **Stage:** Seed',
    '',
    '## Pitch',
    'A pitch.',
  ].join('\n'));

  const builtIn = parseMarkdownIdea([
    '# Built-in label idea',
    '> **Category:** Open-Source Utility',
    '> **Stage:** Seed',
  ].join('\n'));

  assert.equal(custom.category, 'hardware-lab');
  assert.equal(builtIn.category, 'open-source-utility');
});
