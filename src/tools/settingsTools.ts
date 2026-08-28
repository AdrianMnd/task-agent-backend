import { pool } from '../db.js';

export const settingsToolDefinitions = [
  {
    name: 'set_reminder_window',
    description:
      'Actualiza con cuantos dias de antelacion se consideran "urgentes" las tareas, tanto ' +
      'para los recordatorios que se piden por chat como para el recordatorio automatico diario.',
    input_schema: {
      type: 'object',
      properties: {
        days_ahead: {
          type: 'number',
          description: 'Numero de dias de antelacion, por ejemplo 7 para una semana'
        }
      },
      required: ['days_ahead']
    }
  }
] as const;

export async function executeSettingsTool(name: string, input: any, userId: number): Promise<unknown> {
  switch (name) {
    case 'set_reminder_window': {
      const days = Math.max(1, Math.min(60, Math.round(input.days_ahead)));
      await pool.query(`UPDATE users SET reminder_days_ahead = $1 WHERE id = $2`, [days, userId]);
      return { updated: true, days_ahead: days };
    }
    default:
      return { error: `Herramienta de configuracion desconocida: ${name}` };
  }
}