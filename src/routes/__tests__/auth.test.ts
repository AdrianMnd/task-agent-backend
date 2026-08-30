import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';

const queryMock = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...args: any[]) => queryMock(...args) } }));

const sendResetNotificationMock = vi.fn();
vi.mock('../../tools/emailTools.js', () => ({
  sendPasswordResetNotification: (...args: any[]) => sendResetNotificationMock(...args)
}));

const { authRouter } = await import('../auth.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', authRouter);
  return app;
}

beforeEach(() => {
  queryMock.mockReset();
  sendResetNotificationMock.mockReset();
});

describe('POST /auth/register', () => {
  it('registra un usuario nuevo y devuelve token + user', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, email: 'nuevo@example.com' }] });
    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'Nuevo@Example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 1, email: 'nuevo@example.com' });
    expect(res.body.token).toBeTruthy();
    // El email se normaliza a minusculas antes de guardarlo
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), ['nuevo@example.com', expect.any(String)]);
  });

  it('rechaza contraseñas de menos de 8 caracteres', async () => {
    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'a@example.com', password: 'corta' });

    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('rechaza si falta el email', async () => {
    const res = await request(buildApp()).post('/api/auth/register').send({ password: 'password123' });
    expect(res.status).toBe(400);
  });

  it('devuelve 409 si el email ya existe (violacion de unicidad de Postgres)', async () => {
    queryMock.mockRejectedValueOnce({ code: '23505' });
    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'ya@example.com', password: 'password123' });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ya está registrado/);
  });

  it('devuelve 500 ante un error inesperado de base de datos', async () => {
    queryMock.mockRejectedValueOnce(new Error('conexion perdida'));
    const res = await request(buildApp())
      .post('/api/auth/register')
      .send({ email: 'x@example.com', password: 'password123' });
    expect(res.status).toBe(500);
  });
});

describe('POST /auth/login', () => {
  it('devuelve token con credenciales correctas', async () => {
    const hash = await bcrypt.hash('password123', 10);
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5, email: 'user@example.com', password_hash: hash }] });

    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'password123' });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({ id: 5, email: 'user@example.com' });
  });

  it('devuelve 401 (no 500) si el usuario no existe', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'no-existe@example.com', password: 'cualquiera123' });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Credenciales incorrectas');
  });

  it('devuelve 401 con la contraseña incorrecta', async () => {
    const hash = await bcrypt.hash('la-correcta-123', 10);
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5, email: 'user@example.com', password_hash: hash }] });

    const res = await request(buildApp())
      .post('/api/auth/login')
      .send({ email: 'user@example.com', password: 'otra-cosa-123' });

    expect(res.status).toBe(401);
  });
});

describe('POST /auth/request-reset', () => {
  it('notifica al operador si el email existe', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    const res = await request(buildApp()).post('/api/auth/request-reset').send({ email: 'user@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: true });
    expect(sendResetNotificationMock).toHaveBeenCalledWith('user@example.com');
  });

  it('responde igual (sin notificar) si el email no existe, para no revelar cuentas', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp())
      .post('/api/auth/request-reset')
      .send({ email: 'no-existe@example.com' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ requested: true });
    expect(sendResetNotificationMock).not.toHaveBeenCalled();
  });

  it('rechaza si falta el email', async () => {
    const res = await request(buildApp()).post('/api/auth/request-reset').send({});
    expect(res.status).toBe(400);
  });
});
