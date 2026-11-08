import '../../../lib/assert-server';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { requireServerEnv } from '../../../config/env';

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const COST = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_LENGTH = 64;

/** scrypt, self-describing so the cost can be raised later without breaking old hashes. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

// Verifying against this when an account does not exist keeps "unknown email" and "wrong password" equally slow.
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(password: string, stored: string | undefined): Promise<boolean> {
  const hash = stored ?? (await (dummyHash ??= hashPassword(randomBytes(16).toString('hex'))));
  const [scheme, n, r, p, salt, expected] = hash.split('$');
  if (scheme !== 'scrypt' || !salt || !expected) return false;
  const params = { N: Number(n), r: Number(r), p: Number(p), maxmem: COST.maxmem };
  if (![params.N, params.r, params.p].every((value) => Number.isInteger(value) && value > 0)) return false;
  const expectedBuffer = Buffer.from(expected, 'base64');
  const derived = await scryptAsync(password, Buffer.from(salt, 'base64'), expectedBuffer.length, params);
  return timingSafeEqual(derived, expectedBuffer) && stored !== undefined;
}

function secretKey(purpose: string): Buffer {
  const { AUTH_SECRET } = requireServerEnv('AUTH_SECRET');
  return createHash('sha256').update(`${purpose}:${AUTH_SECRET}`).digest();
}

/** AES-256-GCM box for the Discord refresh token kept next to the account record. */
export function sealSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', secretKey('discord-refresh'), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString('base64')).join('.');
}

export function openSecret(sealed: string): string | null {
  try {
    const [iv, tag, body] = sealed.split('.').map((part) => Buffer.from(part, 'base64'));
    if (!iv || !tag || !body) return null;
    const decipher = createDecipheriv('aes-256-gcm', secretKey('discord-refresh'), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
