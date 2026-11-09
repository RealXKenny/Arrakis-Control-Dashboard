'use client';

import { useEffect, useRef, useState } from 'react';

const REPORT_URL = 'https://wl.hetrixtools.com/r/6fb3cbf6a8f67831f3e046b945b82450/';
const REPORT_ORIGIN = 'https://wl.hetrixtools.com';

export function UptimeReport() {
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    let disposed = false;
    let removeListeners: (() => void) | undefined;
    const timer = setTimeout(() => {
      setDelayed(true);
      element.scrolling = 'auto';
    }, 15_000);
    // Bundle the provider's exact resizer version locally; only the report itself is third-party.
    void import('iframe-resizer/js/iframeResizer')
      .then(({ default: resize }) => {
        if (disposed) return;
        const [resized] = resize(
          {
            log: false,
            checkOrigin: [REPORT_ORIGIN],
            scrolling: false,
            minHeight: 500,
            maxHeight: 20_000,
            warningTimeout: 0,
            onResized: ({ iframe }) => {
              iframe.scrolling = parseFloat(iframe.style.height) >= 20_000 ? 'auto' : 'no';
            },
            onInit: () => {
              if (!disposed) {
                setReady(true);
                clearTimeout(timer);
              }
            },
          },
          element,
        );
        removeListeners = () => resized?.iFrameResizer?.removeListeners();
      })
      .catch(() => {
        if (!disposed) {
          setDelayed(true);
          element.scrolling = 'auto';
        }
      });
    return () => {
      disposed = true;
      clearTimeout(timer);
      removeListeners?.();
    };
  }, []);

  return (
    <section className="panel overflow-hidden border-t-2 border-t-spice-500" aria-label="Hosting availability report">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-200/10 bg-obsidian-900/60 px-4 py-4 sm:px-6">
        <div>
          <p className="text-sm font-semibold text-sand-100">Hosting status report</p>
          <p className="mt-1 text-xs text-sand-500">PacketNodes Hosting / HetrixTools</p>
        </div>
        <a href={REPORT_URL} target="_blank" rel="noopener noreferrer" className="btn btn-ghost min-h-10 text-xs">
          Open report in a new tab ↗
        </a>
      </div>
      {!ready && (
        <p role="status" className="border-b border-sand-200/10 px-4 py-3 text-sm text-sand-400 sm:px-6">
          {delayed
            ? 'The report is taking longer to load. You can also open it in a new tab.'
            : 'Loading service report…'}
        </p>
      )}
      <iframe
        ref={frame}
        id="hetrix-status-report"
        title="HetrixTools hosting availability report"
        src={REPORT_URL}
        width="100%"
        height={800}
        scrolling="auto"
        sandbox="allow-scripts allow-same-origin allow-popups"
        referrerPolicy="no-referrer"
        className="block w-full border-0 bg-obsidian-950"
      />
      <p className="border-t border-sand-200/10 px-4 py-3 text-xs leading-relaxed text-sand-500 sm:px-6">
        This external report reflects hosting availability. The dashboard’s in-game population and server readings are
        shown separately on the Portal.
      </p>
    </section>
  );
}
