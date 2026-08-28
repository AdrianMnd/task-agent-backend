// Script de migracion: aplica todos los .sql de esta carpeta, en orden alfabetico.
// Uso: npm run migrate
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pool } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const files = readdirSync(__dirname)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const sql = readFileSync(join(__dirname, file), 'utf-8');
    await pool.query(sql);
    console.log(`Aplicada migracion: ${file}`);
  }

  console.log('Migraciones aplicadas correctamente.');
  await pool.end();
}

main().catch((err) => {
  console.error('Error al migrar:', err);
  process.exit(1);
});
