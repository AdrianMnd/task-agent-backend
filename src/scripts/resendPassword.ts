import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { pool } from '../db.js';

dotenv.config();

async function main() {
  const [, , email, newPassword] = process.argv;

  if (!email || !newPassword) {
    console.error('Uso: npm run reset-password -- <email> <nueva-contraseña>');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  if (newPassword.length < 8) {
    console.error('La contraseña debe tener al menos 8 caracteres.');
    process.exitCode = 1;
    await pool.end();
    return;
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const { rowCount } = await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [
    passwordHash,
    email.toLowerCase()
  ]);

  if (rowCount === 0) {
    console.error(`No existe ningun usuario con el email ${email}`);
    process.exitCode = 1;
  } else {
    console.log(`Contraseña actualizada para ${email}. Comunicasela al usuario por otro canal.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});