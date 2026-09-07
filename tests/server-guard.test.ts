import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

it('allows ordinary Node server imports without a React server condition', async () => {
  await expect(import('../src/lib/assert-server')).resolves.toBeDefined();
});

it('rejects browser imports without mocking the server guard', async () => {
  vi.resetModules();
  vi.stubGlobal('window', {});
  await expect(import('../src/lib/assert-server')).rejects.toThrow('must not be imported into browser code');
});
