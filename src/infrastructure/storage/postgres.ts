import '../../lib/assert-server';
import { Pool, type PoolConfig } from 'pg';
import { getServerEnv } from '../../config/env';
import type { StateStore } from './types';

const globals = globalThis as typeof globalThis & { arrakisPostgresPool?: Pool };

export function getPostgresPool(): Pool {
  const env = getServerEnv();
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL storage');
  const ssl: PoolConfig['ssl'] =
    env.DATABASE_SSL_MODE === 'disable' ? false : { rejectUnauthorized: env.DATABASE_SSL_MODE === 'verify-full' };
  return (globals.arrakisPostgresPool ??= new Pool({
    connectionString: env.DATABASE_URL,
    ssl,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
  }));
}

export const postgresStateStore: StateStore = {
  async getSession<T>(hash: string) {
    const result = await getPostgresPool().query(
      'SELECT payload FROM arrakis_sessions WHERE session_hash = $1 AND expires_at > NOW()',
      [hash],
    );
    return (result.rows[0]?.payload as T | undefined) ?? null;
  },
  async saveSession(hash, value, expiresAt) {
    await getPostgresPool().query(
      `WITH expired AS (DELETE FROM arrakis_sessions WHERE expires_at <= NOW()) INSERT INTO arrakis_sessions (session_hash, payload, expires_at) VALUES ($1, $2, to_timestamp($3 / 1000.0)) ON CONFLICT (session_hash) DO UPDATE SET payload = EXCLUDED.payload, expires_at = EXCLUDED.expires_at`,
      [hash, value, expiresAt],
    );
  },
  async deleteSession(hash) {
    await getPostgresPool().query('DELETE FROM arrakis_sessions WHERE session_hash = $1', [hash]);
  },
  async incrementRateLimit(key, windowMs) {
    const result = await getPostgresPool().query(
      `WITH expired AS (DELETE FROM arrakis_rate_limits WHERE reset_at <= NOW()) INSERT INTO arrakis_rate_limits (bucket_key, count, reset_at) VALUES ($1, 1, NOW() + ($2 * INTERVAL '1 millisecond')) ON CONFLICT (bucket_key) DO UPDATE SET count = arrakis_rate_limits.count + 1 RETURNING count, EXTRACT(EPOCH FROM reset_at) * 1000 AS reset_at`,
      [key, windowMs],
    );
    return { count: Number(result.rows[0].count), resetAt: Number(result.rows[0].reset_at) };
  },
  async reserveImport(owner, day, operationId, value, limit) {
    const pool = getPostgresPool();
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`${owner}:${day}`]);
      await db.query('DELETE FROM arrakis_base_imports WHERE expires_at <= NOW()');
      const existing = await db.query(
        'SELECT payload FROM arrakis_base_imports WHERE owner_id = $1 AND operation_id = $2',
        [owner, operationId],
      );
      if (existing.rowCount) {
        await db.query('COMMIT');
        return existing.rows[0].payload;
      }
      const count = await db.query(
        'SELECT COUNT(*)::int AS count FROM arrakis_base_imports WHERE owner_id = $1 AND import_day = $2',
        [owner, day],
      );
      if (Number(count.rows[0].count) >= limit) {
        await db.query('COMMIT');
        return 'LIMIT';
      }
      await db.query(
        "INSERT INTO arrakis_base_imports (owner_id, import_day, operation_id, payload, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '2 days')",
        [owner, day, operationId, value],
      );
      await db.query('COMMIT');
      return 'NEW';
    } catch (error) {
      await db.query('ROLLBACK');
      throw error;
    } finally {
      db.release();
    }
  },
  async finishImport(owner, day, operationId, value) {
    await getPostgresPool().query(
      `INSERT INTO arrakis_base_imports (owner_id, import_day, operation_id, payload, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '2 days') ON CONFLICT (owner_id, operation_id) DO UPDATE SET payload = EXCLUDED.payload, import_day = EXCLUDED.import_day, expires_at = EXCLUDED.expires_at`,
      [owner, day, operationId, value],
    );
  },
  async acquireLease(key, expiresAt) {
    const result = await getPostgresPool().query(
      `WITH expired AS (DELETE FROM arrakis_leases WHERE expires_at <= NOW()) INSERT INTO arrakis_leases (lease_key, expires_at) VALUES ($1, to_timestamp($2 / 1000.0)) ON CONFLICT (lease_key) DO NOTHING RETURNING lease_key`,
      [key, expiresAt],
    );
    return Boolean(result.rowCount);
  },
  async addPopulationSample(source, at, online, retentionSeconds) {
    await getPostgresPool().query(
      `WITH inserted AS (INSERT INTO arrakis_population_samples (source_id, captured_at, online) VALUES ($1, to_timestamp($2 / 1000.0), $3) ON CONFLICT DO NOTHING) DELETE FROM arrakis_population_samples WHERE source_id = $1 AND captured_at < NOW() - ($4 * INTERVAL '1 second')`,
      [source, at, online, retentionSeconds],
    );
  },
  async readPopulationSamples(source, since) {
    const result = await getPostgresPool().query(
      `SELECT EXTRACT(EPOCH FROM captured_at) * 1000 AS at, online FROM arrakis_population_samples WHERE source_id = $1 AND captured_at >= to_timestamp($2 / 1000.0) ORDER BY captured_at`,
      [source, since],
    );
    return result.rows.map((row) => ({ at: Number(row.at), online: Number(row.online) }));
  },
  async getGuildLogo(guildId) {
    const result = await getPostgresPool().query('SELECT logo_data FROM arrakis_guild_logos WHERE guild_id = $1', [
      guildId,
    ]);
    return result.rows[0]?.logo_data ?? null;
  },
  async setGuildLogo(guildId, value) {
    await getPostgresPool().query(
      `INSERT INTO arrakis_guild_logos (guild_id, logo_data, updated_at) VALUES ($1, $2, NOW()) ON CONFLICT (guild_id) DO UPDATE SET logo_data = EXCLUDED.logo_data, updated_at = EXCLUDED.updated_at`,
      [guildId, value],
    );
  },
};
