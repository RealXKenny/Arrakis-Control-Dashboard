'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PASSWORD_MIN_LENGTH, setPasswordSchema } from '../../../features/auth/schemas';
import { AuthField } from '../../_components/auth-field';

export function SetPasswordForm({ email, next }: { email: string; next: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<{ password?: string; confirmPassword?: string; form?: string }>({});
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = setPasswordSchema.safeParse({
      password: data.get('password'),
      confirmPassword: data.get('confirmPassword'),
    });
    if (!parsed.success) {
      const fieldErrors: typeof errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] === 'confirmPassword' ? 'confirmPassword' : 'password';
        fieldErrors[key] ??= issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setPending(true);
    try {
      const response = await fetch('/api/v2/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setErrors({ form: body?.error ?? 'Could not save your password. Please try again.' });
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setErrors({ form: 'Network error. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      {/* Shown for context only: the server takes the email from the verified session, not from this field. */}
      <AuthField
        label="Email"
        name="email"
        type="email"
        value={email}
        disabled
        readOnly
        aria-readonly="true"
        hint="Verified by Discord. This address can't be changed here."
      />
      <AuthField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        error={errors.password}
      />
      <AuthField
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        error={errors.confirmPassword}
      />
      {errors.form && (
        <p role="alert" className="border border-red-400/40 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          {errors.form}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary w-full disabled:opacity-60">
        {pending ? 'Saving…' : 'Save password'}
      </button>
    </form>
  );
}
