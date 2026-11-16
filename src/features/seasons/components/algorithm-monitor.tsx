'use client';
import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/button';
import { Card } from '../../../components/ui/card';
import { rewardComponents, type Season } from '../contracts';
import { ASSIGNMENT_ALGORITHM } from '../engine/assignment';
import { ECONOMY_ALGORITHM, POLICY } from '../engine/economy';
import { REPRESENTATIVE_PROFILES, simulateSeason } from '../engine/simulation';
import { themeForSeason } from '../engine/themes';

export type ClaimAttention = { owner: string; rewardId: string; since: string };
/** Read-only view of the generation engine plus the reconciliation queue. All numbers derive from stored records. */
export function AlgorithmMonitor({
  season,
  attention,
  busy,
  mutate,
}: {
  season: Season;
  attention: ClaimAttention[];
  busy: boolean;
  mutate(payload: Record<string, unknown>): Promise<void>;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [confirmations, setConfirmations] = useState<Record<string, string>>({});
  const definition = season.definition;
  const report = useMemo(() => simulateSeason(definition, REPRESENTATIVE_PROFILES), [definition]);
  const theme = themeForSeason(definition.number);
  const next = themeForSeason(definition.number + 1);
  const counts = useMemo(() => {
    const out = { personalized: 0, categories: {} as Record<string, number> };
    for (const c of definition.challenges) {
      if (c.personalized) out.personalized++;
      out.categories[c.category ?? 'uncategorized'] = (out.categories[c.category ?? 'uncategorized'] ?? 0) + 1;
    }
    return out;
  }, [definition]);
  const bundles = definition.rewards.filter((r) => rewardComponents(r).length > 0).length;
  const button = 'season-button';
  return (
    <section aria-label="Intelligent season engine">
      <h2>Intelligent season engine</h2>
      <p>
        Assignment algorithm v{ASSIGNMENT_ALGORITHM} · reward economy v{ECONOMY_ALGORITHM} · deterministic, no external
        AI. Published seasons are never rewritten when the algorithm changes.
      </p>
      <Card className="season-editor-card">
        <strong>
          Season {definition.number}: {theme.title}
        </strong>
        <p>
          Next theme: {next.title}. {counts.personalized} of {definition.challenges.length} objectives are personalized;{' '}
          {bundles} of {definition.rewards.length} levels carry in-game rewards.
        </p>
        {definition.economy ? (
          <ul>
            <li>
              Economy: {definition.economy.totalPoints} of {POLICY.totalPoints} value points · Solaris{' '}
              {definition.economy.solaris.toLocaleString('en-US')} / {POLICY.maxSolaris.toLocaleString('en-US')} · House
              Credits {definition.economy.houseCredits.toLocaleString('en-US')} /{' '}
              {POLICY.maxHouseCredits.toLocaleString('en-US')}
            </li>
            <li>
              {definition.economy.catalogItems} eligible catalog items (hash{' '}
              {definition.economy.catalogHash.slice(0, 12)})
            </li>
            {definition.economy.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        ) : (
          <p>This season has no in-game reward economy (cosmetics only).</p>
        )}
      </Card>
      <Card className="season-editor-card">
        <strong>Simulation across representative characters (no real players, no game writes)</strong>
        <div style={{ overflowX: 'auto', maxWidth: '100%' }} role="region" aria-label="Simulation results" tabIndex={0}>
          <table>
            <caption className="season-kicker">Objectives per character level</caption>
            <thead>
              <tr>
                <th scope="col">Character</th>
                <th scope="col">Tier</th>
                <th scope="col">Assigned</th>
                <th scope="col">Unsupported</th>
                <th scope="col">Best path reaches</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.name}>
                  <th scope="row">{row.name}</th>
                  <td>{row.tier}</td>
                  <td>{row.objectives}</td>
                  <td>{row.unsupported}</td>
                  <td>Level {Math.max(...Object.values(row.reachableLevel))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {report.findings.length > 0 ? (
          <ul aria-label="Simulation findings">
            {report.findings.map((finding) => (
              <li key={finding}>{finding}</li>
            ))}
          </ul>
        ) : (
          <p>No fairness or capability problems found.</p>
        )}
      </Card>
      <Card className="season-editor-card">
        <strong>Delivery reconciliation</strong>
        {attention.length === 0 ? (
          <p>No deliveries need verification.</p>
        ) : (
          attention.map((item) => {
            const key = `${item.owner}:${item.rewardId}`;
            return (
              <form
                key={key}
                className="season-editor-grid"
                onSubmit={(event) => {
                  event.preventDefault();
                  const applied = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value') === 'applied';
                  void mutate({
                    action: 'claim-resolve',
                    seasonId: season.id,
                    owner: item.owner,
                    rewardId: item.rewardId,
                    index: Number(new FormData(event.currentTarget).get('index')),
                    applied,
                    note: notes[key] ?? '',
                    confirmation: confirmations[key] ?? '',
                  });
                }}
              >
                <p>
                  Account {item.owner} · reward {item.rewardId} · since {item.since}. Check the Console audit and the
                  character&apos;s records before choosing; nothing is resent.
                </p>
                <label>
                  Component number (0 is the first)
                  <input name="index" type="number" min={0} max={3} defaultValue={0} required />
                </label>
                <label>
                  Verification note
                  <input
                    required
                    minLength={10}
                    maxLength={1000}
                    value={notes[key] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [key]: e.target.value })}
                  />
                </label>
                <label>
                  Type the season name to confirm
                  <input
                    required
                    value={confirmations[key] ?? ''}
                    onChange={(e) => setConfirmations({ ...confirmations, [key]: e.target.value })}
                  />
                </label>
                <Button className={button} disabled={busy} type="submit" value="applied">
                  Verified: delivered
                </Button>
                <Button className={button} disabled={busy} type="submit" value="not-applied">
                  Verified: not delivered (final)
                </Button>
              </form>
            );
          })
        )}
      </Card>
    </section>
  );
}
