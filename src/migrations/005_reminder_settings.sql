-- Con cuantos dias de antelacion se considera "urgente" una tarea para este usuario.
-- Antes de esto estaba fijo a 3 dias en el codigo para todo el mundo.
ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_days_ahead INTEGER NOT NULL DEFAULT 3;
