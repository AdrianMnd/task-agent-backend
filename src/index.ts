import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chat.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', chatRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`Backend escuchando en puerto ${port}`));
