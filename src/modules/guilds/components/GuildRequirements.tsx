import { useEffect, useState } from 'react';
import { guildRequirementSchema, type GuildRequirement, type GuildRequirementListing } from '../requirements';
import css from '../styles/requirements.module.css';

async function read(response: Response) {
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.error || 'Unable to load guild requirements.');
  return body.data;
}

export default function GuildRequirements({
  guildId,
  guildName,
  settings = false,
}: {
  guildId?: string;
  guildName: string;
  settings?: boolean;
}) {
  const [entries, setEntries] = useState<GuildRequirementListing[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [form, setForm] = useState<GuildRequirement>({ guildName, requirements: '', contact: '', published: false });
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReady(false);
    setError('');
    const url = settings
      ? `/api/guilds/${encodeURIComponent(guildId ?? '')}/requirements`
      : `/api/guilds/requirements?page=${page}`;
    void fetch(url)
      .then(read)
      .then((data) => {
        if (cancelled) return;
        setReady(true);
        if (settings) setForm(data ?? { guildName, requirements: '', contact: '', published: false });
        else {
          setEntries(data.rows);
          setHasMore(data.hasMore);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [settings, guildId, guildName, page, reload]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    const parsed = guildRequirementSchema.safeParse(form);
    if (!parsed.success) {
      setError('Enter a guild name and joining requirements before publishing.');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const data = await read(
        await fetch(`/api/guilds/${encodeURIComponent(guildId ?? '')}/requirements`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsed.data),
        }),
      );
      setForm(data);
      setMessage(data.published ? 'Guild requirements published.' : 'Settings saved. Your guild is not listed.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save guild settings.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={css.workspace} aria-label={settings ? 'Guild settings' : 'Guild requirements'}>
      <h2>{settings ? 'Guild settings' : 'Guild requirements'}</h2>
      <p>
        {settings
          ? 'Publish your guild’s joining requirements. Only the guild leader can edit these settings.'
          : 'Find a guild recruiting new members and read their joining requirements.'}
      </p>
      {loading && <p role="status">Loading guild requirements…</p>}
      {error && (
        <div role="alert">
          {error}{' '}
          <button type="button" onClick={() => setReload(reload + 1)}>
            Retry loading
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {!loading && ready && settings && (
        <form onSubmit={save} className={css.form}>
          <label>
            Guild name
            <input
              required
              maxLength={100}
              value={form.guildName}
              onChange={(e) => setForm({ ...form, guildName: e.target.value })}
            />
          </label>
          <label>
            Joining requirements
            <textarea
              rows={7}
              maxLength={2000}
              required={form.published}
              value={form.requirements}
              placeholder="Play style, activity, language, experience, and any other requirements"
              onChange={(e) => setForm({ ...form, requirements: e.target.value })}
            />
          </label>
          <label>
            How to join
            <input
              maxLength={200}
              value={form.contact}
              placeholder="Who to contact in game or on Discord"
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
            />
          </label>
          <label className={css.checkbox}>
            <input
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm({ ...form, published: e.target.checked })}
            />
            List my guild for recruitment
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save guild settings'}
          </button>
        </form>
      )}
      {!loading && !settings && !error && (
        <>
          {entries.length === 0 && (
            <p>No guilds are recruiting here yet. Guild leaders can create a listing in Settings.</p>
          )}
          <div className={css.cards}>
            {entries.map((entry) => (
              <article key={entry.guildId} className={css.card}>
                <h3>{entry.guildName}</h3>
                <h4>Joining requirements</h4>
                <p>{entry.requirements}</p>
                {entry.contact && (
                  <>
                    <h4>How to join</h4>
                    <p>{entry.contact}</p>
                  </>
                )}
              </article>
            ))}
          </div>
          <nav className={css.paging} aria-label="Guild requirements pages">
            <button disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>Page {page + 1}</span>
            <button disabled={!hasMore} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
