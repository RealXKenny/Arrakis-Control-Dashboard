import './assert-server';
/** Narrow an untrusted transport value before feature-specific validation. */
export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
