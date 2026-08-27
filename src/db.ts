import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Neon requiere SSL. rejectUnauthorized:false evita problemas con el
// certificado autofirmado que usan algunos hosts de Neon en desarrollo.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
