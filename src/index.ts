import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chat.js';
import { tasksRouter } from './routes/tasks.js';
import { remindersRouter } from './routes/reminders.js';
import { authRouter } from './routes/auth.js';
import { transcribeRouter } from './routes/transcribe.js';

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.FRONTEND_URL || true }));
// Limite mas alto que el default (100kb) porque el audio en base64 de un mensaje
// de voz corto ya pesa varios cientos de KB.
app.use(express.json({ limit: '10mb' }));
app.use('/api', authRouter);
app.use('/api', chatRouter);
app.use('/api', tasksRouter);
app.use('/api', remindersRouter);
app.use('/api', transcribeRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Backend escuchando en puerto ${port}`));
