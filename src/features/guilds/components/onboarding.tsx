'use client';

import { useEffect, useRef, useState } from 'react';
import { Field, FormMessage, inputClass } from '../../../components/ui/form-controls';
import { LocalTime } from '../../../components/ui/local-time';
import { guildRequest } from '../client-api';
import { onboardingViewSchema, type OnboardingView, type OnboardingInput, type OnboardingGuide } from '../onboarding';
import { OnboardingGuideForm } from './onboarding-guide-form';

export function GuildOnboarding({ guildId }: { guildId: string }) {
  const [view, setView] = useState<OnboardingView | null>(null);
  const [verified, setVerified] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [guideDraft, setGuideDraft] = useState<OnboardingGuide | null>(null);
  const [memberKey, setMemberKey] = useState('');
  const [mentorKey, setMentorKey] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const pending = useRef(false);
  const url = `/api/v2/guilds/${encodeURIComponent(guildId)}/onboarding`;
  useEffect(() => {
    const controller = new AbortController();
    guildRequest(url, undefined, controller.signal)
      .then((value: unknown) => {
        if (controller.signal.aborted) return;
        setView(onboardingViewSchema.parse(value));
        setVerified(true);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Guild onboarding could not be loaded. Refresh to try again.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url]);
  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError('');
    setMessage('');
    setRemoving(null);
    try {
      setView(onboardingViewSchema.parse(await guildRequest(url)));
      setVerified(true);
    } catch (reason) {
      setVerified(false);
      setError(reason instanceof Error ? reason.message : 'Unable to verify guild membership.');
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }
  async function mutate(input: OnboardingInput) {
    if (pending.current || !verified) return;
    pending.current = true;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      setView(onboardingViewSchema.parse(await guildRequest(url, input)));
      if (input.action === 'guide') setGuideDraft(null);
      if (input.action === 'remove-progress') setRemoving(null);
      setMessage('Guild onboarding updated.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to confirm the change. Your draft is kept.');
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  const busy = loading || saving || !verified;
  const acknowledged = Boolean(
    view?.guide.rules && view.self?.rulesRevision && view.self.rulesRevision === view.rulesRevision,
  );
  const completed = view?.self?.completed ?? [];
  return (
    <section
      aria-label="Guild recruit onboarding"
      className="panel min-w-0 p-5 sm:p-6 [&_button]:max-w-full [&_button]:whitespace-normal [&_button]:[overflow-wrap:anywhere] [&_button:disabled]:opacity-50"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg">Recruit onboarding</h2>
          <p className="mt-2 max-w-prose text-sm text-sand-400">
            Your guild welcome guide, mentor and personal checklist.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" disabled={loading || saving} onClick={refresh} className="btn btn-secondary">
            Refresh onboarding
          </button>
          {verified && view?.canEdit && (
            <button
              type="button"
              disabled={busy || Boolean(guideDraft)}
              onClick={() => setGuideDraft(view.guide)}
              className="btn btn-primary"
            >
              Edit welcome guide
            </button>
          )}
        </div>
      </div>
      <div className="mt-4">
        <FormMessage error={error} status={message} />
      </div>
      {loading && (
        <p role="status" className="mt-4 text-sm text-sand-400">
          Loading onboarding…
        </p>
      )}
      {guideDraft && (
        <div hidden={!verified || !view?.canEdit}>
          <OnboardingGuideForm
            initial={guideDraft}
            busy={busy || !view?.canEdit}
            onCancel={() => setGuideDraft(null)}
            onSave={(guide) => view && mutate({ action: 'guide', revision: view.revision, guide })}
          />
        </div>
      )}
      {view && (
        <div hidden={!verified}>
          <div className="mt-6 grid min-w-0 gap-5">
            <article className="min-w-0 border border-sand-200/20 p-4">
              <h3 className="text-sm">Welcome</h3>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-sand-300">
                {view.guide.welcome || 'Your leader has not added a welcome message yet.'}
              </p>
            </article>
            <article className="min-w-0 border border-sand-200/20 p-4">
              <h3 className="text-sm">Guild rules</h3>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-sand-300">
                {view.guide.rules || 'No guild rules have been added yet.'}
              </p>
              {view.guide.rules && (
                <div className="mt-4">
                  {acknowledged ? (
                    <p className="text-sm text-status-ok">You acknowledged the current guild rules.</p>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      className="btn btn-secondary"
                      onClick={() => mutate({ action: 'acknowledge-rules', revision: view.revision })}
                    >
                      I have read the guild rules
                    </button>
                  )}
                </div>
              )}
            </article>
            <article className="min-w-0 border border-sand-200/20 p-4">
              <h3 className="text-sm">Useful locations</h3>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-sand-300">
                {view.guide.locations || 'Your leader has not added locations yet.'}
              </p>
              <a href="/guild?tab=bases" className="mt-4 inline-block text-sm text-spice-300 underline">
                Open shared base directory
              </a>
            </article>
            <article aria-label="Your onboarding progress" className="min-w-0 border border-sand-200/20 p-4">
              <h3 className="text-sm">Your welcome checklist</h3>
              <p className="mt-3 break-words text-sm text-sand-300">
                Mentor:{' '}
                {view.self?.mentorName ??
                  (view.self?.mentorKey ? 'Unavailable — ask your leader for a new assignment' : 'Not assigned')}
              </p>
              <p className="mt-3 text-sm text-sand-400" aria-live="polite">
                {completed.length} of {view.guide.steps.length} checklist items complete
              </p>
              {!view.guide.steps.length && (
                <p className="mt-3 text-sm text-sand-400">Your leader has not added checklist items yet.</p>
              )}
              <ul className="mt-4 grid min-w-0 gap-4">
                {view.guide.steps.map((step) => (
                  <li key={step.id} className="min-w-0 border-l border-spice-400/40 pl-3">
                    <p className="break-words text-sm text-sand-200">{step.text}</p>
                    <button
                      type="button"
                      disabled={busy}
                      aria-pressed={completed.includes(step.id)}
                      className="btn btn-secondary mt-3"
                      onClick={() =>
                        mutate({
                          action: 'complete',
                          revision: view.revision,
                          stepId: step.id,
                          completed: !completed.includes(step.id),
                        })
                      }
                    >
                      {completed.includes(step.id) ? 'Mark incomplete' : 'Mark complete'}: {step.text}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-sand-500">
                Progress is self-reported and visible to your guild leader. A checklist mark or rules acknowledgment
                does not grant game permissions or change your guild rank.
              </p>
            </article>
          </div>
          {view.canEdit && (
            <section aria-label="Manage recruit progress" className="mt-6 min-w-0 border border-sand-200/20 p-4">
              <h3 className="text-sm">Mentors and member progress</h3>
              <form
                aria-label="Assign recruit mentor"
                className="mt-4 grid min-w-0 gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (memberKey)
                    void mutate({ action: 'mentor', revision: view.revision, memberKey, mentorKey: mentorKey || null });
                }}
              >
                <Field label="Recruit">
                  <select
                    required
                    value={memberKey}
                    onChange={(event) => {
                      const key = event.target.value;
                      setMemberKey(key);
                      setMentorKey(view.members.find((member) => member.memberKey === key)?.mentorKey ?? '');
                    }}
                    className={inputClass}
                  >
                    <option value="">Choose a current member</option>
                    {view.roster.map((member) => (
                      <option key={member.key} value={member.key}>
                        {member.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Mentor">
                  <select
                    value={mentorKey}
                    onChange={(event) => setMentorKey(event.target.value)}
                    className={inputClass}
                  >
                    <option value="">No mentor assigned</option>
                    {view.roster
                      .filter((member) => member.key !== memberKey)
                      .map((member) => (
                        <option key={member.key} value={member.key}>
                          {member.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <button type="submit" disabled={busy || !memberKey} className="btn btn-secondary justify-self-start">
                  Save mentor assignment
                </button>
              </form>
              <p className="mt-4 text-xs text-sand-500">
                Up to 200 progress records and 20 checklist items. Inactive onboarding records expire together 90 days
                after the last change. Remove former members&apos; records when no longer needed.
              </p>
              {removing && (
                <div
                  role="region"
                  aria-label="Confirm progress removal"
                  className="mt-4 border-l-2 border-spice-400 p-3"
                >
                  <p className="text-sm text-sand-300">
                    Remove this member&apos;s recorded progress and mentor assignment? They can start again while still
                    a member.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={busy}
                      className="btn btn-primary"
                      onClick={() =>
                        mutate({ action: 'remove-progress', revision: view.revision, memberKey: removing })
                      }
                    >
                      Confirm removal
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      className="btn btn-secondary"
                      onClick={() => setRemoving(null)}
                    >
                      Keep progress
                    </button>
                  </div>
                </div>
              )}
              <ul className="mt-5 grid min-w-0 gap-4" aria-label="Recruit progress records">
                {view.members.map((member) => (
                  <li key={member.memberKey} className="min-w-0">
                    <article aria-label={member.memberName} className="min-w-0 border border-sand-200/20 p-3">
                      <h4 className="break-words text-sm">{member.memberName}</h4>
                      <p className="mt-2 text-xs text-sand-400">
                        {member.currentMember ? 'Current member' : 'Former member'}
                      </p>
                      <p className="mt-3 text-sm text-sand-300">
                        {member.completed.length} of {view.guide.steps.length} checklist items complete
                      </p>
                      <p className="mt-2 text-sm text-sand-300">
                        Rules:{' '}
                        {view.guide.rules
                          ? member.rulesRevision === view.rulesRevision
                            ? 'Acknowledged'
                            : 'Awaiting acknowledgment'
                          : 'Not configured'}
                      </p>
                      <p className="mt-2 break-words text-sm text-sand-300">
                        Mentor: {member.mentorName ?? (member.mentorKey ? 'No longer available' : 'Not assigned')}
                      </p>
                      <p className="mt-3 text-xs text-sand-500">
                        Updated <LocalTime value={member.updatedAt} />
                      </p>
                      <button
                        type="button"
                        disabled={busy}
                        className="btn btn-secondary mt-4"
                        onClick={() => setRemoving(member.memberKey)}
                      >
                        Remove progress
                      </button>
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
