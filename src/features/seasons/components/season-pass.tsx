'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useRef, useState, useId } from 'react';
import {
  type Season,
  type Progress,
  type Totals,
  type Reward,
  type Challenge,
  paths,
  levelProgress,
  seasonState,
  periodFor,
  emptyProgress,
  emptyTotals,
  seasonPresentation,
  artworkUrl,
  gameRewardLabel,
  type Delivery,
} from '../contracts';
import { useFeedbackSound } from '../../../lib/audio/use-feedback-sound';
import { RewardArt } from './reward-art';
import { SeasonDialog } from './season-dialog';
import { useCommunityProgress } from '../hooks/use-community-progress';
import '../styles/seasons.css';

export type SeasonView = {
  season: Season;
  progress: Progress;
  totals: Totals;
  deliveries?: Pick<Delivery, 'rewardId' | 'status'>[];
};
export async function seasonRequest<T>(url: string, payload?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: payload ? 'POST' : 'GET',
    cache: 'no-store',
    headers: payload ? { 'Content-Type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Season request failed.');
  return data as T;
}
function statusOf(challenge: Challenge, view: SeasonView) {
  const entries = view.progress.submissions.filter(
    (v) => v.challengeId === challenge.id && v.period === periodFor(challenge, view.season.definition, Date.now()),
  );
  if (entries.filter((v) => v.status === 'approved').length >= challenge.limit) return 'completed';
  if (entries.some((v) => v.status === 'pending')) return 'pending';
  return 'available';
}
export function SeasonPass({ mode = 'pass', preview }: { mode?: 'pass' | 'challenges' | 'history'; preview?: Season }) {
  const [views, setViews] = useState<SeasonView[]>(
    preview ? [{ season: preview, progress: emptyProgress(), totals: emptyTotals() }] : [],
  );
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(!preview);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('all');
  const [status, setStatus] = useState('all');
  const [cadence, setCadence] = useState('all');
  const [selection, setSelection] = useState<Reward | null>(null);
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [text, setText] = useState('');
  const [links, setLinks] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const track = useRef<HTMLDivElement>(null);
  const dialogTrigger = useRef<HTMLElement | null>(null);
  const trackId = useId();
  useFeedbackSound(error, message);
  function memberUrl() {
    const id = mode === 'history' ? null : new URLSearchParams(window.location.search).get('season');
    return id ? `/api/v2/seasons?season=${encodeURIComponent(id)}` : '/api/v2/seasons';
  }
  async function reload() {
    const data = await seasonRequest<{ seasons?: SeasonView[] } & Partial<SeasonView>>(memberUrl());
    setViews(data.season ? [data as SeasonView] : (data.seasons ?? []));
  }
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    fetch(memberUrl(), { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setViews(data.season ? [data] : data.seasons);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
    // Route mode is fixed for this mounted page; memberUrl reads the current document selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, mode]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const view =
    views.find((v) => seasonState(v.season, now) === 'active') ??
    views.find((v) => seasonState(v.season, now) === 'scheduled') ??
    views[0];
  const connection = useCommunityProgress(!preview && mode !== 'history' ? view?.season.id : undefined, (update) => {
    setViews((previous) =>
      previous.map((entry) =>
        entry.season.id !== update.season.id
          ? entry
          : {
              ...entry,
              season:
                (update.season.version ?? 0) >= (entry.season.version ?? 0)
                  ? { ...entry.season, ...update.season }
                  : entry.season,
              totals: (update.totals.version ?? 0) >= (entry.totals.version ?? 0) ? update.totals : entry.totals,
            },
      ),
    );
  });
  async function act(payload: Record<string, unknown>) {
    if (!view || preview || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const oldLevel = levelProgress(view.season.definition, view.progress.xp).level;
      const result = await seasonRequest<{ progress?: Progress; duplicate?: boolean }>('/api/v2/seasons', {
        ...payload,
        seasonId: view.season.id,
      });
      await reload();
      const newLevel = result.progress ? levelProgress(view.season.definition, result.progress.xp).level : oldLevel;
      setMessage(
        result.duplicate
          ? 'Already recorded. Your progress is safe.'
          : newLevel > oldLevel
            ? `Level ${newLevel} reached. New rewards await.`
            : payload.action === 'submit'
              ? 'Evidence submitted for review.'
              : payload.action === 'claim'
                ? 'Cosmetic claimed. It is yours to keep.'
                : payload.action === 'equip'
                  ? 'Cosmetic equipped.'
                  : payload.action === 'delivery-request'
                    ? 'Game delivery requested for administrator review.'
                    : 'Challenge verified. Season XP awarded.',
      );
      setChallenge(null);
      setSelection(null);
      setText('');
      setLinks('');
      setRequestId(crypto.randomUUID());
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Opening the season chronicle…</p>;
  if (!view)
    return (
      <section className="season-empty">
        <span className="season-kicker">Community seasons</span>
        <h1>The next chapter awaits.</h1>
        <p>No published season is available yet. Your earned recognition will always remain in Season History.</p>
        {error && <p role="alert">{error}</p>}
      </section>
    );
  const { season, progress, totals } = view;
  const definition = season.definition;
  const presentation = seasonPresentation(season);
  const leveling = levelProgress(definition, progress.xp);
  const remaining = Math.max(0, Date.parse(definition.endsAt) - now);
  const rewards = [...definition.rewards].sort((a, b) => a.level - b.level);
  const filtered = definition.challenges.filter(
    (v) =>
      (filter === 'all' || v.path === filter) &&
      (status === 'all' || statusOf(v, view) === status) &&
      (cadence === 'all' || v.cadence === cadence),
  );
  return (
    <div className="season-root">
      {!preview && (
        <nav className="season-tabs" aria-label="Season navigation">
          <Link href="/seasons" aria-current={mode === 'pass' ? 'page' : undefined}>
            Season pass
          </Link>
          <Link href="/seasons/challenges" aria-current={mode === 'challenges' ? 'page' : undefined}>
            Challenges
          </Link>
          <Link href="/seasons/history" aria-current={mode === 'history' ? 'page' : undefined}>
            Season History
          </Link>
        </nav>
      )}
      {error && (
        <p className="season-notice" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="season-notice" role="status">
          {message}
        </p>
      )}
      {mode === 'history' ? (
        <>
          <header>
            <span className="season-kicker">Your permanent chronicle</span>
            <h1>Season History</h1>
            <p>Every contribution leaves a mark. Cosmetics and recognition remain yours.</p>
          </header>
          {views.map((entry) => (
            <article className="season-history" key={entry.season.id}>
              <div>
                <span className="season-kicker">
                  Season {entry.season.definition.number} · {seasonState(entry.season)}
                </span>
                <h2>{entry.season.definition.name}</h2>
                <Link className="season-button" href={`/seasons?season=${entry.season.id}`}>
                  Open historical reward track
                </Link>
                <p>
                  Level {levelProgress(entry.season.definition, entry.progress.xp).level} ·{' '}
                  {entry.progress.xp.toLocaleString()} Season XP ·{' '}
                  {entry.progress.submissions.filter((v) => v.status === 'approved').length} approved challenges
                </p>
              </div>
              <div className="season-cosmetics">
                {entry.progress.claims.map((claim) => (
                  <button
                    key={claim.reward.id}
                    disabled={busy}
                    onClick={() => {
                      setBusy(true);
                      seasonRequest('/api/v2/seasons', {
                        action: 'equip',
                        seasonId: entry.season.id,
                        rewardId: claim.reward.id,
                      })
                        .then(() => setMessage(`${claim.reward.name} equipped.`))
                        .catch((e) => setError(e.message))
                        .finally(() => setBusy(false));
                    }}
                  >
                    <RewardArt reward={claim.reward} seasonId={entry.season.id} />
                    <span>Equip {claim.reward.name}</span>
                  </button>
                ))}
              </div>
              <details>
                <summary>Challenges, milestones & XP history</summary>
                {entry.progress.submissions.map((s) => (
                  <p key={s.id}>
                    {entry.season.definition.challenges.find((c) => c.id === s.challengeId)?.name} · {s.status} ·{' '}
                    {s.note}
                  </p>
                ))}
                {entry.season.definition.milestones.map((m) => (
                  <p key={m.id}>
                    {m.name}: {Math.min(m.target, entry.totals.completions)} / {m.target}
                  </p>
                ))}
                <ol>
                  {entry.progress.ledger.map((event) => (
                    <li key={event.id}>
                      {event.at.slice(0, 10)} · {event.delta > 0 ? '+' : ''}
                      {event.delta} XP · {event.reason}
                    </li>
                  ))}
                </ol>
              </details>
            </article>
          ))}
          <button
            disabled={busy}
            className="season-button"
            onClick={async () => {
              setBusy(true);
              try {
                const next = offset + 25;
                const data = await seasonRequest<{ seasons: SeasonView[] }>(`/api/v2/seasons?offset=${next}`);
                setViews((v) => [...v, ...data.seasons]);
                setOffset(next);
                if (!data.seasons.length) setMessage('You have reached the end of this history page.');
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Load older seasons
          </button>
        </>
      ) : (
        <>
          <header className={`season-hero season-theme-${presentation.theme}`}>
            <div className="season-hero-landscape" aria-hidden="true" />
            {presentation.artwork && (
              <Image
                src={artworkUrl(season.id, presentation.artwork.id)}
                alt={presentation.artwork.alt}
                fill
                sizes="100vw"
                className="season-hero-artwork"
                unoptimized
              />
            )}
            <div className="season-hero-copy">
              <span className="season-kicker">
                Community season {String(definition.number).padStart(2, '0')} / Free for every traveller
              </span>
              <h1>{definition.name}</h1>
              <p className="season-subtitle">{presentation.subtitle}</p>
              <p>{presentation.description}</p>
              <div className="season-hero-meta">
                <span>{preview ? 'Administrator preview' : seasonState(season, now)}</span>
                <span>
                  {remaining > 0 && !['ended', 'archived'].includes(seasonState(season, now))
                    ? `${Math.floor(remaining / 86400000)}d ${Math.floor(remaining / 3600000) % 24}h remaining`
                    : 'Season ended'}
                </span>
                <span>{definition.timezone}</span>
              </div>
            </div>
            <div className="season-level">
              <span className="season-kicker">Your level</span>
              <strong>{String(leveling.level).padStart(2, '0')}</strong>
              <span>{progress.xp.toLocaleString()} Season XP</span>
              <progress value={leveling.fraction} max="1" aria-label="Progress to next level" />
              <small>
                {leveling.next === null
                  ? 'Reward track complete'
                  : `${(leveling.next - progress.xp).toLocaleString()} XP to level ${leveling.level + 1}`}
              </small>
            </div>
          </header>
          {mode === 'pass' && (
            <section aria-labelledby="reward-track-title">
              <div className="season-section-heading">
                <div>
                  <span className="season-kicker">Your journey, your recognition</span>
                  <h2 id="reward-track-title">The reward track</h2>
                </div>
                <span>
                  All rewards are free · {progress.claims.length}/{rewards.length} claimed
                </span>
                <div className="season-actions">
                  <button
                    type="button"
                    className="season-button"
                    aria-controls={trackId}
                    aria-label="Previous rewards"
                    onClick={() =>
                      track.current?.scrollBy({
                        left: -(track.current.clientWidth * 0.8),
                        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                      })
                    }
                  >
                    ← Previous
                  </button>
                  <button
                    type="button"
                    className="season-button"
                    aria-controls={trackId}
                    aria-label="Next rewards"
                    onClick={() =>
                      track.current?.scrollBy({
                        left: track.current.clientWidth * 0.8,
                        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
                      })
                    }
                  >
                    Next →
                  </button>
                </div>
              </div>
              <div
                className="season-track"
                id={trackId}
                ref={track}
                tabIndex={0}
                role="region"
                aria-label="Reward track. Scroll horizontally to explore rewards."
              >
                {rewards.map((reward) => {
                  const claimed = progress.claims.some((v) => v.reward.id === reward.id);
                  const unlocked =
                    leveling.level >= reward.level &&
                    !['draft', 'preview', 'scheduled'].includes(seasonState(season, now));
                  return (
                    <button
                      key={reward.id}
                      className={`season-reward ${claimed ? 'is-claimed' : unlocked ? 'is-unlocked' : ''}`}
                      onClick={(event) => {
                        dialogTrigger.current = event.currentTarget;
                        setSelection(reward);
                      }}
                    >
                      <span className="season-reward-level">Level {String(reward.level).padStart(2, '0')}</span>
                      <RewardArt reward={reward} seasonId={season.id} />
                      <span className="season-kicker">{reward.kind}</span>
                      <strong>{reward.name}</strong>
                      <span className="season-reward-state">
                        {claimed ? '✓ Claimed' : unlocked ? 'Ready to claim' : 'Locked · Preview'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}
          <section aria-labelledby="season-challenges-title">
            <div className="season-section-heading">
              <div>
                <span className="season-kicker">Choose your path</span>
                <h2 id="season-challenges-title">
                  {mode === 'challenges' ? 'Challenge dispatch' : 'Active challenges'}
                </h2>
              </div>
              <Link href="/seasons/challenges">Browse challenges →</Link>
            </div>
            <p>Every path can reach the level cap. Solo challenges require no guild or group attendance.</p>
            <div className="season-filters">
              <label>
                Path
                <select aria-label="Path" value={filter} onChange={(e) => setFilter(e.target.value)}>
                  <option value="all">All paths</option>
                  {paths.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="all">All statuses</option>
                  <option value="available">Available</option>
                  <option value="pending">Pending review</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <label>
                Type
                <select aria-label="Type" value={cadence} onChange={(e) => setCadence(e.target.value)}>
                  <option value="all">All types</option>
                  {['daily', 'weekly', 'seasonal', 'once', 'event'].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="season-challenges">
              {filtered.map((c) => (
                <article className="season-challenge" key={c.id}>
                  <div className="season-section-heading">
                    <span className="season-kicker">
                      {c.path} / {c.cadence}
                    </span>
                    <strong>+{c.xp.toLocaleString()} XP</strong>
                  </div>
                  <h3>{c.name}</h3>
                  <p>{c.description}</p>
                  <div className="season-challenge-bottom">
                    <span>
                      {c.verification === 'review' ? 'Moderator-reviewed' : 'API-observed'} · {statusOf(c, view)}
                    </span>
                    <button
                      className="season-button"
                      disabled={
                        busy || !!preview || seasonState(season, now) !== 'active' || statusOf(c, view) !== 'available'
                      }
                      onClick={(event) => {
                        dialogTrigger.current = event.currentTarget;
                        return c.verification === 'review'
                          ? setChallenge(c)
                          : act({ action: 'verify', challengeId: c.id });
                      }}
                    >
                      {c.verification === 'review' ? 'Submit evidence' : 'Verify now'}
                    </button>
                  </div>
                  {progress.submissions
                    .filter((s) => s.challengeId === c.id)
                    .map((s) => (
                      <p key={s.id} className="season-review-note">
                        {s.status}
                        {s.note ? `: ${s.note}` : ''}
                      </p>
                    ))}
                </article>
              ))}
            </div>
            {!filtered.length && <p>No challenges match these filters.</p>}
          </section>
          <section>
            <div className="season-section-heading">
              <div>
                <span className="season-kicker">Together, beyond the horizon</span>
                <h2>Community milestones</h2>
              </div>
              <span>{totals.participants.toLocaleString()} participants</span>
            </div>
            {!preview && (
              <p className="season-live-status" aria-live="polite">
                {connection === 'stale'
                  ? 'Live progress delayed. Showing the last confirmed totals; reconnecting automatically.'
                  : connection === 'paused'
                    ? 'Live progress paused while this page is hidden.'
                    : connection === 'live'
                      ? 'Community progress is live · refreshes every 15 seconds.'
                      : 'Connecting to live community progress…'}
              </p>
            )}
            <div className="season-challenges">
              {definition.milestones.map((m) => (
                <article className="season-challenge" key={m.id}>
                  <span className="season-kicker" aria-live="polite">
                    {totals.completions >= m.target ? '✦ Shared achievement unlocked' : 'Community objective'}
                  </span>
                  <h3>{m.name}</h3>
                  {totals.milestones?.[m.id] && (
                    <p>Unlocked {new Date(totals.milestones[m.id]).toLocaleDateString()}</p>
                  )}
                  <p>{m.description}</p>
                  <progress max={m.target} value={Math.min(totals.completions, m.target)} aria-label={m.name} />
                  <p>
                    {totals.completions.toLocaleString()} / {m.target.toLocaleString()} approved challenges
                  </p>
                </article>
              ))}
            </div>
          </section>
          {progress.claims.length > 0 && (
            <section>
              <h2>Recently claimed</h2>
              <div className="season-cosmetics">
                {progress.claims
                  .slice(-5)
                  .reverse()
                  .map((c) => (
                    <button
                      key={c.reward.id}
                      onClick={(event) => {
                        dialogTrigger.current = event.currentTarget;
                        setSelection(c.reward);
                      }}
                    >
                      <RewardArt reward={c.reward} seasonId={season.id} />
                      <span>{c.reward.name}</span>
                    </button>
                  ))}
              </div>
            </section>
          )}
        </>
      )}
      {selection && (
        <div className="season-modal-backdrop">
          <SeasonDialog
            labelledBy="reward-preview-title"
            returnFocus={dialogTrigger}
            onClose={() => setSelection(null)}
          >
            <RewardArt reward={selection} seasonId={season.id} />
            <span className="season-kicker">
              Level {selection.level} / {selection.kind}
            </span>
            <h2 id="reward-preview-title">{selection.name}</h2>
            <p>{selection.description}</p>
            {selection.gameReward && (
              <p>
                Includes {gameRewardLabel(selection.gameReward)}. Claiming records eligibility; an administrator must
                separately review and execute delivery while your linked character is offline.
              </p>
            )}
            {selection.gameReward && view.deliveries?.find((v) => v.rewardId === selection.id) && (
              <p role="status">Game delivery: {view.deliveries.find((v) => v.rewardId === selection.id)?.status}</p>
            )}
            <div className="season-profile-preview">
              <span className="season-kicker">Profile preview</span>
              <strong>{selection.kind === 'title' ? selection.name : 'Desert Traveller'}</strong>
              <span>
                {selection.kind} · {selection.name}
              </span>
            </div>
            <div className="season-actions">
              <button autoFocus className="season-button" onClick={() => setSelection(null)}>
                Close preview
              </button>
              {selection.gameReward &&
                progress.claims.some((v) => v.reward.id === selection.id) &&
                !view.deliveries?.some((v) => v.rewardId === selection.id) && (
                  <button
                    className="season-button"
                    disabled={busy || !!preview}
                    onClick={() => act({ action: 'delivery-request', rewardId: selection.id })}
                  >
                    Request game delivery
                  </button>
                )}
              {progress.claims.some((v) => v.reward.id === selection.id) ? (
                <button
                  className="season-button"
                  disabled={busy || !!preview}
                  onClick={() => act({ action: 'equip', rewardId: selection.id })}
                >
                  Equip cosmetic
                </button>
              ) : (
                <button
                  className="season-button season-primary"
                  disabled={
                    busy ||
                    !!preview ||
                    leveling.level < selection.level ||
                    ['draft', 'preview', 'scheduled'].includes(seasonState(season, now))
                  }
                  onClick={() => act({ action: 'claim', rewardId: selection.id })}
                >
                  Confirm free claim
                </button>
              )}
            </div>
          </SeasonDialog>
        </div>
      )}
      {challenge && (
        <div className="season-modal-backdrop">
          <SeasonDialog labelledBy="evidence-title" returnFocus={dialogTrigger} onClose={() => setChallenge(null)}>
            <h2 id="evidence-title">{challenge.name}</h2>
            <p>
              Describe your contribution. A moderator must approve it before XP is awarded. Evidence links open
              separately; files are never fetched automatically.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void act({
                  action: 'submit',
                  requestId,
                  challengeId: challenge.id,
                  text,
                  links: links
                    .split('\n')
                    .map((v) => v.trim())
                    .filter(Boolean),
                });
              }}
            >
              <label>
                Description
                <textarea
                  autoFocus
                  required
                  minLength={10}
                  maxLength={2000}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
              </label>
              <label>
                HTTPS evidence links (up to 3, one per line)
                <textarea maxLength={1500} value={links} onChange={(e) => setLinks(e.target.value)} />
              </label>
              <div className="season-actions">
                <button type="button" className="season-button" onClick={() => setChallenge(null)}>
                  Cancel
                </button>
                <button className="season-button season-primary" disabled={busy}>
                  Submit for review
                </button>
              </div>
            </form>
          </SeasonDialog>
        </div>
      )}
    </div>
  );
}
