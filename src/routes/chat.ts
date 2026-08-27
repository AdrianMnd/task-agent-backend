import { Router } from 'express';
import { runAgent } from '../agent/agentLoop.js';
import type { ChatMessage } from '../types.js';

export const chatRouter = Router();

chatRouter.post('/chat', async (req, res) => {
  try {
    const history: ChatMessage[] = req.body.history ?? [];
    const message: string = req.body.message;

    if (!message) {
      res.status(400).json({ error: 'Falta el campo "message"' });
      return;
    }

    const fullHistory: ChatMessage[] = [...history, { role: 'user', content: message }];
    const reply = await runAgent(fullHistory);

    res.json({ reply });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error interno del agente' });
  }
});
