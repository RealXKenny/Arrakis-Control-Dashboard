import './assert-server';
export function record(value: unknown): Record<string, unknown> {
  // Dev note: unknown payloads show ID before entering the building.
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
