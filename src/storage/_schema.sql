CREATE TABLE IF NOT EXISTS call_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  model_id TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  carbon_grams REAL,
  cost_usd REAL,
  source TEXT,
  routing_decision TEXT,
  persona_tag TEXT
);

CREATE INDEX IF NOT EXISTS idx_call_log_model_id ON call_log(model_id);
