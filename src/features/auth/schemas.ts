import { z } from 'zod';

/** Pure and browser-safe: the same rules run in the form (for fast feedback) and on the server (for trust). */
export const emailSchema = z.string().trim().toLowerCase().min(3).max(254).pipe(z.email());

export const loginSchema = z.object({
  email: emailSchema,
  // Length-capped only: the login form must never reveal or enforce password policy for old accounts.
  password: z.string().min(1).max(128),
});

export const PASSWORD_MIN_LENGTH = 12;

export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
      .max(128, 'Use at most 128 characters.'),
    confirmPassword: z.string().max(128),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

/** Only same-site relative paths may be used as a post-login destination (no open redirects). */
export function safeNextPath(value: unknown, fallback = '/portal'): string {
  if (typeof value !== 'string' || value.length > 512) return fallback;
  if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\u0000-\u001f]/.test(value)) {
    return fallback;
  }
  return value;
}
