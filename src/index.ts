import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chat.js';
import { tasksRouter } from './routes/tasks.js';
import { remindersRouter } from './routes/reminders.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', chatRouter);
app.use('/api', tasksRouter);
app.use('/api', remindersRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Backend escuchando en puerto ${port}`));
