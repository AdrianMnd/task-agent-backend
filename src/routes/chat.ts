import { Router } from 'express';
import { runAgent } from '../agent/agentLoop.js';
import { pool } from '../db.js';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import type { ChatMessage } from '../types.js';

export const chatRouter = Router();

const MAX_HISTORY_MESSAGES = 15;

chatRouter.get('/messages', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { rows } = await pool.query<ChatMessage>(
      `SELECT role, content FROM messages WHERE user_id = $1 ORDER BY created_at ASC`,
      [req.userId]
    );
    res.json({ messages: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al obtener el historial' });
  }
});

chatRouter.post('/chat', requireAuth, async (req: AuthRequest, res) => {
  try {
    const message: string = req.body.message;

    if (!message) {
      res.status(400).json({ error: 'Falta el campo "message"' });
      return;
    }

    const { rows: previous } = await pool.query<ChatMessage>(
      `SELECT role, content FROM (
         SELECT role, content, created_at FROM messages
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       ) recientes
       ORDER BY created_at ASC`,
      [req.userId, MAX_HISTORY_MESSAGES]
    );

    await pool.query(`INSERT INTO messages (user_id, role, content) VALUES ($1, 'user', $2)`, [
      req.userId,
      message
    ]);

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');

    const fullHistory: ChatMessage[] = [...previous, { role: 'user', content: message }];
    const reply = await runAgent(fullHistory, req.userId!, (chunk) => {
      res.write(chunk);
    });

    await pool.query(`INSERT INTO messages (user_id, role, content) VALUES ($1, 'assistant', $2)`, [
      req.userId,
      reply
    ]);

    res.end();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error interno del agente' });
    } else {
      res.end();
    }
  }
});