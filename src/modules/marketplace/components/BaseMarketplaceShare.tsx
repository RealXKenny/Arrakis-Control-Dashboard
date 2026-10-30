import Link from 'next/link';
import { useState } from 'react';
import { useCallback } from 'react';
import dynamic from 'next/dynamic';
import type { BaseCapture } from '../../bases/components/BaseModelViewer';
const BaseModelViewer = dynamic(() => import('../../bases/components/BaseModelViewer'), { ssr: false });

type ShareState = { kind: 'idle' | 'publishing' | 'shared' | 'error'; message?: string };

export default function BaseMarketplaceShare({ baseId }: { baseId: string }) {
  const [state, setState] = useState<ShareState>({ kind: 'idle' });
  const [choosingFront, setChoosingFront] = useState(false);
  const [capture, setCapture] = useState<BaseCapture | null>(null);
  const settled = useCallback(() => {}, []);

  async function publish() {
    if (state.kind === 'publishing' || !capture) return;
    setState({ kind: 'publishing' });
    try {
      if (capture) {
        const saved = await fetch(`/api/bases/${encodeURIComponent(baseId)}/preview`, {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(capture),
        });
        if (!saved.ok) throw new Error('Unable to save the base picture. Please try again.');
      }
      const response = await fetch(`/api/bases/${encodeURIComponent(baseId)}/marketplace`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? 'Unable to share this base right now.');
      setState({ kind: 'shared' });
      setChoosingFront(false);
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
          setChoosingFront(true);
        }}
        className="inline-flex rounded-full border border-white/5 bg-zinc-800 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-700 hover:text-zinc-100 disabled:opacity-50"
      >
        {state.kind === 'publishing' ? 'Publishing…' : state.kind === 'shared' ? 'Shared to Marketplace' : 'Share Base'}
      </button>
      {choosingFront && (
        <section
          className="w-full min-w-0"
          aria-label="Choose shared base front"
          onClick={(event) => event.stopPropagation()}
        >
          <h3 className="text-sm text-zinc-200">Choose the front of your base</h3>
          <p className="my-2 text-xs text-zinc-400">
            Orbit to the entrance and select your picture. The whole base will fit inside the image.
          </p>
          <BaseModelViewer baseId={baseId} baseName="Base to share" onSettled={settled} onCapture={setCapture} />
          {capture && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={capture.image}
                width={640}
                height={360}
                alt="Selected marketplace base picture"
                className="my-3 h-auto max-w-full rounded-xl"
              />
            </>
          )}
          <button
            type="button"
            disabled={state.kind === 'publishing' || !capture}
            onClick={() => void publish()}
            className="mt-3 rounded-full bg-indigo-500/20 px-4 py-2 text-xs text-indigo-200"
          >
            Publish base with this picture
          </button>
          <button
            type="button"
            disabled={state.kind === 'publishing'}
            onClick={() => {
              setChoosingFront(false);
              setCapture(null);
            }}
            className="ml-2 text-xs text-zinc-400"
          >
            Cancel
          </button>
        </section>
      )}
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
