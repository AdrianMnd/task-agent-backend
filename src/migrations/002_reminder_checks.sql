CREATE TABLE IF NOT EXISTS reminder_checks (
  id SERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  urgent_count INTEGER NOT NULL,
  email_sent BOOLEAN NOT NULL
);