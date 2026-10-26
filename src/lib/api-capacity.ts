import './assert-server';

// Shared across route bundles within a worker; replicas each enforce their own memory budget.
const state = globalThis as typeof globalThis & { arrakisActiveApiRequests?: number };

/** Reject excess work immediately instead of retaining an unbounded request queue. */
export function acquireApiCapacity(limit: number): (() => void) | null {
  const active = state.arrakisActiveApiRequests ?? 0;
  if (active >= limit) return null;
  state.arrakisActiveApiRequests = active + 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    state.arrakisActiveApiRequests = (state.arrakisActiveApiRequests ?? 1) - 1;
  };
}
