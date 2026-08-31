import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authHeader } from '../../test/helpers.js';

const queryMock = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...args: any[]) => queryMock(...args) } }));

const { remindersRouter } = await import('../reminders.js');

function buildApp() {
  const app = express();
  app.use('/api', remindersRouter);
  return app;
}

beforeEach(() => {
  queryMock.mockReset();
});

describe('GET /reminders/last', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(buildApp()).get('/api/reminders/last');
    expect(res.status).toBe(401);
  });

  it('devuelve la ultima comprobacion del usuario', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [{ checked_at: '2026-08-29T08:00:00Z', urgent_count: 2, email_sent: true }]
    });
    const res = await request(buildApp()).get('/api/reminders/last').set(authHeader(3));

    expect(res.status).toBe(200);
    expect(res.body.lastCheck).toEqual({
      checked_at: '2026-08-29T08:00:00Z',
      urgent_count: 2,
      email_sent: true
    });
    expect(queryMock).toHaveBeenCalledWith(expect.any(String), [3]);
  });

  it('devuelve null si el usuario nunca ha tenido una comprobacion', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] });
    const res = await request(buildApp()).get('/api/reminders/last').set(authHeader(3));
    expect(res.body.lastCheck).toBeNull();
  });
});
