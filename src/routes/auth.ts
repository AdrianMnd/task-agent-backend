import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { pool } from '../db.js';
import { signToken } from '../middleware/auth.js';
import { sendPasswordResetNotification } from '../tools/emailTools.js';

export const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Prueba de nuevo en unos minutos.' }
});

const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Prueba de nuevo mas tarde.' }
});

authRouter.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password || password.length < 8) {
      res.status(400).json({ error: 'Email y contraseña (min. 8 caracteres) son obligatorios' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query<{ id: number; email: string }>(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email`,
      [String(email).toLowerCase(), passwordHash]
    );

    const token = signToken(rows[0].id);
    res.json({ token, user: rows[0] });
  } catch (err: any) {
    if (err.code === '23505') {
      res.status(409).json({ error: 'Ese email ya está registrado' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Error al registrar usuario' });
  }
});

authRouter.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body ?? {};
    const { rows } = await pool.query<{ id: number; email: string; password_hash: string }>(
      `SELECT * FROM users WHERE email = $1`,
      [String(email ?? '').toLowerCase()]
    );
    const user = rows[0];

    if (!user || !(await bcrypt.compare(password ?? '', user.password_hash))) {
      res.status(401).json({ error: 'Credenciales incorrectas' });
      return;
    }

    const token = signToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

authRouter.post('/auth/request-reset', resetLimiter, async (req, res) => {
  try {
    const { email } = req.body ?? {};
    if (!email) {
      res.status(400).json({ error: 'Email es obligatorio' });
      return;
    }

    const normalizedEmail = String(email).toLowerCase();
    const { rows } = await pool.query<{ id: number }>(`SELECT id FROM users WHERE email = $1`, [
      normalizedEmail
    ]);

    if (rows.length > 0) {
      await sendPasswordResetNotification(normalizedEmail);
    }

    res.json({ requested: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al solicitar el restablecimiento' });
  }
});