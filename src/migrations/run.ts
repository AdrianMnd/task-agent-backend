// Script simple de migracion: ejecuta 001_init.sql contra DATABASE_URL.
// Uso: npm run migrate
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const sql = readFileSync(join(__dirname, '001_init.sql'), 'utf-8');
  await pool.query(sql);
  console.log('Migracion aplicada correctamente.');
  await pool.end();
}

main().catch((err) => {
  console.error('Error al migrar:', err);
  process.exit(1);
});
