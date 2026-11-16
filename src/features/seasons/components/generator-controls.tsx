import { useState } from 'react';
import { Button } from '../../../components/ui/button';
import type { Season } from '../contracts';
import type { GeneratorView } from '../server/generator';
import { seasonRequest } from './season-pass';

export function GeneratorControls({
  initial,
  seasons,
  onRefresh,
}: {
  initial: GeneratorView;
  seasons: Season[];
  onRefresh: () => Promise<void>;
}) {
  const [status, setStatus] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [number, setNumber] = useState(() => Math.max(0, ...seasons.map((s) => s.definition.number)) + 1);
  const [start, setStart] = useState(() =>
    new Date(
      Math.ceil(
        Math.max(
          Date.now(),
          ...seasons.filter((s) => s.phase === 'published').map((s) => Date.parse(s.definition.endsAt)),
        ) / 60000,
      ) * 60000,
    )
      .toISOString()
      .slice(0, 16),
  );
  const [timezone, setTimezone] = useState(initial.settings?.timezone ?? 'UTC'),
    [template, setTemplate] = useState(''),
    [confirmation, setConfirmation] = useState('');
  async function action(payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    try {
      const result = await seasonRequest<{ generator: GeneratorView }>('/api/v2/admin/seasons', payload);
      setStatus(result.generator);
      setConfirmation('');
      await onRefresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="season-editor-card" aria-labelledby="season-automation-title">
      <div className="season-section-heading">
        <div>
          <span className="season-kicker">Automatic season engine · algorithm v{status.algorithm}</span>
          <h2 id="season-automation-title">Set it once. A new season every three months.</h2>
        </div>
        <strong>{status.enabled ? 'Automation enabled' : 'Automation paused'}</strong>
      </div>
      <p>
        Generates Season 1, Season 2 and onward with 100 free cosmetic levels. Publication, scheduling, verified XP,
        cosmetic claims and archiving are automatic. Progress reconciles while a signed-in member views the season and
        catches up when they return. Equipping cosmetics remains their choice.
      </p>
      <p>
        Every season starts with a fresh character-bound observation. Only later game XP increases or newly completed
        journey objectives count; existing levels and completed objectives earn no Season XP. XP-counter decreases and
        character swaps cannot reset tracking. Configured game rewards use separate reviewed delivery, never automatic
        approval.
      </p>
      {status.settings && (
        <p>
          Next number: {status.nextNumber} · First window: {status.settings.firstStart} · Three calendar months in UTC ·{' '}
          {status.settings.timezone} display calendar
        </p>
      )}
      {status.error && <p role="alert">Automation stopped: {status.error}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="season-actions">
        {status.revision && (
          <Button
            className="season-button"
            disabled={busy}
            onClick={() => action({ action: 'generator-state', revision: status.revision, enabled: !status.enabled })}
          >
            {status.enabled ? 'Pause automatic seasons' : 'Resume automatic seasons'}
          </Button>
        )}
        <Button
          className="season-button"
          disabled={busy || !status.enabled}
          onClick={() => action({ action: 'generator-run' })}
        >
          Reconcile automatic seasons now
        </Button>
        <Button
          className="season-button"
          disabled={busy}
          onClick={async () => {
            try {
              const data = await seasonRequest<{ generator: GeneratorView }>('/api/v2/admin/seasons');
              setStatus(data.generator);
            } catch (e) {
              setError(e.message);
            }
          }}
        >
          Refresh automation status
        </Button>
      </div>
      <fieldset disabled={busy || status.enabled}>
        <legend>Configure a new automatic sequence</legend>
        <p>
          Existing published seasons are preserved. Start after the latest scheduled season. Reconfiguration starts a
          new sequence; previous drafts and history remain available.
        </p>
        <div className="season-editor-grid">
          <label>
            First season number
            <input
              type="number"
              min="1"
              max="99999"
              value={number}
              onChange={(e) => setNumber(Number(e.target.value))}
            />
          </label>
          <label>
            First season start (UTC)
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label>
            Season calendar timezone
            <input value={timezone} maxLength={80} onChange={(e) => setTimezone(e.target.value)} />
          </label>
          <label>
            Automatic objective template
            <select value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">Default: new game XP or journey progress</option>
              {seasons.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.definition.name} (requires 100 levels and API-only objectives)
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Type ENABLE AUTOMATIC SEASONS
          <input value={confirmation} onChange={(e) => setConfirmation(e.target.value)} autoComplete="off" />
        </label>
        <Button
          className="season-button"
          disabled={confirmation !== 'ENABLE AUTOMATIC SEASONS' || !start || !timezone}
          onClick={() => {
            try {
              void action({
                action: 'generator-configure',
                revision: status.revision,
                settings: { firstNumber: number, firstStart: new Date(`${start}Z`).toISOString(), timezone },
                ...(template ? { templateSeasonId: template } : {}),
                confirmation,
              });
            } catch {
              setError('Choose a valid first season start.');
            }
          }}
        >
          Enable automatic seasons
        </Button>
      </fieldset>
    </section>
  );
}
