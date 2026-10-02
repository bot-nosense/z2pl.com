-- No public read endpoint. Email addresses are unverified expressions of interest.
CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY COLLATE NOCASE,
  created_at TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('waitlist', 'feedback'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL CHECK (topic IN ('idea', 'workflow', 'other')),
  message TEXT NOT NULL CHECK (length(message) BETWEEN 3 AND 2000),
  email TEXT,
  created_at TEXT NOT NULL,
  payload_hash TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback(created_at DESC);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS rate_limits_expiry_idx ON rate_limits(expires_at);
