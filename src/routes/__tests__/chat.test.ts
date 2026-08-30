import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authHeader } from '../../test/helpers.js';

const queryMock = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...args: any[]) => queryMock(...args) } }));

const runAgentMock = vi.fn();
vi.mock('../../agent/agentLoop.js', () => ({ runAgent: (...args: any[]) => runAgentMock(...args) }));

const { chatRouter } = await import('../chat.js');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', chatRouter);
  return app;
}

beforeEach(() => {
  queryMock.mockReset();
  runAgentMock.mockReset();
});

describe('GET /messages', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(buildApp()).get('/api/messages');
    expect(res.status).toBe(401);
  });

  it('devuelve el historial completo del usuario en orden cronologico', async () => {
    queryMock.mockResolvedValueOnce({
      rows: [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'hola, en que ayudo' }
      ]
    });
    const res = await request(buildApp()).get('/api/messages').set(authHeader(1));
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
  });
});

describe('DELETE /messages', () => {
  it('borra el historial del usuario del token', async () => {
    queryMock.mockResolvedValueOnce({});
    const res = await request(buildApp()).delete('/api/messages').set(authHeader(7));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ cleared: true });
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM messages'), [7]);
  });
});

describe('POST /chat', () => {
  it('devuelve 400 si falta el mensaje', async () => {
    const res = await request(buildApp()).post('/api/chat').set(authHeader(1)).send({});
    expect(res.status).toBe(400);
    expect(runAgentMock).not.toHaveBeenCalled();
  });

  it('carga el historial acotado, llama al agente y persiste ambos mensajes', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ role: 'user', content: 'anterior' }] }) // historial previo
      .mockResolvedValueOnce({}) // insert mensaje usuario
      .mockResolvedValueOnce({}); // insert respuesta asistente

    runAgentMock.mockImplementation(async (_history, _userId, onChunk) => {
      onChunk('Hola ');
      onChunk('mundo');
      return 'Hola mundo';
    });

    const res = await request(buildApp()).post('/api/chat').set(authHeader(3)).send({ message: 'hola' });

    expect(res.status).toBe(200);
    expect(res.text).toBe('Hola mundo');
    expect(res.headers['content-type']).toContain('text/plain');

    // El historial que llega al agente incluye lo previo + el mensaje nuevo
    const historyArg = runAgentMock.mock.calls[0][0];
    expect(historyArg).toEqual([
      { role: 'user', content: 'anterior' },
      { role: 'user', content: 'hola' }
    ]);
    expect(runAgentMock.mock.calls[0][1]).toBe(3);

    // Se persiste el mensaje del usuario y la respuesta completa del agente
    expect(queryMock).toHaveBeenNthCalledWith(2, expect.stringContaining("'user'"), [3, 'hola']);
    expect(queryMock).toHaveBeenNthCalledWith(3, expect.stringContaining("'assistant'"), [3, 'Hola mundo']);
  });

  it('devuelve 401 sin token', async () => {
    const res = await request(buildApp()).post('/api/chat').send({ message: 'hola' });
    expect(res.status).toBe(401);
  });
});
