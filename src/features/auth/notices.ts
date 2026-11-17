const NOTICES = new Map<string, string>([
  ['role', 'Your Discord account does not have the required guild role yet.'],
  ['guild', 'Join the Discord server first, then sign in again.'],
  ['unavailable', 'Discord could not be reached. Please try again in a moment.'],
]);

/**
 * Message for the `?error=` code on the sign-in page. A Map is used on purpose: the code comes from the URL, and an
 * object lookup would hand back inherited members such as `constructor` instead of falling back to the generic text.
 */
export function signInNotice(error: string | undefined): string | undefined {
  if (!error) return undefined;
  return NOTICES.get(error) ?? 'Sign-in failed. Please try again.';
}
