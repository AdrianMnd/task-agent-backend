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

interface ReminderOptions {
  userId: number;
  onlyUrgent: boolean;
  additionalNotes?: string;
  // Si es true y no hay tareas que reportar, no se envia ningun email.
  // Pensado para el script automatico: no tiene sentido un email diario diciendo "nada urgente".
  skipIfEmpty?: boolean;
}

type ReminderResult = { sent: boolean; task_count: number; email_id?: string } | { error: string };

export async function sendTaskReminderEmail(options: ReminderOptions): Promise<ReminderResult> {
  if (!process.env.RESEND_API_KEY) {
    return { error: 'RESEND_API_KEY no configurado en .env' };
  }
  if (!REMINDER_EMAIL) {
    return { error: 'REMINDER_EMAIL no configurado en .env' };
  }

  let daysAhead = 3;
  if (options.onlyUrgent) {
    const { rows } = await pool.query<{ reminder_days_ahead: number }>(
      `SELECT reminder_days_ahead FROM users WHERE id = $1`,
      [options.userId]
    );
    daysAhead = rows[0]?.reminder_days_ahead ?? 3;
  }

  const query = options.onlyUrgent
    ? `SELECT * FROM tasks
       WHERE user_id = $1 AND completed = false AND due_date IS NOT NULL
       AND due_date <= now() + make_interval(days => $2)
       ORDER BY due_date ASC`
    : `SELECT * FROM tasks WHERE user_id = $1 AND completed = false ORDER BY due_date ASC NULLS LAST`;
  const { rows } = await pool.query<Task>(query, options.onlyUrgent ? [options.userId, daysAhead] : [options.userId]);

  if (options.skipIfEmpty && rows.length === 0) {
    return { sent: false, task_count: 0 };
  }

  const extraSection = options.additionalNotes
    ? `<h3 style="margin-top:24px">Otros pendientes</h3>${options.additionalNotes}`
    : '';

  const html = `
    <h2>Tus tareas</h2>
    ${formatTaskListHtml(rows)}
    ${extraSection}
  `;

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to: REMINDER_EMAIL,
    subject: options.onlyUrgent ? 'Tareas urgentes' : 'Resumen de tareas pendientes',
    html
  });

  if (error) {
    return { error: `Resend error: ${error.message}` };
  }
  return { sent: true, task_count: rows.length, email_id: data?.id };
}

export async function executeEmailTool(name: string, input: any, userId: number): Promise<unknown> {
  switch (name) {
    case 'send_reminder_email':
      return sendTaskReminderEmail({
        userId,
        onlyUrgent: Boolean(input?.only_urgent),
        additionalNotes: input?.additional_notes
      });
    default:
      return { error: `Herramienta de email desconocida: ${name}` };
  }
}

// Como con los recordatorios, Resend (sin dominio verificado) solo puede enviar a
// REMINDER_EMAIL. Por eso el flujo de "olvide mi contraseña" no manda un enlace al
// usuario que lo pide: le avisa a Adrian, que ejecuta el script reset-password a mano
// y le comunica la nueva contraseña al usuario por otro canal. No ideal, pero honesto
// sobre la limitacion en vez de fingir un flujo automatico que no puede funcionar.
export async function sendPasswordResetNotification(userEmail: string): Promise<void> {
  if (!process.env.RESEND_API_KEY || !REMINDER_EMAIL) {
    console.error('No se pudo notificar la solicitud de reset: falta RESEND_API_KEY o REMINDER_EMAIL');
    return;
  }

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: REMINDER_EMAIL,
    subject: 'Solicitud de restablecimiento de contraseña',
    html: `
      <p>El usuario <strong>${userEmail}</strong> ha solicitado restablecer su contraseña.</p>
      <p>Ejecuta en el backend: <code>npm run reset-password -- ${userEmail} nueva-contraseña</code></p>
      <p>Y comunícasela al usuario por otro canal.</p>
    `
  });
}
