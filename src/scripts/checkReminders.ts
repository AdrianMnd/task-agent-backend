import dotenv from 'dotenv';
import { sendTaskReminderEmail } from '../tools/emailTools.js';
import { pool } from '../db.js';

dotenv.config();

async function main() {
  const result = await sendTaskReminderEmail({ onlyUrgent: true, skipIfEmpty: true });

  if ('error' in result) {
    console.error('No se pudo enviar el recordatorio:', result.error);
    process.exitCode = 1;
    await pool.end();
    return;
  }

  await pool.query(`INSERT INTO reminder_checks (urgent_count, email_sent) VALUES ($1, $2)`, [
    result.task_count,
    result.sent
  ]);

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