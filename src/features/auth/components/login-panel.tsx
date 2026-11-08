'use client';

import { useActionState, useState } from 'react';
import { credentialsSignInAction, discordSignInAction, type LoginState } from '../actions';
import { AuthField } from './auth-field';
import { DiscordIcon } from '../../../components/icons';

type Tab = 'login' | 'register';

function DiscordButton({ next, label }: { next: string; label: string }) {
  return (
    <form action={discordSignInAction}>
      <input type="hidden" name="next" value={next} />
      <button type="submit" className="btn btn-primary w-full">
        <DiscordIcon className="size-5" />
        {label}
      </button>
    </form>
  );
}

function CredentialsForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(credentialsSignInAction, {});
  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <input type="hidden" name="next" value={next} />
      <AuthField label="Email" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
      <AuthField label="Password" name="password" type="password" autoComplete="current-password" required />
      {state.error && (
        <p role="alert" className="border border-red-400/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {state.error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-ghost w-full disabled:opacity-60">
        {pending ? 'Signing in…' : 'Sign in with email'}
      </button>
    </form>
  );
}

export function LoginPanel({ next, initialTab, notice }: { next: string; initialTab: Tab; notice?: string }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabClass = (value: Tab) =>
    `flex-1 border-b-2 py-3 text-[0.6875rem] font-bold uppercase tracking-[0.2em] ${
      tab === value ? 'border-spice-500 text-spice-400' : 'border-transparent text-sand-400 hover:text-sand-100'
    }`;

  return (
    <section aria-labelledby="auth-title" className="panel flex flex-col gap-6 p-6 sm:p-8 lg:col-span-3">
      <h2 id="auth-title" className="sr-only">
        Account access
      </h2>
      <div role="tablist" aria-label="Account access" className="flex border-b border-sand-200/10">
        <button
          type="button"
          role="tab"
          id="tab-login"
          aria-selected={tab === 'login'}
          aria-controls="panel-login"
          className={tabClass('login')}
          onClick={() => setTab('login')}
        >
          Sign in
        </button>
        <button
          type="button"
          role="tab"
          id="tab-register"
          aria-selected={tab === 'register'}
          aria-controls="panel-register"
          className={tabClass('register')}
          onClick={() => setTab('register')}
        >
          Sign up
        </button>
      </div>

      {notice && (
        <p role="alert" className="border border-red-400/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {notice}
        </p>
      )}

      {tab === 'login' ? (
        <div role="tabpanel" id="panel-login" aria-labelledby="tab-login" className="flex flex-col gap-6">
          <DiscordButton next={next} label="Continue with Discord" />
          <div className="flex items-center gap-3 text-[0.6875rem] uppercase tracking-[0.2em] text-sand-600">
            <span className="h-px flex-1 bg-sand-200/10" />
            or use your email
            <span className="h-px flex-1 bg-sand-200/10" />
          </div>
          <CredentialsForm next={next} />
        </div>
      ) : (
        <div role="tabpanel" id="panel-register" aria-labelledby="tab-register" className="flex flex-col gap-6">
          <p className="text-sm leading-relaxed text-sand-300">
            New to Arrakis Control? Registration runs through Discord so we can confirm your guild role and your
            verified email.
          </p>
          <DiscordButton next={next} label="Sign up with Discord" />
          <ol className="grid gap-3 sm:grid-cols-3">
            {['Authorize with Discord', 'We verify your guild role', 'Set a password for email sign-in'].map(
              (step, index) => (
                <li key={step} className="border border-sand-200/10 bg-obsidian-900/60 p-3 text-xs text-sand-300">
                  <span className="mb-1 block font-mono text-spice-400">0{index + 1}</span>
                  {step}
                </li>
              ),
            )}
          </ol>
        </div>
      )}
    </section>
  );
}
