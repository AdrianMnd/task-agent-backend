import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.JWT_SECRET;

export interface AuthRequest extends Request {
  userId?: number;
}

export function signToken(userId: number): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET no configurado en .env');
  }
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

// Extrae el user_id del token y lo cuelga en req.userId. Las rutas y herramientas
// siempre leen el usuario de aqui, nunca de un parametro que venga del cliente
// (body/query) ni mucho menos de algo que decida el modelo.
export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token || !JWT_SECRET) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    req.userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido o caducado' });
  }
}
