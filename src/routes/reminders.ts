import { Router } from 'express';
import { pool } from '../db.js';

export const remindersRouter = Router();

remindersRouter.get('/reminders/last', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT checked_at, urgent_count, email_sent FROM reminder_checks ORDER BY checked_at DESC LIMIT 1`
    );
    res.json({ lastCheck: rows[0] ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el estado de recordatorios' });
  }
});