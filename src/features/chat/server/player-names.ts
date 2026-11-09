import '../../../lib/assert-server';
import { getServerEnv } from '../../../config/env';
import { DuneConsoleClient } from '../../../server/integrations/dune';

const PAGE_SIZE = 200;
const MAX_PAGES = 25;

export class ChatPlayerNames {
  private names = new Map<string, string>();
  private refreshAt = 0;
  private pending?: Promise<void>;

  readonly resolve = async (sender: string): Promise<string> => {
    if (Date.now() >= this.refreshAt && !this.pending) {
      this.pending = this.refresh()
        .then(() => {
          this.refreshAt = Date.now() + 60_000;
        })
        .catch(() => {
          this.names.clear();
          this.refreshAt = Date.now() + 15_000;
        })
        .finally(() => {
          this.pending = undefined;
        });
    }
    if (this.pending) {
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        this.pending,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, 1_500);
          timer.unref();
        }),
      ]).finally(() => clearTimeout(timer));
    }
    return this.names.get(sender) ?? sender;
  };

  private async refresh(): Promise<void> {
    const env = getServerEnv();
    if (!env.CONSOLE_URL || !env.CONSOLE_API_KEY) throw new Error('Console player directory is unavailable.');
    const client = new DuneConsoleClient(env.CONSOLE_URL, env.ADAPTER_TOKEN, env.CONSOLE_API_KEY);
    const players = new Map<string, { names: Set<string>; online: boolean }>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const result: unknown = await client.request('GET', '/api/players', {
        query: { page, pageSize: PAGE_SIZE, status: 'all' },
        timeoutMs: 1_500,
        retryRead: false,
      });
      if (!result || typeof result !== 'object' || !('rows' in result) || !Array.isArray(result.rows))
        throw new Error('Invalid player directory.');
      for (const row of result.rows.slice(0, PAGE_SIZE)) {
        if (!row || typeof row !== 'object') continue;
        const value = row as Record<string, unknown>;
        if (
          typeof value.funcom_id !== 'string' ||
          !value.funcom_id ||
          typeof value.character_name !== 'string' ||
          !value.character_name.trim()
        )
          continue;
        const name = value.character_name.trim();
        if (name.length > 100 || /[\u0000-\u001f\u007f]/u.test(name)) continue;
        const online = (value.actual_online_status ?? value.online_status) === 'Online';
        const existing = players.get(value.funcom_id);
        if (!existing || (online && !existing.online)) players.set(value.funcom_id, { names: new Set([name]), online });
        else if (existing.online === online) existing.names.add(name);
      }
      const total = 'totalCount' in result ? Number(result.totalCount) : Number.NaN;
      if (result.rows.length < PAGE_SIZE || (Number.isFinite(total) && (page + 1) * PAGE_SIZE >= total)) break;
      if (page === MAX_PAGES - 1) throw new Error('Player directory exceeds the lookup limit.');
    }
    this.names = new Map(
      [...players]
        .filter(([, value]) => value.names.size === 1)
        .map(([id, value]) => [id, value.names.values().next().value!]),
    );
  }
}
