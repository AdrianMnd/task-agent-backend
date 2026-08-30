import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import { signToken, requireAuth, type AuthRequest } from '../auth.js';

function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

describe('signToken', () => {
  it('genera un JWT valido firmado con JWT_SECRET que contiene el userId', () => {
    const token = signToken(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: number };
    expect(payload.userId).toBe(7);
  });

  it('lanza si JWT_SECRET no esta configurado', async () => {
    vi.resetModules();
    const original = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    const { signToken: signTokenSinSecreto } = await import('../auth.js');
    expect(() => signTokenSinSecreto(1)).toThrow('JWT_SECRET no configurado en .env');
    process.env.JWT_SECRET = original;
    vi.resetModules();
  });
});

describe('requireAuth', () => {
  it('deja pasar y asigna req.userId con un token valido', () => {
    const token = signToken(99);
    const req = { headers: { authorization: `Bearer ${token}` } } as AuthRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(req.userId).toBe(99);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('devuelve 401 si no hay header de autorizacion', () => {
    const req = { headers: {} } as AuthRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'No autenticado' });
    expect(next).not.toHaveBeenCalled();
  });

  it('devuelve 401 si el header no empieza por "Bearer "', () => {
    const req = { headers: { authorization: 'Token abc123' } } as AuthRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('devuelve 401 con token invalido o manipulado', () => {
    const req = { headers: { authorization: 'Bearer token-invalido' } } as AuthRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Token invalido o caducado' });
    expect(next).not.toHaveBeenCalled();
  });

  it('devuelve 401 con un token firmado con otro secreto', () => {
    const fakeToken = jwt.sign({ userId: 1 }, 'otro-secreto-cualquiera');
    const req = { headers: { authorization: `Bearer ${fakeToken}` } } as AuthRequest;
    const res = mockRes();
    const next = vi.fn();

    requireAuth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
