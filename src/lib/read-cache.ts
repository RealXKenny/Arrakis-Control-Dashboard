import './assert-server';

export const READ_TTL_MS = 30_000;
type Entry<T> = { data: T; capturedAt: number; bytes: number };
/** Process-local, bounded single-flight cache. No errors or mutations are retained. */
export class ReadCache<T> {
  private entries = new Map<string, Entry<T>>();
  private pending = new Map<string, Promise<Entry<T>>>();
  private generation = 0;
  constructor(
    private readonly size: (value: T) => number,
    private readonly cacheable: (value: T) => boolean,
  ) {}
  clear(prefix = '') {
    this.generation++;
    for (const key of this.entries.keys()) if (key.startsWith(prefix)) this.entries.delete(key);
    for (const key of this.pending.keys()) if (key.startsWith(prefix)) this.pending.delete(key);
  }
  async get(key: string, load: () => Promise<T>, force = false): Promise<Entry<T>> {
    const cached = this.entries.get(key);
    if (!force && cached && Date.now() - cached.capturedAt < READ_TTL_MS) return cached;
    if (this.pending.has(key)) return this.pending.get(key)!;
    // Over-capacity traffic stays uncached instead of growing pending state indefinitely.
    if (this.pending.size >= 100) return { data: await load(), capturedAt: Date.now(), bytes: 0 };
    const generation = this.generation;
    const work = load()
      .then((data) => {
        const entry = { data, capturedAt: Date.now(), bytes: this.size(data) };
        if (generation === this.generation && this.cacheable(data) && entry.bytes <= 4 * 1024 * 1024) {
          this.entries.delete(key);
          for (const [id, value] of this.entries)
            if (Date.now() - value.capturedAt >= READ_TTL_MS) this.entries.delete(id);
          this.entries.set(key, entry);
          while (
            this.entries.size > 100 ||
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
