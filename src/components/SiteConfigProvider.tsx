import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { defaultPublicSiteConfig, type PublicSiteConfig } from '../config/public-site';

const SiteConfigContext = createContext(defaultPublicSiteConfig);

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(defaultPublicSiteConfig);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/config', { cache: 'no-store', signal: controller.signal })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('config'))))
      .then((body: { data?: PublicSiteConfig }) => body.data && setConfig(body.data))
      .catch(() => {});
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const root = document.documentElement;
    const values = {
      '--theme-text': config.theme.text,
      '--theme-muted': config.theme.muted,
      '--theme-gold': config.theme.accent,
      '--theme-border': config.theme.border,
      '--theme-background': config.theme.background,
      '--theme-surface': config.theme.surface,
    };
    for (const [name, value] of Object.entries(values)) root.style.setProperty(name, value);
    return () => {
      for (const name of Object.keys(values)) root.style.removeProperty(name);
    };
  }, [config.theme]);
  return <SiteConfigContext.Provider value={config}>{children}</SiteConfigContext.Provider>;
}

export function useSiteConfig() {
  return useContext(SiteConfigContext);
}
