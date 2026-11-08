'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { guildRequest } from '../client-api';
import { guildApplicationInputSchema, type GuildApplication } from '../applications';
import type { GuildApplicationQuestion } from '../requirements';
import { formatGuildAnswer, guildAnswerError, guildQuestionVersion, type GuildAnswer } from '../question-fields';
import { FormMessage } from '../../../components/ui/form-controls';
import { GuildChat } from './guild-chat';
import { QuestionInput } from './question-input';

export function AnswerList({ answers }: { answers: NonNullable<GuildApplication['customAnswers']> }) {
  return (
    <dl className="grid gap-3 text-sm">
      {answers.map((answer) => (
        <div key={answer.questionId}>
          <dt className="font-mono text-[0.6875rem] uppercase tracking-widest text-sand-500">{answer.question}</dt>
          <dd className="mt-1 whitespace-pre-wrap break-words text-sand-100">{formatGuildAnswer(answer.answer)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Loads this member's application for one guild. Shows the form when there is none, otherwise the
 * submitted answers, with the private reviewer chat when asked for. Answers are re-validated here and
 * again by the server, which also checks the question version so a changed form is never mis-submitted.
 */
export function ApplicationPanel({
  guildId,
  guildName,
  questions,
  showChat,
  refreshKey,
  onApplication,
  onUnreadCount,
}: {
  guildId: string;
  guildName: string;
  questions: GuildApplicationQuestion[];
  showChat: boolean;
  refreshKey: number;
  onApplication: (application: GuildApplication | null) => void;
  onUnreadCount: (count: number) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, GuildAnswer>>({});
  const [application, setApplication] = useState<GuildApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const notify = useRef(onApplication);
  const url = `/api/guilds/${encodeURIComponent(guildId)}/application`;

  useEffect(() => {
    notify.current = onApplication;
  }, [onApplication]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoaded(false);
    setError('');
    void guildRequest(url)
      .then((data) => {
        if (cancelled) return;
        setApplication(data);
        notify.current(data);
        setLoaded(true);
      })
      .catch((reason: Error) => {
        if (!cancelled) setError(reason.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, reload, refreshKey]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = guildApplicationInputSchema.safeParse({ answers, questionVersion: guildQuestionVersion(questions) });
    const problem = parsed.success
      ? guildAnswerError(questions, parsed.data.answers ?? {})
      : 'Complete each question within its character limit.';
    if (problem || !parsed.success) {
      setError(problem || 'Invalid answers.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await guildRequest(url, parsed.data);
      setApplication(saved);
      notify.current(saved);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to submit application.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      aria-label={`Application to ${guildName}`}
      className="mt-5 flex flex-col gap-4 border-t border-sand-200/10 pt-5"
    >
      <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-sand-50">
        {application ? `Application to ${guildName}` : `Apply to ${guildName}`}
      </h4>
      {loading && (
        <p role="status" className="text-sm text-sand-400">
          Checking your application…
        </p>
      )}
      <FormMessage error={error} />
      {!loaded && error && (
        <button type="button" className="btn btn-ghost self-start" onClick={() => setReload((value) => value + 1)}>
          Retry
        </button>
      )}
      {!loading && application && (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-sm text-sand-100">
            Your application is <strong className="uppercase text-spice-300">{application.status}</strong>.
          </p>
          {application.message !== undefined && <p className="text-sm text-sand-300">{application.message}</p>}
          {application.customAnswers?.length ? <AnswerList answers={application.customAnswers} /> : null}
          {showChat && (
            <GuildChat
              url={`/api/guilds/${encodeURIComponent(guildId)}/applications/${encodeURIComponent(application.id)}/messages`}
              title="Chat with guild reviewer"
              note="Administrators can review this application conversation."
              roleLabels={{ applicant: 'Applicant', reviewer: 'Reviewer' }}
              readFrom="reviewer"
              onUnreadCount={onUnreadCount}
            />
          )}
        </div>
      )}
      {!loading && loaded && !application && questions.length === 0 && (
        <p className="text-sm text-sand-400">
          This guild has not set up application questions yet. Check its joining details or contact the guild leader.
        </p>
      )}
      {!loading && loaded && !application && questions.length > 0 && (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <p className="text-xs text-sand-500">
            Your verified character, Discord identity, answers, and application conversation can be reviewed by the
            guild leader and dashboard administrators.
          </p>
          {questions.map((question) => (
            <QuestionInput
              key={question.id}
              question={question}
              value={answers[question.id]}
              onChange={(value) => setAnswers((current) => ({ ...current, [question.id]: value }))}
            />
          ))}
          <button type="submit" disabled={saving} className="btn btn-primary self-start disabled:opacity-50">
            {saving ? 'Submitting…' : 'Submit application'}
          </button>
        </form>
      )}
    </section>
  );
}
