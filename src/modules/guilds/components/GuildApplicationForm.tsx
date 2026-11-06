import { useEffect, useRef, useState } from 'react';
import { guildRequest } from '../client-api';
import { guildApplicationInputSchema, type GuildApplication, type GuildApplicationInput } from '../applications';
import css from '../styles/requirements.module.css';
import type { GuildApplicationQuestion } from '../requirements';
import GuildApplicationChat from './GuildApplicationChat';
import GuildQuestionInput from './GuildQuestionInput';
import { formatGuildAnswer, guildAnswerError, guildQuestionVersion } from '../question-fields';

export default function GuildApplicationForm({
  guildId,
  guildName,
  questions = [],
  showChat = false,
  refreshKey = 0,
  onApplication,
  onUnreadCount,
}: {
  guildId: string;
  guildName: string;
  questions?: GuildApplicationQuestion[];
  showChat?: boolean;
  refreshKey?: number;
  onApplication?: (application: GuildApplication | null) => void;
  onUnreadCount?: (count: number) => void;
}) {
  const [form, setForm] = useState<GuildApplicationInput>({ answers: {} });
  const [application, setApplication] = useState<GuildApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [reload, setReload] = useState(0);
  const notify = useRef(onApplication);
  useEffect(() => {
    notify.current = onApplication;
  }, [onApplication]);
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
          notify.current?.(data);
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
  }, [url, reload, refreshKey]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsed = guildApplicationInputSchema.safeParse({
      ...form,
      questionVersion: guildQuestionVersion(questions),
    });
    const answerError = parsed.success
      ? guildAnswerError(questions, parsed.data.answers ?? {})
      : 'Complete each question within its character limit.';
    if (answerError || !parsed.success) {
      setError(answerError || 'Invalid answers.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await guildRequest(url, parsed.data);
      setApplication(saved);
      notify.current?.(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to submit application.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={css.application} aria-label={`Application to ${guildName}`}>
      <h4>{application ? `Application to ${guildName}` : `Apply to ${guildName}`}</h4>
      {loading && <p role="status">Checking your application…</p>}
      {error && (
        <p role="alert">
          {error} {!loaded && <button onClick={() => setReload(reload + 1)}>Retry</button>}
        </p>
      )}
      {!loading && application && (
        <div>
          <p role="status">Your application is {application.status}.</p>
          {application.message !== undefined && <p>{application.message}</p>}
          {application.customAnswers?.length ? (
            <dl className={css.answers}>
              {application.customAnswers.map((answer) => (
                <div key={answer.questionId}>
                  <dt>{answer.question}</dt>
                  <dd>{formatGuildAnswer(answer.answer)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {showChat && (
            <GuildApplicationChat
              guildId={guildId}
              applicationId={application.id}
              title="Chat with guild reviewer"
              markRead
              onUnreadCount={onUnreadCount}
            />
          )}
        </div>
      )}
      {!loading && loaded && !application && !questions.length && (
        <p>
          This guild has not set up application questions yet. Check its joining details or contact the guild leader.
        </p>
      )}
      {!loading && loaded && !application && questions.length > 0 && (
        <form className={css.form} onSubmit={submit}>
          <p>
            Your verified character and Discord identity will be shared with the guild leader along with your answers.
          </p>
          {questions.map((question) => (
            <GuildQuestionInput
              key={question.id}
              question={question}
              value={form.answers?.[question.id]}
              onChange={(value) => setForm({ ...form, answers: { ...form.answers, [question.id]: value } })}
            />
          ))}
          <button type="submit" disabled={saving}>
            {saving ? 'Submitting…' : 'Submit application'}
          </button>
        </form>
      )}
    </section>
  );
}
