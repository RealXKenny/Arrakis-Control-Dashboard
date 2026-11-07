'use server';

import { AuthError } from 'next-auth';
import { loginSchema, safeNextPath } from '../../features/auth/schemas';
import { signIn, signOut } from '../../server/auth/config';

export type LoginState = { error?: string };

// Dev note: a server action is just a form with a security clearance.

/** Discord handles both sign-up and sign-in; /post-login decides whether a password still needs setting. */
export async function discordSignInAction(formData: FormData): Promise<void> {
  const next = safeNextPath(formData.get('next'));
  await signIn('discord', { redirectTo: `/post-login?next=${encodeURIComponent(next)}` });
}

export async function credentialsSignInAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ email: formData.get('email'), password: formData.get('password') });
  if (!parsed.success) return { error: 'Enter a valid email address and your password.' };
  try {
    await signIn('credentials', { ...parsed.data, redirectTo: safeNextPath(formData.get('next')) });
  } catch (error) {
    // Auth.js reports a redirect on success by throwing; only real auth failures are shown.
    if (error instanceof AuthError)
      return { error: 'Incorrect email or password, or your Discord access has changed.' };
    throw error;
  }
  return {};
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' });
}
