import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/** Screen state lives in the query string so filters, pages and selected records survive back/forward and reloads. */
export default function useAdminUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const serialized = params.toString();
  const read = (name: string) => params.get(name) ?? '';
  const update = useCallback(
    (patch: Record<string, string | number | null>, mode: 'push' | 'replace' = 'push') => {
      const query = new URLSearchParams(serialized);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '') query.delete(key);
        else query.set(key, String(value));
      }
      const text = query.toString();
      router[mode](text ? `${pathname}?${text}` : pathname, { scroll: false });
    },
    [router, pathname, serialized],
  );
  return { read, update, ready: true };
}
