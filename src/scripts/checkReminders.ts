// Script pensado para ejecutarse solo, periodicamente (Task Scheduler / GitHub Actions),
// SIN que nadie escriba nada en el chat. Es la diferencia entre "el agente responde
// cuando le preguntas" y "el agente actua por su cuenta" — la parte mas autonoma
// de todo el proyecto.
//
// No tiene sesion HTTP (no hay token de usuario), asi que resuelve el usuario
// buscando en la tabla users el email configurado en REMINDER_EMAIL.
import dotenv from 'dotenv';
import { sendTaskReminderEmail } from '../tools/emailTools.js';
import { pool } from '../db.js';

dotenv.config();

async function main() {
  const reminderEmail = process.env.REMINDER_EMAIL;
  if (!reminderEmail) {
    console.error('REMINDER_EMAIL no configurado en .env');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const { rows } = await pool.query<{ id: number }>(`SELECT id FROM users WHERE email = $1`, [
    reminderEmail.toLowerCase()
  ]);

  if (rows.length === 0) {
    console.error(`No existe ningun usuario registrado con el email ${reminderEmail}`);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const result = await sendTaskReminderEmail({ userId: rows[0].id, onlyUrgent: true, skipIfEmpty: true });

  if ('error' in result) {
    console.error('No se pudo enviar el recordatorio:', result.error);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  await pool.query(
    `INSERT INTO reminder_checks (user_id, urgent_count, email_sent) VALUES ($1, $2, $3)`,
    [rows[0].id, result.task_count, result.sent]
  );

  if (!result.sent) {
    console.log('Sin tareas urgentes, no se envia recordatorio.');
  } else {
    console.log(`Recordatorio enviado (${result.task_count} tareas urgentes).`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Error inesperado en checkReminders:', err);
  process.exit(1);
});
