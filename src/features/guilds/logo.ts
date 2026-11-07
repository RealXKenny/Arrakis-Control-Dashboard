export const MAX_LOGO_BYTES = 512 * 1024;

/** Client-side pre-check; the server re-validates the PNG signature and size. */
export function logoProblem(file: { type: string; size: number }): string | null {
  return file.type === 'image/png' && file.size > 0 && file.size <= MAX_LOGO_BYTES
    ? null
    : 'Choose a PNG logo no larger than 512 KiB.';
}
