import Link from 'next/link';
import { useState } from 'react';

type ShareState = { kind: 'idle' | 'publishing' | 'shared' | 'error'; message?: string };

export default function BaseMarketplaceShare({ baseId }: { baseId: string }) {
  const [state, setState] = useState<ShareState>({ kind: 'idle' });

  async function publish() {
    if (state.kind === 'publishing') return;
    setState({ kind: 'publishing' });
    try {
      const response = await fetch(`/api/bases/${encodeURIComponent(baseId)}/marketplace`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? 'Unable to share this base right now.');
      setState({ kind: 'shared' });
    } catch (error) {
      setState({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unable to share this base right now.',
      });
    }
  }

  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2" onKeyDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        disabled={state.kind === 'publishing'}
        onClick={(event) => {
          event.stopPropagation();
          void publish();
        }}
        className="inline-flex rounded-full border border-white/5 bg-zinc-800 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50"
      >
        {state.kind === 'publishing' ? 'Publishing…' : state.kind === 'shared' ? 'Shared to Marketplace' : 'Share Base'}
      </button>
      {state.kind === 'shared' && (
        <Link
          href="/portal?view=base-market"
          onClick={(event) => event.stopPropagation()}
          className="text-[11px] font-medium text-indigo-300 no-underline hover:text-indigo-200"
        >
          View listing ↗
        </Link>
      )}
      {state.kind === 'error' && (
        <span role="alert" className="text-[11px] leading-4 text-red-300">
          {state.message}
        </span>
      )}
    </div>
  );
}
