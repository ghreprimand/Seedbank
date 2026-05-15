import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SeedbankRepository } from '../src/repository.js';

function repositoryFixture(): { db: Database.Database; repository: SeedbankRepository } {
  const db = new Database(':memory:');
  const migrations = fs.readdirSync(path.resolve('migrations'))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  for (const migration of migrations) {
    db.exec(fs.readFileSync(path.resolve('migrations', migration), 'utf8'));
  }
  return { db, repository: new SeedbankRepository(db) };
}

test('records a stage transition when stage changes', () => {
  const { db, repository } = repositoryFixture();
  try {
    const idea = repository.createIdea({
      id: 'idea-stage-change',
      title: 'Timeline test',
      stage: 'seed',
    });

    const updated = repository.updateIdea(idea.id, { stage: 'sprout' });
    assert.ok(updated);
    assert.equal(updated?.stage, 'sprout');

    const transitions = repository.getStageTransitions(idea.id);
    assert.equal(transitions.length, 1);
    assert.equal(transitions[0]?.fromStage, 'seed');
    assert.equal(transitions[0]?.toStage, 'sprout');
    assert.equal(transitions[0]?.ideaId, idea.id);
    assert.equal(transitions[0]?.auto, false);
  } finally {
    db.close();
  }
});

test('does not record a stage transition for non-stage updates', () => {
  const { db, repository } = repositoryFixture();
  try {
    const idea = repository.createIdea({
      id: 'idea-non-stage-update',
      title: 'No transition expected',
      stage: 'seed',
    });

    const updated = repository.updateIdea(idea.id, { pitch: 'Updated pitch content.' });
    assert.ok(updated);
    assert.equal(updated?.stage, 'seed');

    const transitions = repository.getStageTransitions(idea.id);
    assert.equal(transitions.length, 0);
  } finally {
    db.close();
  }
});
