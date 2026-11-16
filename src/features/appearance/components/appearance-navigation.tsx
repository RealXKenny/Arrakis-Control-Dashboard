'use client';
import { Button } from '../../../components/ui/button';

import { Component, useCallback, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import type { NavIdentity } from '../../auth/identity';
import { CommandNavigation } from '../../commands/components/command-navigation';
import { appearanceKey, appearanceCacheKey, ownedColorProperties, defaultPreference } from '../model';
type PanelProps = { onClose: () => void; opener: HTMLElement | null };
class AppearanceBoundary extends Component<{ children: ReactNode; onReset: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div
        role="alert"
        aria-label="Appearance recovery"
        className="fixed inset-x-4 top-24 z-[100] border border-sand-500 bg-obsidian-900 p-6 text-sand-100"
      >
        Appearance controls could not open. Your dashboard remains available.{' '}
        <Button className="btn btn-secondary" onClick={this.props.onReset}>
          Reset appearance and close
        </Button>
      </div>
    ) : (
      this.props.children
    );
  }
}
export function AppearanceNavigation({ identity }: { identity: NavIdentity | null }) {
  const [Panel, setPanel] = useState<ComponentType<PanelProps> | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const close = useCallback(() => {
    setOpen(false);
    setError('');
    opener?.focus();
  }, [opener]);
  const openAppearance = useCallback((target?: HTMLElement) => {
    setOpener(target ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null));
    setOpen(true);
    setError('');
    void import('./theme-panel')
      .then((module) => setPanel(() => module.ThemePanel))
      .catch(() => setError('Appearance controls could not load. Retry or restore Default.'));
  }, []);
  useEffect(() => {
    let active = true;
    const restore = () => {
      try {
        if (!localStorage.getItem(appearanceKey) && !document.documentElement.dataset.appearance) {
          document.documentElement.dataset.appearanceReady = 'default';
          return;
        }
      } catch {
        if (!document.documentElement.dataset.appearance) {
          document.documentElement.dataset.appearanceReady = 'default';
          return;
        }
      }
      void import('../storage')
        .then((module) => {
          if (active) {
            module.restoreAppearance();
            document.documentElement.dataset.appearanceReady = 'ready';
          }
        })
        .catch(() => {});
    };
    restore();
    const sync = (event: StorageEvent) => {
      if (event.key === appearanceKey || event.key === null) restore();
    };
    window.addEventListener('storage', sync);
    return () => {
      active = false;
      window.removeEventListener('storage', sync);
    };
  }, []);
  function reset() {
    ownedColorProperties.forEach((name) => document.documentElement.style.removeProperty(name));
    document.documentElement.style.removeProperty('color-scheme');
    delete document.documentElement.dataset.appearance;
    try {
      localStorage.removeItem(appearanceKey);
      localStorage.removeItem(appearanceCacheKey);
    } catch {
      /* Page-local reset still works. */
    }
    close();
    void import('../storage').then((module) => module.saveAppearance(defaultPreference())).catch(() => {});
    opener?.focus();
  }
  return (
    <>
      <CommandNavigation identity={identity} onOpenAppearance={openAppearance} />
      {open && error && (
        <div
          role="alert"
          aria-label="Appearance recovery"
          className="fixed inset-x-4 top-24 z-[100] border border-sand-500 bg-obsidian-900 p-6 text-sand-100"
        >
          <p>{error}</p>
          <Button className="btn btn-secondary" onClick={() => openAppearance(opener ?? undefined)}>
            Retry appearance controls
          </Button>
          <Button className="btn btn-secondary" onClick={reset}>
            Reset appearance and close
          </Button>
          <Button className="btn btn-secondary" onClick={close}>
            Close appearance notice
          </Button>
        </div>
      )}
      {open && !error && !Panel && (
        <p
          role="status"
          className="fixed right-4 top-24 z-[100] border border-sand-500 bg-obsidian-900 p-4 text-sand-100"
        >
          Loading appearance controls…
        </p>
      )}
      {open && Panel && !error && (
        <AppearanceBoundary onReset={reset}>
          <Panel opener={opener} onClose={close} />
        </AppearanceBoundary>
      )}
    </>
  );
}
