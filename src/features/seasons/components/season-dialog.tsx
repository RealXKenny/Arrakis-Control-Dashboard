'use client';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { containTabFocus, restoreFocus } from '../../../lib/ui/focus';
import { lockPageScroll } from '../../../lib/ui/scroll-lock';

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
    const unlockScroll = lockPageScroll(document.body);
    dialog?.showModal();
    return () => {
      dialog?.close();
      unlockScroll();
      restoreFocus(opener);
    };
  }, [returnFocus]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className="season-modal season-root"
      tabIndex={-1}
      onKeyDown={(event) => containTabFocus(event, event.currentTarget)}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
