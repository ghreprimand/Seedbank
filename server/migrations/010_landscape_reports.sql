CREATE TABLE IF NOT EXISTS landscape_reports (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  sections TEXT NOT NULL DEFAULT '{}',
  provider TEXT NOT NULL DEFAULT '',
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_landscape_reports_idea
  ON landscape_reports(idea_id, created_at);
