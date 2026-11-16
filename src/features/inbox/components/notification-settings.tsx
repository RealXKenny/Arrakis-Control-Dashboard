'use client';
import { Button } from '../../../components/ui/button';

import { useState } from 'react';
import { categoryNames, inboxCategories } from '../model';
import { notificationConfigSchema, type NotificationConfig, type NotificationRecord } from '../preferences';
import styles from './inbox.module.css';
export function NotificationSettings({
  record,
  busy,
  onSave,
  onReload,
}: {
  record: NotificationRecord;
  busy: boolean;
  onSave(config: NotificationConfig): Promise<boolean>;
  onReload(): void;
}) {
  const [draft, setDraft] = useState(record.config);
  const [invalid, setInvalid] = useState('');
  const changed = JSON.stringify(draft) !== JSON.stringify(record.config);
  return (
    <details className={styles.source}>
      <summary className={styles.link}>Notification preferences</summary>
      <p className={styles.notice}>
        These controls affect inbox categories only, including urgent alerts. They do not change chat, guild support,
        sound settings or game state. Quiet hours and expiry are evaluated on an inbox check or confirmed settings
        change; refresh to check again.
      </p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const result = notificationConfigSchema.safeParse(draft);
          if (!result.success) {
            setInvalid('Use a valid timezone, distinct quiet-hour times and cooldowns from 0 to 10080 minutes.');
            return;
          }
          setInvalid('');
          await onSave(result.data);
        }}
      >
        <fieldset disabled={busy} className={styles.root}>
          <legend>Inbox notification preferences</legend>
          {inboxCategories.map((id) => (
            <div className={styles.filters} key={id}>
              <label className={styles.check}>
                <input
                  type="checkbox"
                  checked={draft.features[id].enabled}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      features: { ...draft.features, [id]: { ...draft.features[id], enabled: e.target.checked } },
                    })
                  }
                />
                {categoryNames[id]} notifications
              </label>
              <label>
                {categoryNames[id]} cooldown (minutes)
                <input
                  type="number"
                  min="0"
                  max="10080"
                  step="1"
                  value={draft.features[id].cooldownMinutes}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      features: {
                        ...draft.features,
                        [id]: { ...draft.features[id], cooldownMinutes: e.target.valueAsNumber },
                      },
                    })
                  }
                />
              </label>
            </div>
          ))}
          <p className={styles.notice}>
            A cooldown starts for an alert when you choose Reviewed. Zero disables it. Dismiss hides the current alert
            version; a changed reading can return. Snooze pauses the alert even if its reading changes.
          </p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={draft.quiet.enabled}
              onChange={(e) => setDraft({ ...draft, quiet: { ...draft.quiet, enabled: e.target.checked } })}
            />
            Enable quiet hours
          </label>
          <div className={styles.filters}>
            <label>
              Quiet hours start
              <input
                type="time"
                required
                value={draft.quiet.start}
                onChange={(e) => setDraft({ ...draft, quiet: { ...draft.quiet, start: e.target.value } })}
              />
            </label>
            <label>
              Quiet hours end
              <input
                type="time"
                required
                value={draft.quiet.end}
                onChange={(e) => setDraft({ ...draft, quiet: { ...draft.quiet, end: e.target.value } })}
              />
            </label>
            <label>
              Quiet hours timezone
              <input
                type="text"
                required
                maxLength={80}
                value={draft.quiet.timeZone}
                onChange={(e) => setDraft({ ...draft, quiet: { ...draft.quiet, timeZone: e.target.value } })}
              />
            </label>
            <Button
              type="button"
              className="btn btn-secondary min-h-11"
              onClick={() =>
                setDraft({
                  ...draft,
                  quiet: { ...draft.quiet, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
                })
              }
            >
              Use device timezone
            </Button>
          </div>
          <p className={styles.notice}>
            Use an IANA timezone such as America/New_York or UTC. Overnight windows and daylight-saving changes follow
            that timezone; the end time is exclusive.
          </p>
          {invalid && <p role="alert">{invalid}</p>}
          <div className={styles.filters}>
            <Button type="submit" className="btn btn-primary min-h-11" disabled={!changed}>
              Save notification preferences
            </Button>
            <Button
              type="button"
              className="btn btn-secondary min-h-11"
              disabled={!changed}
              onClick={() => {
                setDraft(record.config);
                setInvalid('');
              }}
            >
              Discard preference changes
            </Button>
            <Button type="button" className="btn btn-secondary min-h-11" onClick={onReload}>
              Reload saved settings
            </Button>
          </div>
        </fieldset>
      </form>
    </details>
  );
}
