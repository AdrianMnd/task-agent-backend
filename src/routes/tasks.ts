import { Router } from 'express';
import { pool } from '../db.js';
import type { Task } from '../types.js';

export const tasksRouter = Router();

tasksRouter.get('/tasks', async (_req, res) => {
  try {
    const { rows } = await pool.query<Task>(
      `SELECT * FROM tasks ORDER BY completed ASC, due_date ASC NULLS LAST, created_at DESC`
    );
    res.json({ tasks: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener las tareas' });
  }
});