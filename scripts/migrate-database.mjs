import dotenv from 'dotenv';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

dotenv.config({ quiet: true });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');
const sslMode = process.env.DATABASE_SSL_MODE ?? 'require';
const ssl = sslMode === 'disable' ? false : { rejectUnauthorized: sslMode === 'verify-full' };
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sql = await readFile(
  path.join(root, 'src', 'infrastructure', 'storage', 'migrations', '001_initial.sql'),
  'utf8',
);
const client = new pg.Client({ connectionString: databaseUrl, ssl });
try {
  await client.connect();
  await client.query(sql);
  process.stdout.write('PostgreSQL migration completed.\n');
} finally {
  await client.end();
}
