import type Database from 'better-sqlite3';
import type { AgentProvider, AgentRunRecord, AgentRunState } from './types.js';

interface AgentRunRow {
  id: string;
  idea_id: string | null;
  project_path: string | null;
  provider: AgentProvider;
  state: AgentRunState;
  started_at: string;
  ended_at: string | null;
  exit_code: number | null;
  transcript_path: string;
  proposed_files: string;
}

function parseProposedFiles(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function mapRow(row: AgentRunRow): AgentRunRecord {
  return {
    id: row.id,
    ideaId: row.idea_id,
    projectPath: row.project_path,
    provider: row.provider,
    state: row.state,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    exitCode: row.exit_code,
    transcriptPath: row.transcript_path,
    proposedFiles: parseProposedFiles(row.proposed_files),
  };
}

export interface CreateRunInput {
  id: string;
  ideaId: string | null;
  projectPath: string | null;
  provider: AgentProvider;
  startedAt: string;
  transcriptPath: string;
}

export class AgentRunStore {
  constructor(private readonly db: Database.Database) {
    this.db.prepare(`
      UPDATE agent_runs
      SET state = 'failed', ended_at = ?
      WHERE state = 'running'
    `).run(new Date().toISOString());
  }

  create(input: CreateRunInput): AgentRunRecord {
    this.db.prepare(`
      INSERT INTO agent_runs (
        id, idea_id, project_path, provider, state, started_at, ended_at, exit_code, transcript_path, proposed_files
      ) VALUES (?, ?, ?, ?, 'running', ?, NULL, NULL, ?, '[]')
    `).run(
      input.id,
      input.ideaId,
      input.projectPath,
      input.provider,
      input.startedAt,
      input.transcriptPath,
    );

    const row = this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(input.id) as AgentRunRow | undefined;
    if (!row) throw new Error('Failed to create agent run.');
    return mapRow(row);
  }

  get(id: string): AgentRunRecord | undefined {
    const row = this.db.prepare('SELECT * FROM agent_runs WHERE id = ?').get(id) as AgentRunRow | undefined;
    return row ? mapRow(row) : undefined;
  }

  setState(id: string, state: AgentRunState, endedAt: string | null, exitCode: number | null): void {
    this.db.prepare(`
      UPDATE agent_runs
      SET state = ?, ended_at = ?, exit_code = ?
      WHERE id = ?
    `).run(state, endedAt, exitCode, id);
  }

  setProposedFiles(id: string, files: string[]): void {
    this.db.prepare(`
      UPDATE agent_runs
      SET proposed_files = ?
      WHERE id = ?
    `).run(JSON.stringify(files), id);
  }

  countSince(sinceIso: string): number {
    const row = this.db.prepare(`
      SELECT COUNT(*) AS count
      FROM agent_runs
      WHERE started_at >= ?
    `).get(sinceIso) as { count: number };
    return row.count;
  }
}
