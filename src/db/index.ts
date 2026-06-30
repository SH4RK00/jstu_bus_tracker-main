import * as dotenv from 'dotenv';
dotenv.config();

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

export const createPool = () => {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.SQL_URL;
  const host = process.env.SQL_HOST || process.env.PGHOST || process.env.POSTGRES_HOST;
  const user = process.env.SQL_USER || process.env.PGUSER || process.env.POSTGRES_USER;
  const password = process.env.SQL_PASSWORD || process.env.PGPASSWORD || process.env.POSTGRES_PASSWORD;
  const database = process.env.SQL_DB_NAME || process.env.PGDATABASE || process.env.POSTGRES_DB;
  const isNeon = (connectionString || host || '').includes('neon.tech');

  if (connectionString) {
    return new Pool({
      connectionString,
      connectionTimeoutMillis: 15000,
      ssl: isNeon ? { rejectUnauthorized: false } : undefined,
    });
  }

  return new Pool({
    host,
    user,
    password,
    database,
    connectionTimeoutMillis: 15000,
    ssl: isNeon ? { rejectUnauthorized: false } : undefined,
  });
};

const pool = createPool();

pool.on('error', (err) => {
  console.error('Unexpected error on idle SQL pool client:', err);
});

export const db = drizzle(pool, { schema });

export async function ensureDatabaseSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id serial PRIMARY KEY,
      uid text UNIQUE,
      email text NOT NULL UNIQUE,
      name text NOT NULL,
      password text DEFAULT '',
      role text NOT NULL DEFAULT 'user',
      created_at timestamp DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS buses (
      id serial PRIMARY KEY,
      bus_number text NOT NULL UNIQUE,
      name text NOT NULL,
      is_running boolean NOT NULL DEFAULT false,
      last_latitude double precision,
      last_longitude double precision,
      last_updated timestamp,
      odometer double precision DEFAULT 125430.5,
      engine_hours double precision DEFAULT 3452.1,
      sos_active boolean DEFAULT false,
      sos_message text DEFAULT '',
      created_at timestamp DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schedules (
      id serial PRIMARY KEY,
      bus_id integer NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
      route_from text NOT NULL,
      route_to text NOT NULL,
      departure_time text NOT NULL,
      arrival_time text NOT NULL,
      created_at timestamp DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id serial PRIMARY KEY,
      bus_id integer NOT NULL UNIQUE REFERENCES buses(id) ON DELETE CASCADE,
      driver_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      assigned_at timestamp DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS location_logs (
      id serial PRIMARY KEY,
      bus_id integer NOT NULL REFERENCES buses(id) ON DELETE CASCADE,
      driver_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      latitude double precision NOT NULL,
      longitude double precision NOT NULL,
      "timestamp" timestamp NOT NULL DEFAULT now()
    );
  `);
}
