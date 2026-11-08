'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Native modal dialog: focus is trapped by the browser, Esc closes, and focus returns to the opener. */
export function Modal({
  title,
  onClose,
  busy = false,
  children,
}: {
  title: string;
  onClose: () => void;
  busy?: boolean;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    const opener = document.activeElement as HTMLElement | null;
    if (element && !element.open) element.showModal();
    return () => {
      if (element?.open) element.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="guild-modal-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] border border-sand-200/20 bg-obsidian-900 p-0 text-sand-100 shadow-[8px_8px_0_0_rgb(0_0_0/0.7)] backdrop:bg-black/70"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id="guild-modal-title" className="text-lg tracking-wide">
          {title}
        </h2>
        {children}
        <button
          type="button"
          className="btn btn-ghost self-start disabled:opacity-50"
          disabled={busy}
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </dialog>
  );
}
