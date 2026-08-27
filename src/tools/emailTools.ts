import { Resend } from 'resend';
import dotenv from 'dotenv';
import { pool } from '../db.js';
import type { Task } from '../types.js';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const REMINDER_EMAIL = process.env.REMINDER_EMAIL;
// Direccion de pruebas de Resend: no requiere verificar dominio, pero solo puede
// enviar a la direccion con la que te registraste en Resend (que sera REMINDER_EMAIL).
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'onboarding@resend.dev';

export const emailToolDefinitions = [
  {
    name: 'send_reminder_email',
    description: 'Envia por email un resumen de las tareas pendientes del usuario.',
    input_schema: {
      type: 'object',
      properties: {
        only_urgent: {
          type: 'boolean',
          description: 'Si es true, incluye solo tareas con fecha limite en los proximos 3 dias'
        }
      }
    }
  }
] as const;

function formatTaskListHtml(tasks: Task[]): string {
  if (tasks.length === 0) return '<p>No tienes tareas pendientes. 🎉</p>';
  const items = tasks
    .map((t) => `<li><strong>${t.title}</strong>${t.due_date ? ` — vence ${t.due_date}` : ''}</li>`)
    .join('');
  return `<ul>${items}</ul>`;
}

export async function executeEmailTool(name: string, input: any): Promise<unknown> {
  if (!process.env.RESEND_API_KEY) {
    return { error: 'RESEND_API_KEY no configurado en .env' };
  }
  if (!REMINDER_EMAIL) {
    return { error: 'REMINDER_EMAIL no configurado en .env' };
  }

  switch (name) {
    case 'send_reminder_email': {
      const onlyUrgent = Boolean(input?.only_urgent);
      const query = onlyUrgent
        ? `SELECT * FROM tasks WHERE completed = false AND due_date IS NOT NULL AND due_date <= now() + interval '3 days' ORDER BY due_date ASC`
        : `SELECT * FROM tasks WHERE completed = false ORDER BY due_date ASC NULLS LAST`;
      const { rows } = await pool.query<Task>(query);

      const { data, error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to: REMINDER_EMAIL,
        subject: onlyUrgent ? 'Tareas urgentes' : 'Resumen de tareas pendientes',
        html: formatTaskListHtml(rows)
      });

      if (error) {
        return { error: `Resend error: ${error.message}` };
      }
      return { sent: true, task_count: rows.length, email_id: data?.id };
    }
    default:
      return { error: `Herramienta de email desconocida: ${name}` };
  }
}