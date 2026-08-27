CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT NOT NULL DEFAULT 'manual',   -- 'manual' | 'github' (fase 2)
  external_ref TEXT,                        -- ej. "owner/repo#123" (fase 2)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
