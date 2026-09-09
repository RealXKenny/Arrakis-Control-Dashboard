export type StoredRateLimit = { count: number; resetAt: number };

export interface StateStore {
  getSession<T>(hash: string): Promise<T | null>;
  saveSession(hash: string, value: unknown, expiresAt: number): Promise<void>;
  deleteSession(hash: string): Promise<void>;
  incrementRateLimit(key: string, windowMs: number): Promise<StoredRateLimit>;
  reserveImport(
    owner: string,
    day: string,
    operationId: string,
    value: unknown,
    limit: number,
  ): Promise<'NEW' | 'LIMIT' | unknown>;
  finishImport(owner: string, day: string, operationId: string, value: unknown): Promise<void>;
  acquireLease(key: string, expiresAt: number): Promise<boolean>;
  addPopulationSample(source: string, at: number, online: number, retentionSeconds: number): Promise<void>;
  readPopulationSamples(source: string, since: number): Promise<unknown[]>;
  getGuildLogo(guildId: string): Promise<string | null>;
  setGuildLogo(guildId: string, value: string): Promise<void>;
}
