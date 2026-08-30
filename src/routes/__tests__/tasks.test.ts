import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authHeader } from '../../test/helpers.js';

const queryMock = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...args: any[]) => queryMock(...args) } }));

const { tasksRouter } = await import('../tasks.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', tasksRouter);
  return app;
}

beforeEach(() => {
  queryMock.mockReset();
});

describe('GET /tasks', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(buildApp()).get('/api/tasks');
    expect(res.status).toBe(401);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('devuelve las tareas escopadas al usuario del token', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 1, title: 'Tarea de Ana' }] });
    const res = await request(buildApp()).get('/api/tasks').set(authHeader(11));

    expect(res.status).toBe(200);
    expect(res.body.tasks).toEqual([{ id: 1, title: 'Tarea de Ana' }]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('WHERE user_id = $1'), [11]);
  });

  it('devuelve 500 si falla la base de datos', async () => {
    queryMock.mockRejectedValueOnce(new Error('boom'));
    const res = await request(buildApp()).get('/api/tasks').set(authHeader(1));
    expect(res.status).toBe(500);
  });
});
