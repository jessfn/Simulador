import { Pool } from 'pg';
import dotenv from 'dotenv';
import { instalarCapaCompatibilidad } from './compatibilidadApi';

dotenv.config();
instalarCapaCompatibilidad();   // las claves JSON históricas de la API se conservan aunque la base use nombres en español

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool de PostgreSQL:', err);
  process.exit(-1);
});

export default pool;
