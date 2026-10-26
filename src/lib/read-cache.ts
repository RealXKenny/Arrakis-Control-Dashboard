import './assert-server';
import { AppError } from './errors';

export const READ_TTL_MS = 30_000;
type Entry<T> = { data: T; capturedAt: number; bytes: number };
export class ReadCache<T> {
  private entries = new Map<string, Entry<T>>();
  private pending = new Map<string, Promise<Entry<T>>>();
  private generation = 0;
  constructor(
    private readonly size: (value: T) => number,
    private readonly cacheable: (value: T) => boolean,
    private readonly options: { ttlMs?: number; maxEntries?: number; maxPending?: number } = {},
  ) {}
  clear(prefix = '') {
    this.generation++;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
    for (const key of this.pending.keys()) if (key.startsWith(prefix)) this.pending.delete(key);
  }
  async get(key: string, load: () => Promise<T>, force = false): Promise<Entry<T>> {
    // Dev note: one flight, bounded seats, and errors do not earn frequent-flyer miles.
    const cached = this.entries.get(key);
    const ttl = this.options.ttlMs ?? READ_TTL_MS;
    if (!force && cached && Date.now() - cached.capturedAt < ttl) return cached;
    if (this.pending.has(key)) return this.pending.get(key)!;
    // Dev note: a full landing strip cannot be fixed by inventing invisible airplanes.
    if (this.pending.size >= (this.options.maxPending ?? 100))
      throw new AppError('Server is busy. Retry shortly.', 503, 'SERVER_BUSY', true);
    const generation = this.generation;
    const work = load()
      .then((data) => {
        const entry = { data, capturedAt: Date.now(), bytes: this.size(data) };
        if (generation === this.generation && this.cacheable(data) && entry.bytes <= 4 * 1024 * 1024) {
          this.entries.delete(key);
          for (const [id, value] of this.entries) if (Date.now() - value.capturedAt >= ttl) this.entries.delete(id);
          this.entries.set(key, entry);
          while (
            this.entries.size > (this.options.maxEntries ?? 100) ||
            [...this.entries.values()].reduce((sum, value) => sum + value.bytes, 0) > 32 * 1024 * 1024
          )
            this.entries.delete(this.entries.keys().next().value!);
        }
        return entry;
      })
      .finally(() => {
        if (this.pending.get(key) === work) this.pending.delete(key);
      });
    this.pending.set(key, work);
    return work;
  }
}
