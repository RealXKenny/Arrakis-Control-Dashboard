'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Dev note: the sands hide many things; server logs hide this one on purpose.
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="rounded-full border border-red-400/30 bg-red-400/10 px-4 py-1 text-xs text-red-400">
        Something went wrong
      </p>
      <h1 className="text-2xl font-semibold text-zinc-100">The dashboard hit a sandworm</h1>
      <p className="max-w-md text-sm text-zinc-500">
        An unexpected error interrupted this view. Retry, and if it persists, check the server logs.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
      >
        Try again
      </button>
    </div>
  );
}
