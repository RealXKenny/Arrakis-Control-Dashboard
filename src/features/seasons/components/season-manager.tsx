'use client';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';

import { useEffect, useState } from 'react';
import {
  type Season,
  type Definition,
  type Submission,
  type Totals,
  type Reward,
  type Challenge,
  type Delivery,
  type Progress,
  type PresentationChange,
  paths,
  cosmeticKinds,
  seasonState,
  publicationProblems,
  objectiveCategories,
} from '../contracts';
import { categoryLabels } from '../catalog';
import { CatalogTools } from './catalog-tools';
import { GeneratorControls } from './generator-controls';
import type { GeneratorView } from '../server/generator';
import { seasonRequest, SeasonPass } from './season-pass';
import { RewardArt } from './reward-art';
import { ArtworkUpload } from './artwork-upload';
import { LivePresentationEditor } from './live-presentation-editor';
import { GameRewardFields } from './game-reward-fields';
import { DeliveryManager } from './delivery-manager';

export function SeasonManager() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [generator, setGenerator] = useState<GeneratorView | null>(null);
  const [season, setSeason] = useState<Season | null>(null);
  const [definition, setDefinition] = useState<Definition | null>(null);
  const [template, setTemplate] = useState<Definition | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [audit, setAudit] = useState<Record<string, unknown>[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const [thresholds, setThresholds] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [deliveryEnabled, setDeliveryEnabled] = useState(false);
  const [seasonOffset, setSeasonOffset] = useState(0);
  const [reviewOffset, setReviewOffset] = useState(0);
  const [inspected, setInspected] = useState<Progress | null>(null);
  const [correctionId, setCorrectionId] = useState(() => crypto.randomUUID());
  const [snapshot, setSnapshot] = useState<PresentationChange | null>(null);
  useEffect(() => {
    let live = true;
    seasonRequest<{ seasons: Season[]; template: Definition; generator: GeneratorView }>('/api/v2/admin/seasons')
      .then((data) => {
        if (live) {
          setSeasons(data.seasons);
          setTemplate(data.template);
          setGenerator(data.generator);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  function open(next: Season) {
    setInspected(null);
    setSnapshot(null);
    setSeason(next);
    setDefinition(structuredClone(next.definition));
    setThresholds(next.definition.thresholds.join(', '));
    setPreview(false);
    setError('');
  }
  async function records(id: string, offset = 0) {
    const data = await seasonRequest<{
      submissions: Submission[];
      audit: Record<string, unknown>[];
      totals: Totals | null;
      deliveries: Delivery[];
      deliveryEnabled: boolean;
    }>(`/api/v2/admin/seasons?season=${id}&offset=${offset}`);
    setSubmissions(data.submissions);
    setAudit(data.audit);
    setTotals(data.totals);
    setDeliveries(data.deliveries);
    setDeliveryEnabled(data.deliveryEnabled);
    setReviewOffset(offset);
  }
  async function select(next: Season) {
    if (definition && !window.confirm('Discard unsaved edits and open this season?')) return;
    open(next);
    try {
      await records(next.id);
    } catch (e) {
      setError(e.message);
    }
  }
  async function mutate(payload: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await seasonRequest<{ season?: Season }>('/api/v2/admin/seasons', payload);
      if (payload.action === 'correct') setCorrectionId(crypto.randomUUID());
      if (result.season) {
        open(result.season);
        setSeasons((v) => [result.season!, ...v.filter((s) => s.id !== result.season!.id)]);
      }
      if (payload.seasonId) await records(String(result.season?.id ?? payload.seasonId));
      setMessage('Season operation saved.');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function update<K extends keyof Definition>(key: K, value: Definition[K]) {
    setDefinition((v) => (v ? { ...v, [key]: value } : v));
  }
  const editable = season && ['draft', 'preview'].includes(season.phase);
  const button = 'season-button';
  function transition(action: string) {
    if (!season) return;
    const confirmation = window.prompt(
      `This ${action} operation is audited. Published definitions cannot be edited. Type the saved season name to confirm: ${season.definition.name}`,
    );
    if (confirmation !== null)
      void mutate({
        action: 'transition',
        seasonId: season.id,
        revision: season.revision,
        transition: action,
        confirmation,
      });
  }
  return (
    <div className="season-root">
      <p>
        Free community progression. Published tracks are frozen; duplicate a season to prepare the next chapter. All
        writes require a recent administrator sign-in.
      </p>
      {error && (
        <p role="alert" className="season-notice">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="season-notice">
          {message}
        </p>
      )}
      <div className="season-actions">
        <Button
          className={button}
          disabled={!template || busy}
          onClick={() => {
            if (template) {
              const next = structuredClone(template);
              next.slug = `season-${crypto.randomUUID().slice(0, 8)}`;
              next.number = Math.max(0, ...seasons.map((v) => v.definition.number)) + 1;
              open({
                id: crypto.randomUUID(),
                revision: '',
                phase: 'draft',
                definition: next,
                createdAt: new Date().toISOString(),
              });
              setSubmissions([]);
              setAudit([]);
              setTotals(null);
            }
          }}
        >
          Create season
        </Button>
        <Button
          className={button}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const offset = seasonOffset + 25;
              const data = await seasonRequest<{ seasons: Season[] }>(`/api/v2/admin/seasons?offset=${offset}`);
              setSeasons((v) => [...v, ...data.seasons.filter((s) => !v.some((existing) => existing.id === s.id))]);
              setSeasonOffset(offset);
              if (!data.seasons.length) setMessage('No older seasons on this page.');
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          Load older season definitions
        </Button>
      </div>
      {generator && (
        <GeneratorControls
          initial={generator}
          seasons={seasons}
          onRefresh={async () => {
            const data = await seasonRequest<{ seasons: Season[] }>('/api/v2/admin/seasons');
            setSeasons(data.seasons);
          }}
        />
      )}
      <div className="season-editor-grid">
        {seasons.map((s) => (
          <Button
            data-season-id={s.id}
            className="season-editor-card"
            key={s.id}
            disabled={busy}
            onClick={() => select(s)}
          >
            <span className="season-kicker">
              Season {s.definition.number} / {seasonState(s)}
            </span>
            <strong>{s.definition.name}</strong>
            <span>
              {s.definition.startsAt.slice(0, 10)} → {s.definition.endsAt.slice(0, 10)}
            </span>
          </Button>
        ))}
      </div>
      {season && definition && (
        <>
          {['active', 'scheduled'].includes(seasonState(season)) && (
            <LivePresentationEditor
              key={season.revision}
              season={season}
              busy={busy}
              onSave={(presentation, reason, confirmation) =>
                mutate({
                  action: 'presentation',
                  seasonId: season.id,
                  revision: season.revision,
                  presentation,
                  reason,
                  confirmation,
                })
              }
            />
          )}
          <div className="season-section-heading">
            <div>
              <span className="season-kicker">Season builder / schema v{definition.schemaVersion}</span>
              <h2>{definition.name}</h2>
            </div>
            <div className="season-actions">
              <Button className={button} onClick={() => setPreview((v) => !v)}>
                {preview ? 'Return to editor' : 'Preview season'}
              </Button>
              {season.revision && (
                <Button
                  className={button}
                  disabled={busy}
                  onClick={() => mutate({ action: 'duplicate', seasonId: season.id })}
                >
                  Use as template
                </Button>
              )}
            </div>
          </div>
          <CatalogTools
            key={season.id + season.revision}
            definition={definition}
            editable={editable && !busy}
            onImport={(next) => {
              setDefinition(next);
              setThresholds(next.thresholds.join(', '));
              setError('');
            }}
          />
          {preview ? (
            <SeasonPass key={season.id + JSON.stringify(definition)} preview={{ ...season, definition }} />
          ) : (
            <>
              <fieldset disabled={!editable || busy} className="season-editor-card">
                <legend>Season identity & schedule</legend>
                <div className="season-editor-grid">
                  {(['name', 'slug', 'subtitle', 'timezone'] as const).map((key) => (
                    <label key={key}>
                      {key}
                      <input
                        value={definition[key]}
                        maxLength={key === 'subtitle' ? 160 : key === 'name' ? 100 : 80}
                        onChange={(e) => update(key, e.target.value)}
                      />
                    </label>
                  ))}
                  <label>
                    Season number
                    <input
                      type="number"
                      min="1"
                      max="100000"
                      value={definition.number}
                      onChange={(e) => update('number', Number(e.target.value))}
                    />
                  </label>
                  <label>
                    Artwork & theme
                    <select
                      value={definition.theme}
                      onChange={(e) => update('theme', e.target.value as Definition['theme'])}
                    >
                      {['dunes', 'eclipse', 'spice'].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  {(['startsAt', 'endsAt'] as const).map((key) => (
                    <label key={key}>
                      {key === 'startsAt' ? 'Starts at (UTC)' : 'Ends at (UTC)'}
                      <input
                        type="datetime-local"
                        value={definition[key].slice(0, 16)}
                        onChange={(e) => {
                          if (e.target.value) update(key, `${e.target.value}:00.000Z`);
                        }}
                      />
                    </label>
                  ))}
                  <ArtworkUpload
                    key={`${season.id}:${season.revision}:hero`}
                    seasonId={season.id}
                    revision={season.revision}
                    label="Season hero artwork"
                    value={definition.artwork}
                    onChange={(artwork) => update('artwork', artwork)}
                  />
                </div>
                <label>
                  Description
                  <textarea
                    value={definition.description}
                    maxLength={3000}
                    onChange={(e) => update('description', e.target.value)}
                  />
                </label>
                <label>
                  Level XP thresholds (start with 0, comma separated)
                  <input
                    value={thresholds}
                    onChange={(e) => {
                      setThresholds(e.target.value);
                      const parsed = e.target.value.split(',').map((v) => Number(v.trim()));
                      if (parsed.every(Number.isFinite)) update('thresholds', parsed);
                    }}
                  />
                </label>
              </fieldset>
              <fieldset disabled={!editable || busy}>
                <legend>
                  <h2>Visual reward track editor</h2>
                </legend>
                <p>
                  Add, reorder and preview permanent dashboard cosmetics. Unlock requirements are published with the
                  track.
                </p>
                <div className="season-editor-grid">
                  {definition.rewards.map((r, i) => {
                    const change = (patch: Partial<Reward>) =>
                      update(
                        'rewards',
                        definition.rewards.map((v, index) => (index === i ? { ...v, ...patch } : v)),
                      );
                    return (
                      <Card className="season-editor-card" key={r.id}>
                        <RewardArt reward={r} seasonId={season.id} />
                        <ArtworkUpload
                          key={`${season.id}:${season.revision}:${r.id}`}
                          seasonId={season.id}
                          revision={season.revision}
                          label={`Reward artwork: ${r.name}`}
                          value={r.artwork}
                          onChange={(artwork) => change({ artwork })}
                        />
                        <label>
                          Name
                          <input value={r.name} maxLength={100} onChange={(e) => change({ name: e.target.value })} />
                        </label>
                        <label>
                          Description
                          <textarea
                            value={r.description}
                            maxLength={600}
                            onChange={(e) => change({ description: e.target.value })}
                          />
                        </label>
                        <label>
                          Required level
                          <input
                            type="number"
                            min="1"
                            max="100"
                            value={r.level}
                            onChange={(e) => change({ level: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          Cosmetic type
                          <select value={r.kind} onChange={(e) => change({ kind: e.target.value as Reward['kind'] })}>
                            {cosmeticKinds.map((k) => (
                              <option key={k}>{k}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Artwork
                          <select
                            value={r.motif}
                            onChange={(e) => change({ motif: e.target.value as Reward['motif'] })}
                          >
                            {['dune', 'sun', 'spire', 'star', 'wing'].map((k) => (
                              <option key={k}>{k}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Accent
                          <select
                            value={r.color}
                            onChange={(e) => change({ color: e.target.value as Reward['color'] })}
                          >
                            {['sand', 'spice', 'blue'].map((k) => (
                              <option key={k}>{k}</option>
                            ))}
                          </select>
                        </label>
                        <GameRewardFields value={r.gameReward} onChange={(gameReward) => change({ gameReward })} />
                        <div className="season-actions">
                          <Button
                            className={button}
                            disabled={i === 0}
                            onClick={() => {
                              const list = [...definition.rewards];
                              [list[i - 1], list[i]] = [list[i], list[i - 1]];
                              update('rewards', list);
                            }}
                          >
                            Move earlier
                          </Button>
                          <Button
                            className={button}
                            onClick={() =>
                              update(
                                'rewards',
                                definition.rewards.filter((v) => v.id !== r.id),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
                <Button
                  className={button}
                  onClick={() =>
                    update('rewards', [
                      ...definition.rewards,
                      {
                        id: crypto.randomUUID(),
                        name: 'New recognition',
                        description: 'A permanent community cosmetic.',
                        level: 1,
                        kind: 'badge',
                        motif: 'star',
                        color: 'sand',
                      },
                    ])
                  }
                >
                  Add reward
                </Button>
              </fieldset>
              <fieldset disabled={!editable || busy}>
                <legend>
                  <h2>Challenge builder</h2>
                </legend>
                <p>
                  Daily and weekly limits are per local calendar period. Linked characters, character levels and exact
                  completed journey nodes support API verification. Other game actions require moderator review.
                </p>
                <div className="season-editor-grid">
                  {definition.challenges.map((c, i) => {
                    const change = (patch: Partial<Challenge>) =>
                      update(
                        'challenges',
                        definition.challenges.map((v, index) => (index === i ? { ...v, ...patch } : v)),
                      );
                    return (
                      <Card key={c.id} className="season-editor-card">
                        <label>
                          Name
                          <input value={c.name} maxLength={100} onChange={(e) => change({ name: e.target.value })} />
                        </label>
                        <label>
                          Objective and evidence rules
                          <textarea
                            value={c.description}
                            maxLength={1200}
                            onChange={(e) => change({ description: e.target.value })}
                          />
                        </label>
                        <label>
                          Path
                          <select
                            value={c.path}
                            onChange={(e) => change({ path: e.target.value as Challenge['path'] })}
                          >
                            {paths.map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Category
                          <select
                            value={c.category ?? ''}
                            onChange={(e) =>
                              change({
                                category: e.target.value ? (e.target.value as Challenge['category']) : undefined,
                              })
                            }
                          >
                            <option value="">Automatic from verification</option>
                            {objectiveCategories.map((v) => (
                              <option key={v} value={v}>
                                {categoryLabels[v]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Type
                          <select
                            value={c.cadence}
                            disabled={c.verification !== 'review'}
                            onChange={(e) => change({ cadence: e.target.value as Challenge['cadence'] })}
                          >
                            {['daily', 'weekly', 'seasonal', 'once', 'event'].map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Verification
                          <select
                            value={c.verification}
                            onChange={(e) => {
                              const verification = e.target.value as Challenge['verification'];
                              change({
                                verification,
                                minimumLevel: verification === 'character-level' ? 10 : undefined,
                                journeyNode: verification === 'journey-node' ? '' : undefined,
                                minimumGameXp: verification === 'season-progress' ? 1000 : undefined,
                                minimumNewJourneys: verification === 'season-progress' ? 1 : undefined,
                                ...(verification !== 'review' ? { cadence: 'once', limit: 1 } : {}),
                              });
                            }}
                          >
                            <option value="review">Moderator-reviewed</option>
                            {c.verification === 'linked-character' && (
                              <option value="linked-character">Legacy link-only (cannot be published)</option>
                            )}
                            <option value="character-level">API: character level (one-time)</option>
                            <option value="journey-node">API: journey node (one-time)</option>
                            <option value="season-progress">API: new seasonal game XP or journeys</option>
                          </select>
                        </label>
                        {c.verification === 'character-level' && (
                          <label>
                            Required character level
                            <input
                              type="number"
                              min="1"
                              max="1000"
                              value={c.minimumLevel ?? 1}
                              onChange={(e) => change({ minimumLevel: Number(e.target.value) })}
                            />
                          </label>
                        )}
                        {c.verification === 'season-progress' && (
                          <>
                            <label>
                              New game XP target
                              <input
                                type="number"
                                min="1"
                                max="10000000"
                                value={c.minimumGameXp ?? 1000}
                                onChange={(e) => change({ minimumGameXp: Number(e.target.value) })}
                              />
                            </label>
                            <label>
                              Alternative new journey target
                              <input
                                type="number"
                                min="1"
                                max="5000"
                                value={c.minimumNewJourneys ?? 1}
                                onChange={(e) => change({ minimumNewJourneys: Number(e.target.value) })}
                              />
                            </label>
                          </>
                        )}
                        {c.verification === 'journey-node' && (
                          <label>
                            Exact journey node ID
                            <input
                              maxLength={200}
                              value={c.journeyNode ?? ''}
                              onChange={(e) => change({ journeyNode: e.target.value })}
                            />
                            <small>
                              Copy the canonical node ID from verified Console data, never a translated display name.
                            </small>
                          </label>
                        )}
                        <label>
                          XP award
                          <input
                            type="number"
                            min="1"
                            max="100000"
                            value={c.xp}
                            onChange={(e) => change({ xp: Number(e.target.value) })}
                          />
                        </label>
                        <label>
                          Completions per period
                          <input
                            type="number"
                            min="1"
                            max="20"
                            value={c.limit}
                            disabled={c.verification !== 'review'}
                            onChange={(e) => change({ limit: Number(e.target.value) })}
                          />
                        </label>
                        <Button
                          className={button}
                          onClick={() =>
                            update(
                              'challenges',
                              definition.challenges.filter((v) => v.id !== c.id),
                            )
                          }
                        >
                          Remove challenge
                        </Button>
                      </Card>
                    );
                  })}
                </div>
                <Button
                  className={button}
                  onClick={() =>
                    update('challenges', [
                      ...definition.challenges,
                      {
                        id: crypto.randomUUID(),
                        name: 'New challenge',
                        description: 'Describe the objective and accepted evidence.',
                        path: 'solo',
                        cadence: 'once',
                        verification: 'review',
                        xp: 100,
                        limit: 1,
                      },
                    ])
                  }
                >
                  Add challenge
                </Button>
              </fieldset>
              <fieldset disabled={!editable || busy}>
                <legend>
                  <h2>Community milestones</h2>
                </legend>
                <div className="season-editor-grid">
                  {definition.milestones.map((m, i) => (
                    <Card key={m.id} className="season-editor-card">
                      <label>
                        Name
                        <input
                          value={m.name}
                          maxLength={100}
                          onChange={(e) =>
                            update(
                              'milestones',
                              definition.milestones.map((v, n) => (n === i ? { ...v, name: e.target.value } : v)),
                            )
                          }
                        />
                      </label>
                      <label>
                        Description
                        <textarea
                          value={m.description}
                          maxLength={600}
                          onChange={(e) =>
                            update(
                              'milestones',
                              definition.milestones.map((v, n) =>
                                n === i ? { ...v, description: e.target.value } : v,
                              ),
                            )
                          }
                        />
                      </label>
                      <label>
                        Approved challenge target
                        <input
                          type="number"
                          min="1"
                          max="100000000"
                          value={m.target}
                          onChange={(e) =>
                            update(
                              'milestones',
                              definition.milestones.map((v, n) =>
                                n === i ? { ...v, target: Number(e.target.value) } : v,
                              ),
                            )
                          }
                        />
                      </label>
                      <Button
                        className={button}
                        onClick={() =>
                          update(
                            'milestones',
                            definition.milestones.filter((v) => v.id !== m.id),
                          )
                        }
                      >
                        Remove milestone
                      </Button>
                    </Card>
                  ))}
                </div>
                <Button
                  className={button}
                  onClick={() =>
                    update('milestones', [
                      ...definition.milestones,
                      {
                        id: crypto.randomUUID(),
                        name: 'Shared horizon',
                        description: 'Complete challenges together.',
                        target: 100,
                      },
                    ])
                  }
                >
                  Add milestone
                </Button>
              </fieldset>
              <div className="season-actions">
                {editable && (
                  <>
                    <Button
                      className={`${button} season-primary`}
                      disabled={busy}
                      onClick={() =>
                        mutate({ action: 'save', seasonId: season.id, revision: season.revision, definition })
                      }
                    >
                      Save draft
                    </Button>
                    <Button className={button} onClick={() => open(season)}>
                      Discard unsaved edits
                    </Button>
                  </>
                )}
                {season.revision && (
                  <>
                    {season.phase === 'draft' && (
                      <Button className={button} disabled={busy} onClick={() => transition('preview')}>
                        Move to preview
                      </Button>
                    )}
                    {season.phase === 'preview' && (
                      <Button className={button} disabled={busy} onClick={() => transition('draft')}>
                        Return to draft
                      </Button>
                    )}
                    {editable && (
                      <Button className={button} disabled={busy} onClick={() => transition('publish')}>
                        Publish saved season
                      </Button>
                    )}
                    {['active', 'scheduled'].includes(seasonState(season)) && (
                      <Button className={button} disabled={busy} onClick={() => transition('end')}>
                        End season
                      </Button>
                    )}
                    {seasonState(season) === 'ended' && (
                      <Button className={button} disabled={busy} onClick={() => transition('archive')}>
                        Archive season
                      </Button>
                    )}
                  </>
                )}
              </div>
              {editable && (
                <details>
                  <summary>Publication safeguards</summary>
                  <p>
                    Every path must independently reach the cap, with XP opportunities within 10%. IDs, dates, reward
                    levels and recurrence limits are validated on the server.
                  </p>
                  <Button
                    className={button}
                    onClick={() => {
                      try {
                        const issues = publicationProblems(definition);
                        setMessage(
                          issues.length
                            ? issues.join(' ')
                            : 'Path opportunities meet publication fairness checks. Full schema and schedule validation runs on publication.',
                        );
                      } catch {
                        setError('Correct the season dates and configuration first.');
                      }
                    }}
                  >
                    Check path fairness
                  </Button>
                </details>
              )}
            </>
          )}
          {season.revision && (
            <>
              <section>
                <h2>Progression analytics</h2>
                <p>
                  {totals?.participants ?? 0} participants · {totals?.completions ?? 0} approved challenges ·{' '}
                  {totals?.xp ?? 0} total XP · {totals?.claims ?? 0} claims
                </p>
                <div className="season-editor-grid">
                  <Card className="season-editor-card">
                    <h3>Level distribution</h3>
                    {definition.thresholds.map((_, i) => (
                      <p key={i}>
                        Level {i + 1}: {totals?.levels?.[String(i + 1)] ?? 0} members
                      </p>
                    ))}
                  </Card>
                  <Card className="season-editor-card">
                    <h3>Challenge completion</h3>
                    {definition.challenges.map((c) => (
                      <p key={c.id}>
                        {c.name}: {totals?.challenges?.[c.id] ?? 0}
                      </p>
                    ))}
                  </Card>
                  <Card className="season-editor-card">
                    <h3>Reward claims</h3>
                    {definition.rewards.map((r) => (
                      <p key={r.id}>
                        {r.name}: {totals?.rewards?.[r.id] ?? 0}
                      </p>
                    ))}
                  </Card>
                </div>
                <form
                  className="season-actions"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const account = String(new FormData(event.currentTarget).get('owner'));
                    seasonRequest<{ member: Progress }>(
                      `/api/v2/admin/seasons?season=${season.id}&owner=${encodeURIComponent(account)}`,
                    )
                      .then((data) => setInspected(data.member))
                      .catch((e) => setError(e.message));
                  }}
                >
                  <label>
                    Inspect account progression and claims
                    <input name="owner" required pattern="[a-zA-Z0-9_-]{1,80}" />
                  </label>
                  <Button className={button}>Inspect account</Button>
                </form>
                {inspected && (
                  <details open>
                    <summary>Inspected account: {inspected.xp} Season XP</summary>
                    {inspected.claims.map((claim) => (
                      <p key={claim.reward.id}>
                        {claim.reward.name} · claimed {claim.at}
                      </p>
                    ))}
                    {inspected.ledger.map((entry) => (
                      <p key={entry.id}>
                        {entry.at} · {entry.delta} XP · {entry.reason}
                      </p>
                    ))}
                  </details>
                )}
              </section>
              <section>
                <h2>Evidence review</h2>
                <Button className={button} onClick={() => records(season.id).catch((e) => setError(e.message))}>
                  Refresh review queue
                </Button>
                <Button
                  className={button}
                  disabled={busy}
                  onClick={() => records(season.id, reviewOffset + 50).catch((e) => setError(e.message))}
                >
                  Next review page
                </Button>
                <div className="season-challenges">
                  {submissions.map((s) => (
                    <Card key={s.id} className="season-editor-card">
                      <span className="season-kicker">
                        {s.owner} / {s.submittedAt.slice(0, 10)}
                      </span>
                      <h3>{definition.challenges.find((c) => c.id === s.challengeId)?.name}</h3>
                      <p>{s.text}</p>
                      {s.links.map((link) => (
                        <a key={link} href={link} target="_blank" rel="noopener noreferrer nofollow">
                          Open evidence link
                        </a>
                      ))}
                      <label>
                        Reviewer notes / rejection reason
                        <textarea
                          minLength={3}
                          maxLength={1000}
                          value={notes[s.id] ?? ''}
                          onChange={(e) => setNotes((v) => ({ ...v, [s.id]: e.target.value }))}
                        />
                      </label>
                      <div className="season-actions">
                        {[true, false].map((approve) => (
                          <Button
                            className={button}
                            key={String(approve)}
                            disabled={busy || (notes[s.id]?.trim().length ?? 0) < 3}
                            onClick={() =>
                              mutate({
                                action: 'review',
                                seasonId: season.id,
                                owner: s.owner,
                                submissionId: s.id,
                                approve,
                                note: notes[s.id],
                              })
                            }
                          >
                            {approve ? 'Approve & award XP' : 'Reject'}
                          </Button>
                        ))}
                      </div>
                    </Card>
                  ))}
                </div>
                {!submissions.length && <p>No pending submissions on this page.</p>}
              </section>
              <section>
                <h2>Audited XP correction</h2>
                <p>Corrections append new events. Claimed cosmetics remain owned; corrections never rewrite history.</p>
                <form
                  className="season-editor-grid"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = new FormData(e.currentTarget);
                    if (!window.confirm('Append this XP correction to the permanent ledger?')) return;
                    void mutate({
                      action: 'correct',
                      seasonId: season.id,
                      owner: form.get('owner'),
                      delta: Number(form.get('delta')),
                      reason: form.get('reason'),
                      operationId: correctionId,
                    });
                  }}
                >
                  <label>
                    Dashboard account ID
                    <input name="owner" required pattern="[a-zA-Z0-9_-]{1,80}" />
                  </label>
                  <label>
                    XP change
                    <input name="delta" type="number" required min="-100000" max="100000" />
                  </label>
                  <label>
                    Reason
                    <input name="reason" required minLength={10} maxLength={500} />
                  </label>
                  <Button className={button} disabled={busy}>
                    Append correction
                  </Button>
                </form>
              </section>
              <DeliveryManager
                key={season.id}
                season={season}
                deliveries={deliveries}
                enabled={deliveryEnabled}
                busy={busy}
                mutate={mutate}
              />
              <details>
                <summary>Permanent season audit (latest 100 operations)</summary>
                <ol>
                  {audit.map((event, i) => (
                    <li key={String(event.id ?? i)}>
                      {String(event.at)} · {String(event.action)} · {String(event.actor)}
                      {event.reason ? ` · ${String(event.reason)}` : ''}
                      {typeof event.snapshotId === 'string' && (
                        <Button
                          type="button"
                          className="season-button"
                          onClick={() =>
                            seasonRequest<{ snapshot: PresentationChange }>(
                              `/api/v2/admin/seasons?season=${season.id}&snapshot=${event.snapshotId}`,
                            )
                              .then((data) => setSnapshot(data.snapshot))
                              .catch((e) => setError(e.message))
                          }
                        >
                          Inspect presentation change
                        </Button>
                      )}
                    </li>
                  ))}
                </ol>
                {snapshot && (
                  <div className="season-editor-card">
                    <h3>Presentation change</h3>
                    <p>
                      {snapshot.at} · {snapshot.reason}
                    </p>
                    <dl>
                      {(['subtitle', 'description', 'theme'] as const).map((field) => (
                        <div key={field}>
                          <dt>{field}</dt>
                          <dd>Before: {snapshot.before[field]}</dd>
                          <dd>After: {snapshot.after[field]}</dd>
                        </div>
                      ))}
                      <div>
                        <dt>Artwork</dt>
                        <dd>Before: {snapshot.before.artwork?.alt ?? 'Theme artwork'}</dd>
                        <dd>After: {snapshot.after.artwork?.alt ?? 'Theme artwork'}</dd>
                      </div>
                    </dl>
                  </div>
                )}
              </details>
            </>
          )}
        </>
      )}
    </div>
  );
}
