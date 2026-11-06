import { useEffect, useState } from 'react';
import { guildRequest } from '../client-api';
import { guildApplicationInputSchema, type GuildApplication, type GuildApplicationInput } from '../applications';
import css from '../styles/requirements.module.css';
import type { GuildApplicationQuestion } from '../requirements';
import GuildApplicationChat from './GuildApplicationChat';

export default function GuildApplicationForm({
  guildId,
  guildName,
  questions = [],
}: {
  guildId: string;
  guildName: string;
  questions?: GuildApplicationQuestion[];
}) {
  const [form, setForm] = useState<GuildApplicationInput>({
    playStyle: 'Both',
    timezone: '',
    availability: '',
    experience: '',
    message: '',
  });
  const [application, setApplication] = useState<GuildApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const url = `/api/guilds/${encodeURIComponent(guildId)}/application`;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setLoaded(false);
    void guildRequest(url)
      .then((data) => {
        if (!cancelled) {
          setApplication(data);
          setLoaded(true);
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
  }, [url, reload]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = guildApplicationInputSchema.safeParse({
      ...form,
      questionVersion: JSON.stringify(questions.map(({ id, label, required }) => ({ id, label, required }))),
    });
    if (
      !parsed.success ||
      questions.some((question) => question.required && !parsed.data?.answers?.[question.id]?.trim())
    ) {
      setError('Complete every application field within its character limit.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      setApplication(await guildRequest(url, parsed.data));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit application.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={css.application} aria-label={`Application to ${guildName}`}>
      <h4>Apply to {guildName}</h4>
      {loading && <p role="status">Checking your application…</p>}
      {error && (
        <p role="alert">
          {error} {!loaded && <button onClick={() => setReload(reload + 1)}>Retry</button>}
        </p>
      )}
      {!loading && application && (
        <div>
          <p role="status">Your application is {application.status}.</p>
          <p>{application.message}</p>
          {application.customAnswers?.length ? (
            <dl className={css.answers}>
              {application.customAnswers.map((answer) => (
                <div key={answer.questionId}>
                  <dt>{answer.question}</dt>
                  <dd>{answer.answer || 'No answer provided'}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <button type="button" aria-expanded={chatOpen} onClick={() => setChatOpen(!chatOpen)}>
            {chatOpen ? 'Close chat' : 'Chat with reviewer'}
          </button>
          {chatOpen && (
            <GuildApplicationChat guildId={guildId} applicationId={application.id} title="Chat with guild reviewer" />
          )}
        </div>
      )}
      {!loading && loaded && !application && (
        <form className={css.form} onSubmit={submit}>
          <p>
            Your verified character and Discord identity will be shared with the guild leader along with your answers.
          </p>
          <label>
            Play style
            <select
              value={form.playStyle}
              onChange={(e) => setForm({ ...form, playStyle: e.target.value as GuildApplicationInput['playStyle'] })}
            >
              <option>PvE</option>
              <option>PvP</option>
              <option>Both</option>
            </select>
          </label>
          <label>
            Time zone
            <input
              required
              maxLength={80}
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              placeholder="e.g. US Eastern"
            />
          </label>
          <label>
            Availability
            <textarea
              required
              rows={2}
              maxLength={300}
              value={form.availability}
              onChange={(e) => setForm({ ...form, availability: e.target.value })}
              placeholder="Days and times you usually play"
            />
          </label>
          <label>
            Experience
            <textarea
              required
              rows={3}
              maxLength={800}
              value={form.experience}
              onChange={(e) => setForm({ ...form, experience: e.target.value })}
              placeholder="Your experience and what you enjoy doing"
            />
          </label>
          <label>
            Why would you like to join?
            <textarea
              required
              rows={4}
              maxLength={1500}
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
            />
          </label>
          {questions.map((question) => (
            <label key={question.id}>
              {question.label}
              {question.required ? ' (required)' : ' (optional)'}
              <textarea
                required={question.required}
                rows={3}
                maxLength={1000}
                value={form.answers?.[question.id] ?? ''}
                onChange={(event) =>
                  setForm({ ...form, answers: { ...form.answers, [question.id]: event.target.value } })
                }
              />
            </label>
          ))}
          <button type="submit" disabled={saving}>
            {saving ? 'Submitting…' : 'Submit application'}
          </button>
        </form>
      )}
    </section>
  );
}
