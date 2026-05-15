CREATE TABLE IF NOT EXISTS stage_transitions (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  from_stage TEXT NOT NULL,
  to_stage TEXT NOT NULL,
  transitioned_at TEXT NOT NULL,
  auto INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_stage_transitions_idea_id_transitioned_at
  ON stage_transitions(idea_id, transitioned_at);
