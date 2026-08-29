import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';

export const transcribeRouter = Router();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

transcribeRouter.post('/transcribe', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { audio, mimeType } = req.body ?? {};
    if (!audio || !mimeType) {
      res.status(400).json({ error: 'Faltan "audio" o "mimeType"' });
      return;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { inlineData: { mimeType, data: audio } },
            {
              text: 'Transcribe este audio a texto en español. Devuelve unicamente la transcripcion literal, sin comentarios ni explicaciones adicionales.'
            }
          ]
        }
      ]
    });

    res.json({ text: (response.text ?? '').trim() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error al transcribir el audio' });
  }
});