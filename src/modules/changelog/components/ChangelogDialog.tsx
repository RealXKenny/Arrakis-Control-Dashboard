import { useEffect, useState } from 'react';
import { APP_VERSION } from '../../../config/version';
import type { ChangelogRelease } from '../schema';
import css from '../changelog-dialog.module.css';

export default function ChangelogDialog() {
  const [open, setOpen] = useState(false);
  const [releases, setReleases] = useState<ChangelogRelease[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  async function showChangelog() {
    setOpen(true);
    if (releases.length || loading) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/changelog');
      if (!response.ok) throw new Error('Changelog request failed');
      const payload = (await response.json()) as { releases?: ChangelogRelease[] };
      if (!Array.isArray(payload.releases)) throw new Error('Changelog response was invalid');
      setReleases(payload.releases);
    } catch {
      setError('The release archive is hiding in the deep desert. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button className={css.versionButton} type="button" onClick={showChangelog}>
        v{APP_VERSION}
      </button>
      {open && (
        <div className={css.backdrop} role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className={css.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="changelog-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={css.dialogHeader}>
              <div>
                <p>System archive // release transmissions</p>
                <h2 id="changelog-title">Changelog</h2>
              </div>
              <button
                className={css.closeButton}
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close changelog"
              >
                ×
              </button>
            </header>

            <div className={css.dialogBody}>
              {loading && <p className={css.message}>Decrypting release transmissions…</p>}
              {error && <p className={css.message}>{error}</p>}
              {releases.map((release) => (
                <article className={css.release} key={release.version}>
                  <header className={css.releaseHeader}>
                    <div>
                      <p>{release.date}</p>
                      <h3>Version {release.version}</h3>
                    </div>
                    {release.version === APP_VERSION && <span>Current</span>}
                  </header>
                  <div className={css.sections}>
                    {release.sections.map((section) => (
                      <section key={section.title}>
                        <h4>{section.title}</h4>
                        <ul>
                          {section.items.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
