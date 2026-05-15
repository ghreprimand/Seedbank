import test from 'node:test';
import assert from 'node:assert/strict';
import { assessReadiness } from '../../shared/stageReadiness.js';
import { newIdea } from '../src/domain.js';

test('seed readiness requires spark depth and at least one tag', () => {
  const missing = assessReadiness(newIdea({ stage: 'seed', fullNotes: 'Too short', tags: [] }));
  assert.equal(missing.ready, false);
  assert.equal(missing.nextStage, 'sprout');
  assert.ok(missing.missing.includes('The Spark is at least 40 characters'));
  assert.ok(missing.missing.includes('At least 1 tag is added'));

  const ready = assessReadiness(newIdea({
    stage: 'seed',
    fullNotes: 'This spark is long enough to satisfy the minimum threshold for moving forward.',
    tags: ['prototype'],
  }));
  assert.equal(ready.ready, true);
  assert.equal(ready.missing.length, 0);
});

test('sprout readiness requires concept only', () => {
  const missing = assessReadiness(newIdea({
    stage: 'sprout',
    hook: '',
  }));
  assert.equal(missing.ready, false);
  assert.equal(missing.nextStage, 'pitch');
  assert.ok(missing.missing.includes('Concept is filled'));

  const ready = assessReadiness(newIdea({
    stage: 'sprout',
    hook: 'A concrete hook',
  }));
  assert.equal(ready.ready, true);
});

test('pitch readiness requires case and elevator pitch', () => {
  const missing = assessReadiness(newIdea({
    stage: 'pitch',
    whyItMightWork: 'Worth doing.',
    pitch: '',
  }));
  assert.equal(missing.ready, false);
  assert.equal(missing.nextStage, 'prototype');
  assert.ok(missing.missing.includes('Elevator Pitch is filled'));

  const ready = assessReadiness(newIdea({
    stage: 'pitch',
    whyItMightWork: 'A clear reason this solves an urgent problem.',
    pitch: 'A polished one-liner pitch.',
  }));
  assert.equal(ready.ready, true);
});

test('prototype readiness requires risks and build notes', () => {
  const missing = assessReadiness(newIdea({
    stage: 'prototype',
    risks: 'Scope risk.',
    techStack: '',
  }));
  assert.equal(missing.ready, false);
  assert.equal(missing.nextStage, 'plot');
  assert.ok(missing.missing.includes('Build Notes are filled'));

  const readyWithBuildNotes = assessReadiness(newIdea({
    stage: 'prototype',
    risks: 'Scope risk.',
    techStack: 'React + SQLite',
  }));
  assert.equal(readyWithBuildNotes.ready, true);
});

test('manual lifecycle stages do not produce promotion criteria', () => {
  for (const stage of ['plot', 'shelved', 'cold-storage', 'shipped'] as const) {
    const assessment = assessReadiness(newIdea({ stage }));
    assert.equal(assessment.ready, false);
    assert.equal(assessment.nextStage, stage);
    assert.deepEqual(assessment.met, []);
    assert.deepEqual(assessment.missing, []);
  }
});
