import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import type { Task } from '../types.js';

export const tasksRouter = Router();

tasksRouter.get('/tasks', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query<Task>(
      `SELECT * FROM tasks WHERE user_id = $1 ORDER BY completed ASC, due_date ASC NULLS LAST, created_at DESC`,
      [req.userId]
    );
    res.json({ tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las tareas' });
  }
});
