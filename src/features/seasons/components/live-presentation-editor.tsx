'use client';
import { useState } from 'react';
import { seasonPresentation, type Season, type Presentation } from '../contracts';
import { ArtworkUpload } from './artwork-upload';

export function LivePresentationEditor({
  season,
  busy,
  onSave,
}: {
  season: Season;
  busy: boolean;
  onSave: (presentation: Presentation, reason: string, confirmation: string) => void;
}) {
  const [presentation, setPresentation] = useState(() => seasonPresentation(season));
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  return (
    <section className="season-editor-card">
      <h2>Live season presentation</h2>
      <p>
        Only the subtitle, description, theme and hero image can change. Published identity, dates, XP, challenges,
        milestones and reward definitions stay frozen. Each save records a before/after snapshot and audit reason.
      </p>
      <form
        className="season-live-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(presentation, reason, confirmation);
        }}
      >
        <fieldset disabled={busy}>
          <legend className="season-kicker">Display settings</legend>
          <label>
            Live subtitle
            <input
              value={presentation.subtitle}
              required
              maxLength={160}
              onChange={(event) => setPresentation((v) => ({ ...v, subtitle: event.target.value }))}
            />
          </label>
          <label>
            Live description
            <textarea
              aria-label="Live description"
              value={presentation.description}
              required
              maxLength={3000}
              onChange={(event) => setPresentation((v) => ({ ...v, description: event.target.value }))}
            />
          </label>
          <label>
            Live theme
            <select
              aria-label="Live theme"
              value={presentation.theme}
              onChange={(event) =>
                setPresentation((v) => ({ ...v, theme: event.target.value as Presentation['theme'] }))
              }
            >
              {['dunes', 'eclipse', 'spice'].map((theme) => (
                <option key={theme}>{theme}</option>
              ))}
            </select>
          </label>
          <ArtworkUpload
            seasonId={season.id}
            revision={season.revision}
            label="Live season hero artwork"
            value={presentation.artwork}
            onChange={(artwork) => setPresentation((v) => ({ ...v, artwork }))}
          />
          <label>
            Reason for live edit
            <input
              required
              minLength={10}
              maxLength={500}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label>
            Type the saved season name to confirm
            <input
              required
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
            />
          </label>
          <div className="season-actions">
            <button className="season-button season-primary" disabled={confirmation !== season.definition.name}>
              Save live presentation
            </button>
            <button
              type="button"
              className="season-button"
              onClick={() =>
                setPresentation({
                  subtitle: season.definition.subtitle,
                  description: season.definition.description,
                  theme: season.definition.theme,
                  artwork: season.definition.artwork,
                })
              }
            >
              Restore published presentation in form
            </button>
            <button type="button" className="season-button" onClick={() => setPresentation(seasonPresentation(season))}>
              Discard live edits
            </button>
          </div>
        </fieldset>
      </form>
    </section>
  );
}
