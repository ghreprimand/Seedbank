import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { newIdea } from '../src/domain.js';
import { parseLandscapeAnalysis, promptForLandscapeAnalysis } from '../src/ai/prompts.js';
import { SeedbankRepository } from '../src/repository.js';
import { AiStore } from '../src/ai/store.js';
import { AiService } from '../src/ai/service.js';

function repositoryFixture(): { db: Database.Database; repository: SeedbankRepository } {
  const db = new Database(':memory:');
  for (const migration of ['001_initial_schema.sql', '008_stage_transitions.sql', '009_aesthetic_retrospective.sql', '010_landscape_reports.sql']) {
    db.exec(fs.readFileSync(path.resolve('migrations', migration), 'utf8'));
  }
  return { db, repository: new SeedbankRepository(db) };
}

function aiFixture(): { db: Database.Database; repository: SeedbankRepository; service: AiService } {
  const db = new Database(':memory:');
  for (const migration of [
    '001_initial_schema.sql',
    '002_ai_assistance.sql',
    '005_ai_guardrail_audit.sql',
    '006_ai_execution_metadata.sql',
    '007_ai_provider_instance_usage.sql',
    '008_stage_transitions.sql',
    '009_aesthetic_retrospective.sql',
    '010_landscape_reports.sql',
  ]) {
    db.exec(fs.readFileSync(path.resolve('migrations', migration), 'utf8'));
  }
  const repository = new SeedbankRepository(db);
  const store = new AiStore(db);
  return { db, repository, service: new AiService(repository, store) };
}

test('landscape prompt includes all filled idea context fields and section contract', () => {
  const idea = newIdea({
    title: 'Smart Garden Planner',
    pitch: 'A planning workspace for hobby gardeners.',
    category: 'app',
    stage: 'pitch',
    tags: ['garden', 'planning'],
    moodLabels: ['calm'],
    fullNotes: 'Longer context block for analysis.',
    hook: 'Plan your garden by season in 30 seconds.',
    whyItMightWork: 'Garden planning is still fragmented across spreadsheets and notes.',
    risks: 'May be crowded with generic task tools.',
    techStack: 'React + SQLite + local-first sync.',
    aesthetic: 'Paper-like earthy style.',
    retrospective: 'Early tests showed users wanted seasonal templates.',
  });

  const messages = promptForLandscapeAnalysis(idea, 'Assess competitiveness and opportunity.');
  const text = messages.map((message) => message.content).join('\n');

  assert.ok(text.includes('Smart Garden Planner'));
  assert.ok(text.includes('A planning workspace for hobby gardeners.'));
  assert.ok(text.includes('garden'));
  assert.ok(text.includes('calm'));
  assert.ok(text.includes('fragmented across spreadsheets'));
  assert.ok(text.includes('generic task tools'));
  assert.ok(text.includes('React + SQLite + local-first sync.'));
  assert.ok(text.includes('Paper-like earthy style.'));
  assert.ok(text.includes('seasonal templates'));
  assert.ok(text.includes('Existing Alternatives'));
  assert.ok(text.includes('Overall Viability'));
});

test('landscape parser maps structured JSON sections', () => {
  const parsed = parseLandscapeAnalysis(JSON.stringify({
    existingAlternatives: 'Many to-do and PM tools overlap.',
    gapsAndPainPoints: 'Most are too generic for this workflow.',
    demandSignals: 'Repeated forum threads ask for this feature set.',
    positioningAngle: 'Focus on fast setup + niche templates.',
    overallViability: 'Promising but competitive; differentiation is mandatory.',
  }));

  assert.equal(parsed.existingAlternatives, 'Many to-do and PM tools overlap.');
  assert.equal(parsed.gapsAndPainPoints, 'Most are too generic for this workflow.');
  assert.equal(parsed.demandSignals, 'Repeated forum threads ask for this feature set.');
  assert.equal(parsed.positioningAngle, 'Focus on fast setup + niche templates.');
  assert.equal(parsed.overallViability, 'Promising but competitive; differentiation is mandatory.');
});

test('landscape parser flattens nested JSON section values into readable text', () => {
  const parsed = parseLandscapeAnalysis(JSON.stringify({
    existingAlternatives: {
      summary: 'Very crowded and mature space at the emulator layer.',
      players: [
        {
          segment: 'High-performance terminals',
          examples: ['Alacritty', 'Kitty', 'WezTerm'],
          maturity: 'High',
        },
      ],
      takeaway: 'Differentiation needs workflow gains beyond speed.',
    },
    gapsAndPainPoints: {
      underservedNeeds: [
        'Reliable semantic understanding of noisy CLI output.',
        'Project-level memory across context switches.',
      ],
    },
    demandSignals: {
      evidenceStrength: 'Moderate demand for better workflow UX.',
    },
    positioningAngle: {
      mostCompellingWedge: 'Debugging flow memory.',
    },
    overallViability: {
      verdict: 'Viable as a focused productivity product.',
      keyRisks: ['Rendering complexity', 'Overlap with shell plugins'],
    },
  }));

  assert.match(parsed.existingAlternatives, /Summary: Very crowded/);
  assert.match(parsed.existingAlternatives, /Players:\n  - Segment: High-performance terminals/);
  assert.match(parsed.existingAlternatives, /Examples:\n      - Alacritty/);
  assert.match(parsed.gapsAndPainPoints, /Underserved Needs:\n  - Reliable semantic understanding/);
  assert.match(parsed.overallViability, /Key Risks:\n  - Rendering complexity/);
  assert.ok(!parsed.existingAlternatives.trim().startsWith('{'));
});

test('landscape parser falls back to overall viability for non-JSON responses', () => {
  const parsed = parseLandscapeAnalysis('The space appears crowded with weak differentiation signals.');
  assert.equal(parsed.existingAlternatives, '');
  assert.equal(parsed.overallViability, 'The space appears crowded with weak differentiation signals.');
});

test('repository saves and retrieves latest landscape report with history ordering', () => {
  const { db, repository } = repositoryFixture();
  try {
    const idea = repository.createIdea({
      id: 'idea-landscape-history',
      title: 'Landscape report idea',
      stage: 'seed',
    });

    const first = repository.saveLandscapeReport(
      idea.id,
      {
        existingAlternatives: 'First alternatives',
        gapsAndPainPoints: 'First gaps',
        demandSignals: 'First demand',
        positioningAngle: 'First angle',
        overallViability: 'First viability',
      },
      'ollama',
      'qwen3:8b',
    );

    const second = repository.saveLandscapeReport(
      idea.id,
      {
        existingAlternatives: 'Second alternatives',
        gapsAndPainPoints: 'Second gaps',
        demandSignals: 'Second demand',
        positioningAngle: 'Second angle',
        overallViability: 'Second viability',
      },
      'codex-account',
      'gpt-5.3-codex',
    );

    const latest = repository.getLatestLandscapeReport(idea.id);
    assert.ok(latest);
    assert.equal(latest?.id, second.id);
    assert.equal(latest?.provider, 'codex-account');
    assert.equal(latest?.sections.overallViability, 'Second viability');

    const history = repository.getLandscapeReportHistory(idea.id);
    assert.equal(history.length, 2);
    assert.equal(history[0]?.id, second.id);
    assert.equal(history[1]?.id, first.id);
  } finally {
    db.close();
  }
});

test('repository read path normalizes nested and legacy raw landscape report sections', () => {
  const { db, repository } = repositoryFixture();
  try {
    const idea = repository.createIdea({
      id: 'idea-landscape-normalize',
      title: 'Normalize stored report',
      stage: 'seed',
    });

    db.prepare(`
      INSERT INTO landscape_reports (id, idea_id, sections, provider, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'report-nested',
      idea.id,
      JSON.stringify({
        existingAlternatives: { summary: 'Nested alternatives' },
        gapsAndPainPoints: { underservedNeeds: ['Need one'] },
        demandSignals: { evidenceStrength: 'Moderate' },
        positioningAngle: { wedge: 'Narrow workflow' },
        overallViability: { verdict: 'Niche but viable' },
      }),
      'codex-account',
      'gpt-5.3-codex',
      '2026-05-15T00:00:00.000Z',
    );

    db.prepare(`
      INSERT INTO landscape_reports (id, idea_id, sections, provider, model, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      'report-legacy-raw',
      idea.id,
      JSON.stringify({
        existingAlternatives: '',
        gapsAndPainPoints: '',
        demandSignals: '',
        positioningAngle: '',
        overallViability: JSON.stringify({
          existingAlternatives: { summary: 'Legacy raw alternatives' },
          gapsAndPainPoints: { underservedNeeds: ['Need two'] },
          demandSignals: { evidenceStrength: 'Strong' },
          positioningAngle: { wedge: 'Debugging flow memory' },
          overallViability: { verdict: 'Focused product' },
        }),
      }),
      'codex-account',
      'gpt-5.3-codex',
      '2026-05-15T00:01:00.000Z',
    );

    const latest = repository.getLatestLandscapeReport(idea.id);
    assert.ok(latest);
    assert.equal(latest?.id, 'report-legacy-raw');
    assert.match(latest?.sections.existingAlternatives ?? '', /Summary: Legacy raw alternatives/);
    assert.match(latest?.sections.gapsAndPainPoints ?? '', /Underserved Needs:\n  - Need two/);

    const history = repository.getLandscapeReportHistory(idea.id);
    assert.match(history[1]?.sections.existingAlternatives ?? '', /Summary: Nested alternatives/);
  } finally {
    db.close();
  }
});

test('landscape analysis service saves a report after generation', async () => {
  const { db, repository, service } = aiFixture();
  try {
    const idea = repository.createIdea({
      id: 'idea-landscape-service',
      title: 'Service persistence test',
      stage: 'seed',
    });

    const fakeResponse = {
      existingAlternatives: 'Alt text',
      gapsAndPainPoints: 'Gap text',
      demandSignals: 'Demand text',
      positioningAngle: 'Position text',
      overallViability: 'Viability text',
    };

    (service as unknown as { providers: Map<string, unknown> }).providers.set('ollama', {
      id: 'ollama',
      complete: async () => ({
        text: JSON.stringify(fakeResponse),
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        resolvedModelId: 'qwen3:8b',
      }),
      stream: async () => ({
        text: '',
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      }),
      health: async () => ({ ok: true, provider: 'ollama', model: 'qwen3:8b' }),
      listModels: async () => ({ ok: true, models: [] }),
    });

    const result = await service.landscapeAnalysis({ ideaId: idea.id }, 'test-key');
    assert.equal(result.sections.overallViability, 'Viability text');
    assert.ok(result.report.id);

    const stored = repository.getLatestLandscapeReport(idea.id);
    assert.ok(stored);
    assert.equal(stored?.id, result.report.id);
    assert.equal(stored?.model, 'qwen3:8b');
  } finally {
    db.close();
  }
});
