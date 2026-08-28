-- Registra cada vez que el script automatico (checkReminders.ts) se ejecuta,
-- para poder mostrar en el frontend que el agente "actuo por su cuenta"
-- aunque no hubiera nada urgente que avisar.
CREATE TABLE IF NOT EXISTS reminder_checks (
  id SERIAL PRIMARY KEY,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  urgent_count INTEGER NOT NULL,
  email_sent BOOLEAN NOT NULL
);
