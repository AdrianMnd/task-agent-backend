import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { authHeader } from '../../test/helpers.js';

const generateContentMock = vi.fn();
vi.mock('@google/genai', () => ({
  GoogleGenAI: vi.fn().mockImplementation(function () {
    return { models: { generateContent: (...args: any[]) => generateContentMock(...args) } };
  })
}));

const { transcribeRouter } = await import('../transcribe.js');

function buildApp() {
  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use('/api', transcribeRouter);
  return app;
}

beforeEach(() => {
  generateContentMock.mockReset();
});

describe('POST /transcribe', () => {
  it('devuelve 401 sin token', async () => {
    const res = await request(buildApp()).post('/api/transcribe').send({ audio: 'base64', mimeType: 'audio/webm' });
    expect(res.status).toBe(401);
  });

  it('devuelve 400 si falta audio o mimeType', async () => {
    const res = await request(buildApp()).post('/api/transcribe').set(authHeader(1)).send({ audio: 'x' });
    expect(res.status).toBe(400);
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('transcribe correctamente y recorta espacios sobrantes', async () => {
    generateContentMock.mockResolvedValueOnce({ text: '  crea una tarea para mañana  ' });
    const res = await request(buildApp())
      .post('/api/transcribe')
      .set(authHeader(1))
      .send({ audio: 'YmFzZTY0', mimeType: 'audio/webm' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: 'crea una tarea para mañana' });
    expect(generateContentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        contents: [
          expect.objectContaining({
            parts: expect.arrayContaining([
              { inlineData: { mimeType: 'audio/webm', data: 'YmFzZTY0' } }
            ])
          })
        ]
      })
    );
  });

  it('devuelve texto vacio si Gemini no devuelve nada, sin fallar', async () => {
    generateContentMock.mockResolvedValueOnce({ text: undefined });
    const res = await request(buildApp())
      .post('/api/transcribe')
      .set(authHeader(1))
      .send({ audio: 'YQ==', mimeType: 'audio/wav' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ text: '' });
  });

  it('devuelve 500 si Gemini falla', async () => {
    generateContentMock.mockRejectedValueOnce(new Error('quota exceeded'));
    const res = await request(buildApp())
      .post('/api/transcribe')
      .set(authHeader(1))
      .send({ audio: 'YQ==', mimeType: 'audio/wav' });

    expect(res.status).toBe(500);
  });
});
