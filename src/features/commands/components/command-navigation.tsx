'use client';
import { useCallback, useEffect, useState } from 'react';
import type { NavIdentity } from '../../auth/identity';
import { TopNavigation } from '../../../components/navigation/top-navigation';
import { CommandPalette } from './command-palette';

export function CommandNavigation({ identity, isAdmin }: { identity: NavIdentity | null; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const openPalette = useCallback((target?: HTMLElement) => {
    setOpener(target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null));
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    if (!identity) return;
    document.documentElement.dataset.commandPalette = 'ready';
    const keydown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.repeat ||
        event.altKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key.toLowerCase() !== 'k'
      )
        return;
      const target = event.target instanceof Element ? event.target : null;
      if (
        !open &&
        (target?.closest('input, textarea, select, [role="textbox"], [role="dialog"], dialog[open]') ||
          (target instanceof HTMLElement && target.isContentEditable))
      )
        return;
      event.preventDefault();
      if (open) close();
      else openPalette();
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      delete document.documentElement.dataset.commandPalette;
    };
  }, [identity, open, close, openPalette]);
  return (
    <>
      <TopNavigation identity={identity} isAdmin={isAdmin} onOpenCommands={identity ? openPalette : undefined} />
      {identity && open && <CommandPalette isAdmin={isAdmin} onClose={close} returnFocus={opener} />}
    </>
  );
}
