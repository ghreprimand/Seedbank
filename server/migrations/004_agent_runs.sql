CREATE TABLE IF NOT EXISTS agent_runs (
  id TEXT PRIMARY KEY,
  idea_id TEXT,
  project_path TEXT,
  provider TEXT NOT NULL,
  state TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  exit_code INTEGER,
  transcript_path TEXT NOT NULL,
  proposed_files TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON agent_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_agent_runs_state ON agent_runs(state);
CREATE INDEX IF NOT EXISTS idx_agent_runs_idea_id ON agent_runs(idea_id);
