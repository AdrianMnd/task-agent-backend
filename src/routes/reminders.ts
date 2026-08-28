import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';

export const remindersRouter = Router();

remindersRouter.get('/reminders/last', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT checked_at, urgent_count, email_sent FROM reminder_checks WHERE user_id = $1 ORDER BY checked_at DESC LIMIT 1`,
      [req.userId]
    );
    res.json({ lastCheck: rows[0] ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el estado de recordatorios' });
  }
});
