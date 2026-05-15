import test from 'node:test';
import assert from 'node:assert/strict';
import { newIdea } from '../src/domain.js';
import { duplicateIdeaPayload } from '../../shared/ideaDuplication.js';

test('duplicateIdeaPayload strips project and GitHub mappings', () => {
  const original = newIdea({
    id: 'original-idea',
    title: 'Starter framework',
    graduatedTo: '/home/user/Projects/starter-framework',
    links: [
      { label: 'GitHub', url: 'https://github.com/octocat/starter-framework' },
      { label: 'Docs', url: 'https://example.com/docs' },
      { label: 'Repo mirror', url: 'https://github.com/octocat/mirror' },
    ],
    deletedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
  const now = new Date('2026-05-15T12:00:00.000Z');

  const duplicate = duplicateIdeaPayload(original, 'duplicate-idea', now);

  assert.equal(duplicate.id, 'duplicate-idea');
  assert.equal(duplicate.title, 'Copy of Starter framework');
  assert.equal(duplicate.graduatedTo, null);
  assert.equal(duplicate.deletedAt, null);
  assert.equal(duplicate.createdAt, now);
  assert.equal(duplicate.updatedAt, now);
  assert.deepEqual(duplicate.links, [
    { label: 'Docs', url: 'https://example.com/docs' },
  ]);
});
