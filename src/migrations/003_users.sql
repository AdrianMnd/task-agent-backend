CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nullable a proposito: las tareas creadas antes de este cambio quedan sin dueño.
-- Si quieres conservarlas, tras registrar tu usuario ejecuta a mano:
--   UPDATE tasks SET user_id = <tu_id> WHERE user_id IS NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE reminder_checks ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
