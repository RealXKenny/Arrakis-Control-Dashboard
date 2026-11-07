import { useRouter } from 'next/router';
import { useCallback } from 'react';

/** Screen state lives in the query string so filters, pages and selected records survive back/forward and reloads. */
export default function useAdminUrl() {
  const router = useRouter();
  const read = (name: string) => (typeof router.query[name] === 'string' ? (router.query[name] as string) : '');
  const update = useCallback(
    (patch: Record<string, string | number | null>, mode: 'push' | 'replace' = 'push') => {
      const query: Record<string, string> = {};
      for (const [key, value] of Object.entries(router.query)) if (typeof value === 'string') query[key] = value;
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') delete query[key];
        else query[key] = String(value);
      }
      void router[mode]({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
    },
    [router],
  );
  return { read, update, ready: router.isReady };
}
