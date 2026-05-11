CREATE TABLE IF NOT EXISTS ideas (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  pitch TEXT NOT NULL,
  category TEXT NOT NULL,
  stage TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  mood_labels TEXT NOT NULL DEFAULT '[]',
  full_notes TEXT NOT NULL,
  hook TEXT NOT NULL,
  why_it_might_work TEXT NOT NULL,
  risks TEXT NOT NULL,
  tech_stack TEXT NOT NULL,
  jam_score INTEGER NOT NULL DEFAULT 0,
  excitement_score INTEGER NOT NULL DEFAULT 0,
  related_idea_ids TEXT NOT NULL DEFAULT '[]',
  links TEXT NOT NULL DEFAULT '[]',
  images TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  graduated_to TEXT
);

CREATE INDEX IF NOT EXISTS idx_ideas_updated_at ON ideas(updated_at);
CREATE INDEX IF NOT EXISTS idx_ideas_created_at ON ideas(created_at);
CREATE INDEX IF NOT EXISTS idx_ideas_category ON ideas(category);
CREATE INDEX IF NOT EXISTS idx_ideas_stage ON ideas(stage);
CREATE INDEX IF NOT EXISTS idx_ideas_deleted_at ON ideas(deleted_at);

CREATE TABLE IF NOT EXISTS versions (
  id TEXT PRIMARY KEY,
  idea_id TEXT NOT NULL,
  version_label TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  timestamp TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  FOREIGN KEY (idea_id) REFERENCES ideas(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_versions_idea_id ON versions(idea_id);
CREATE INDEX IF NOT EXISTS idx_versions_timestamp ON versions(timestamp);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
