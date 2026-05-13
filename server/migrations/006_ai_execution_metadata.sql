ALTER TABLE ai_usage ADD COLUMN provider_family TEXT;
ALTER TABLE ai_usage ADD COLUMN transport TEXT;
ALTER TABLE ai_usage ADD COLUMN resolved_model_id TEXT;
ALTER TABLE ai_usage ADD COLUMN requested_model TEXT;
ALTER TABLE ai_usage ADD COLUMN content_leaves_device INTEGER;
