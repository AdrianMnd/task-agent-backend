import { describe, it, expect } from 'vitest';
import { toGeminiSchema } from '../agentLoop.js';

describe('toGeminiSchema', () => {
  it('convierte el type a mayusculas', () => {
    expect(toGeminiSchema({ type: 'string' })).toEqual({ type: 'STRING' });
    expect(toGeminiSchema({ type: 'object', properties: {} })).toEqual({
      type: 'OBJECT',
      properties: {}
    });
  });

  it('convierte recursivamente las properties anidadas', () => {
    const input = {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titulo' },
        days: { type: 'number' }
      },
      required: ['title']
    };
    expect(toGeminiSchema(input)).toEqual({
      type: 'OBJECT',
      properties: {
        title: { type: 'STRING', description: 'Titulo' },
        days: { type: 'NUMBER' }
      },
      required: ['title']
    });
  });

  it('convierte el schema de items en arrays', () => {
    const input = { type: 'array', items: { type: 'string' } };
    expect(toGeminiSchema(input)).toEqual({ type: 'ARRAY', items: { type: 'STRING' } });
  });

  it('conserva otros campos (description, required) sin tocarlos', () => {
    const input = { type: 'object', properties: {}, description: 'algo' };
    const result = toGeminiSchema(input);
    expect(result.description).toBe('algo');
  });

  it('devuelve el valor tal cual si no es un objeto', () => {
    expect(toGeminiSchema(null)).toBeNull();
    expect(toGeminiSchema(undefined)).toBeUndefined();
    expect(toGeminiSchema('texto')).toBe('texto');
  });

  it('funciona con los schemas reales de las herramientas del proyecto', () => {
    const createTaskSchema = {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Titulo breve de la tarea' },
        due_date: { type: 'string', description: 'Fecha limite en formato YYYY-MM-DD, opcional' }
      },
      required: ['title']
    };
    const result = toGeminiSchema(createTaskSchema);
    expect(result.type).toBe('OBJECT');
    expect(result.properties.title.type).toBe('STRING');
    expect(result.properties.due_date.type).toBe('STRING');
    expect(result.required).toEqual(['title']);
  });
});
