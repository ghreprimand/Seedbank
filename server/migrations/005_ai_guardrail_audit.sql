CREATE TABLE IF NOT EXISTS ai_audit_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  feature TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_events_created_at ON ai_audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_audit_events_feature ON ai_audit_events(feature);
