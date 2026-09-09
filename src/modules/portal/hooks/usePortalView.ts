import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { getPortalView, type PortalView } from '../config/navigation';

let portalDestination = '';

export function getPortalDestination(): string {
  if (portalDestination) return portalDestination;
  try {
    return sessionStorage.getItem('map-destination') ?? '';
  } catch {
    return '';
  }
}

export function selectPortalDestination(destination: string) {
  portalDestination = destination;
  try {
    sessionStorage.setItem('map-destination', destination);
  } catch {
    /* Storage is optional. */
  }
  window.dispatchEvent(new CustomEvent('portal-destination-change', { detail: destination }));
}

export function usePortalDestination() {
  const [destination, setDestination] = useState('');
  useEffect(() => {
    setDestination(getPortalDestination());
    const changed = (event: Event) => setDestination(String((event as CustomEvent).detail ?? ''));
    window.addEventListener('portal-destination-change', changed);
    return () => window.removeEventListener('portal-destination-change', changed);
  }, []);
  return [destination, selectPortalDestination] as const;
}

export function navigatePortal(href: string): boolean {
  if (window.location.pathname !== '/portal' || !href.startsWith('/portal')) return false;
  const url = new URL(href, window.location.origin);
  if (url.pathname !== '/portal') return false;
  const view = getPortalView(url.searchParams.get('view') ?? undefined);
  const destination = url.searchParams.get('destination');
  if (destination) {
    selectPortalDestination(destination);
  }
  if (window.history.state?.portalView !== view)
    window.history.pushState(
      { ...window.history.state, url: '/portal', as: '/portal', portalView: view },
      '',
      '/portal',
    );
  window.dispatchEvent(new CustomEvent('portal-view-change', { detail: view }));
  window.scrollTo({ top: 0, behavior: 'instant' });
  return true;
}

export function usePortalView() {
  const router = useRouter();
  const [view, setView] = useState<PortalView>('overview');
  useEffect(() => {
    if (!router.isReady) return;
    const apply = (next: PortalView) => {
      setView(next);
      try {
        sessionStorage.setItem('portal-view', next);
      } catch {
        /* Storage is optional. */
      }
    };
    let saved: string | undefined;
    try {
      saved = sessionStorage.getItem('portal-view') ?? undefined;
    } catch {
      /* Storage is optional. */
    }
    const initial = getPortalView(router.query.view ?? window.history.state?.portalView ?? saved);
    window.history.replaceState(
      { ...window.history.state, url: '/portal', as: '/portal', portalView: initial },
      '',
      '/portal',
    );
    apply(initial);
    const changed = (event: Event) => apply(getPortalView((event as CustomEvent).detail));
    const popped = (event: PopStateEvent) => {
      if (window.location.pathname === '/portal') apply(getPortalView(event.state?.portalView));
    };
    window.addEventListener('portal-view-change', changed);
    window.addEventListener('popstate', popped);
    return () => {
      window.removeEventListener('portal-view-change', changed);
      window.removeEventListener('popstate', popped);
    };
    // Tab transitions are managed in history without changing the Next.js page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);
  return view;
}
