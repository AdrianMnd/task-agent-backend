import { Resend } from 'resend';
import dotenv from 'dotenv';
import { pool } from '../db.js';
import type { Task } from '../types.js';

dotenv.config();

const resend = new Resend(process.env.RESEND_API_KEY);
const REMINDER_EMAIL = process.env.REMINDER_EMAIL;
const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS || 'onboarding@resend.dev';

export const emailToolDefinitions = [
  {
    name: 'send_reminder_email',
    description:
      'Envia por email un resumen de las tareas pendientes del usuario. Admite contenido ' +
      'adicional (additional_notes) para incluir informacion obtenida con otras herramientas, ' +
      'por ejemplo un resumen de PRs abiertos obtenido con list_github_prs.',
    input_schema: {
      type: 'object',
      properties: {
        only_urgent: {
          type: 'boolean',
          description: 'Si es true, incluye solo tareas con fecha limite en los proximos 3 dias'
        },
        additional_notes: {
          type: 'string',
          description:
            'HTML simple (listas, negritas) con informacion adicional a incluir en el email, ' +
            'por ejemplo un resumen de PRs pendientes. Opcional.'
        }
      }
    }
  }
] as const;

function formatDueDate(dateStr: string | null): string {
  if (!dateStr) return 'sin fecha límite';
  const due = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const label = due.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  return due < today
    ? `<span style="color:#dc2626;font-weight:600">vencida (${label})</span>`
    : `vence ${label}`;
}

function formatTaskListHtml(tasks: Task[]): string {
  if (tasks.length === 0) return '<p>No tienes tareas pendientes. 🎉</p>';
  const items = tasks
    .map((t) => `<li><strong>${t.title}</strong> — ${formatDueDate(t.due_date)}</li>`)
    .join('');
  return `<ul style="padding-left:20px;line-height:1.6">${items}</ul>`;
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

      const extraSection = input?.additional_notes
        ? `<h3 style="margin-top:24px">Otros pendientes</h3>${input.additional_notes}`
        : '';

      const html = `
        <h2>Tus tareas</h2>
        ${formatTaskListHtml(rows)}
        ${extraSection}
      `;

      const { data, error } = await resend.emails.send({
        from: FROM_ADDRESS,
        to: REMINDER_EMAIL,
        subject: onlyUrgent ? 'Tareas urgentes' : 'Resumen de tareas pendientes',
        html
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