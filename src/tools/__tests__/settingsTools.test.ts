import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../db.js', () => ({ pool: { query: (...args: any[]) => queryMock(...args) } }));

const { executeSettingsTool, settingsToolDefinitions } = await import('../settingsTools.js');

const USER_ID = 1;

beforeEach(() => {
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
});

describe('settingsToolDefinitions', () => {
  it('declara set_reminder_window', () => {
    expect(settingsToolDefinitions.map((t) => t.name)).toEqual(['set_reminder_window']);
  });
});

describe('executeSettingsTool', () => {
  it('guarda el valor redondeado tal cual si esta en rango', async () => {
    const result = await executeSettingsTool('set_reminder_window', { days_ahead: 7 }, USER_ID);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('UPDATE users'), [7, USER_ID]);
    expect(result).toEqual({ updated: true, days_ahead: 7 });
  });

  it('redondea valores decimales', async () => {
    const result = await executeSettingsTool('set_reminder_window', { days_ahead: 4.4 }, USER_ID);
    expect(result).toEqual({ updated: true, days_ahead: 4 });
  });

  it('nunca deja el valor por debajo de 1', async () => {
    const result = await executeSettingsTool('set_reminder_window', { days_ahead: 0 }, USER_ID);
    expect(result).toEqual({ updated: true, days_ahead: 1 });
  });

  it('nunca deja el valor por encima de 60 (evita "avisame con 400 dias")', async () => {
    const result = await executeSettingsTool('set_reminder_window', { days_ahead: 400 }, USER_ID);
    expect(result).toEqual({ updated: true, days_ahead: 60 });
  });

  it('valores negativos tambien se acotan a 1', async () => {
    const result = await executeSettingsTool('set_reminder_window', { days_ahead: -10 }, USER_ID);
    expect(result).toEqual({ updated: true, days_ahead: 1 });
  });

  it('herramienta desconocida devuelve error', async () => {
    const result = await executeSettingsTool('otra', {}, USER_ID);
    expect(result).toEqual({ error: 'Herramienta de configuracion desconocida: otra' });
  });
});
