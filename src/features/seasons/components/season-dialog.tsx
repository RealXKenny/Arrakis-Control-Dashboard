'use client';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';

export function SeasonDialog({
  labelledBy,
  onClose,
  children,
  returnFocus,
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  returnFocus?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const opener = returnFocus?.current ?? (document.activeElement as HTMLElement | null);
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className="season-modal season-root"
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const elements = [
          ...event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
          ),
        ].filter((element) => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
        const first = elements[0];
        const last = elements.at(-1);
        if (!first) {
          event.preventDefault();
          event.currentTarget.focus();
        } else if (
          event.shiftKey &&
          (document.activeElement === first || !event.currentTarget.contains(document.activeElement))
        ) {
          event.preventDefault();
          last.focus();
        } else if (
          !event.shiftKey &&
          (document.activeElement === last || !event.currentTarget.contains(document.activeElement))
        ) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
