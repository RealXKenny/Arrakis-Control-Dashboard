import Link from 'next/link';
import DashboardShell from '../../../components/DashboardShell';
import css from '../landing.module.css';
import MetricCard from '../../../components/MetricCard';
import { useServerStatus } from '../hooks/useServerStatus';

const number = new Intl.NumberFormat('en-US');

const WORKSPACE_LINKS = [
  {
    title: 'Character & inventory',
    description: 'Your progress, gear, and personal storage',
    view: 'character',
    icon: '01',
  },
  { title: 'Bases & vehicles', description: 'Everything you own, in one place', view: 'bases', icon: '02' },
  {
    title: 'Live maps',
    description: 'Explore the world with current information',
    view: 'hagga',
    icon: '03',
  },
  {
    title: 'Community exchange',
    description: 'Browse listings and compare prices',
    view: 'market',
    icon: '04',
  },
] as const;

function ActionPill({
  href,
  children,
  external = false,
  primary = false,
}: {
  href: string;
  children: string;
  external?: boolean;
  primary?: boolean;
}) {
  const className = primary
    ? 'inline-flex items-center justify-center action-primary rounded-full bg-accent px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-zinc-300'
    : 'inline-flex items-center justify-center rounded-full border border-edge bg-panel px-4 py-2 text-xs font-medium text-zinc-300 no-underline transition-colors hover:bg-white/5 hover:text-zinc-100';
  // OAuth starts on an intentional navigation, never a Next.js background prefetch.
  return external || href.startsWith('/auth/') ? (
    <a
      href={href}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      className={className}
    >
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export default function LandingPage({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const { activePlayers, totalPlayers, serverStatusError } = useServerStatus();
  const connected = !serverStatusError && activePlayers != null;
  return (
    <DashboardShell
      brand="Crimson Skies"
      subtitle="Community workspace"
      navigation={[]}
      actions={
        <>
          {!isAuthenticated && (
            <ActionPill href="/auth/login" primary>
              Connect Discord
            </ActionPill>
          )}
          <ActionPill href="https://discord.gg/crimsonskies" external>
            Join Discord
          </ActionPill>
          <ActionPill href="/portal" primary>
            Open portal ↗
          </ActionPill>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-edge bg-panel px-3 py-1 text-xs text-zinc-400">
          Welcome to your workspace
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-edge bg-panel px-3 py-1 text-xs text-zinc-400">
          <span
            className={`h-1.5 w-1.5 rounded-full ${serverStatusError ? 'bg-amber-400' : 'bg-emerald-400'}`}
            aria-hidden="true"
          />
          {serverStatusError ? 'Telemetry unavailable' : connected ? 'Server connected' : 'Reading server…'}
        </span>
      </div>

      <section className={css.hero}>
        <div>
          <span className="inline-block rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
            One community. Everything connected.
          </span>
          <h1 className={css.title}>
            A clearer view.
            <br />
            <span className="text-zinc-400">More possibilities.</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-zinc-400 sm:text-base">
            Your character, community, holdings, and live world data. A thoughtfully organized workspace that keeps
            everything within reach.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {!isAuthenticated && (
              <a
                href="/auth/login"
                className="action-primary rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-ink transition-colors hover:bg-zinc-300"
              >
                Connect with Discord →
              </a>
            )}
            <Link
              href="/portal"
              className="rounded-full border border-edge bg-panel px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:text-zinc-100"
            >
              Open your portal ↗
            </Link>
          </div>
        </div>

        <aside className={css.workspace} aria-label="Explore your workspace">
          <div className="flex items-center gap-3">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-full border border-edge bg-ink text-sm text-zinc-500"
              aria-hidden="true"
            >
              ↗
            </span>
            <div>
              <p className="text-sm font-semibold text-zinc-100">Your workspace</p>
              <p className="text-xs text-zinc-500">A little less searching. A lot more clarity.</p>
            </div>
          </div>
          <div className={css.shortcuts}>
            {WORKSPACE_LINKS.map((item) => (
              <Link
                key={item.view}
                href={`/portal?view=${item.view}`}
                as="/portal"
                shallow
                className="group flex min-w-0 items-center gap-3 rounded-2xl border border-edge bg-ink p-4 no-underline transition-colors hover:border-zinc-500"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-edge bg-panel font-mono text-[10px] text-zinc-500"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-zinc-200">{item.title}</span>
                  <span className="mt-1 block text-xs leading-relaxed text-zinc-400">{item.description}</span>
                </span>
                <span className="text-zinc-600 transition-colors group-hover:text-zinc-300" aria-hidden="true">
                  ↗
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-center text-xs text-zinc-600">Secure access through your Discord account</p>
        </aside>
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <MetricCard
          label="Live activity"
          value={activePlayers == null ? '—' : number.format(activePlayers)}
          hint="Players online"
          live
        />
        <MetricCard
          label="The community"
          value={totalPlayers == null ? '—' : number.format(totalPlayers)}
          hint="Characters in the community"
        />
      </div>

      <section className="grid items-center gap-8 py-12 lg:grid-cols-[1.15fr_1fr]">
        <div>
          <span className="inline-block rounded-full border border-edge bg-panel px-3 py-1 text-xs font-medium text-zinc-400">
            The Crimson Skies community
          </span>
          <h2 className="mt-4 text-3xl leading-tight font-semibold tracking-tight text-zinc-100">
            Good company.
            <br />
            <span className="text-zinc-400">Better together.</span>
          </h2>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-zinc-400">
            Make plans, share discoveries, and catch up with your community. The conversation continues on Discord.
          </p>
          <a
            href="https://discord.gg/crimsonskies"
            target="_blank"
            rel="noreferrer"
            className="mt-6 inline-flex items-center rounded-full border border-edge bg-panel px-5 py-2.5 text-sm font-medium text-zinc-200 transition-colors hover:border-zinc-700 hover:text-zinc-100"
          >
            Join Discord ↗
          </a>
        </div>
        <aside className="rounded-2xl border border-edge bg-panel p-6 text-center" aria-label="Crimson Skies community">
          <span
            className="mx-auto flex h-12 w-12 items-center justify-center action-primary rounded-full bg-accent text-sm font-semibold text-ink"
            aria-hidden="true"
          >
            CS
          </span>
          <p className="mt-3 text-sm font-semibold text-zinc-100">Crimson Skies</p>
          <p className="text-xs text-zinc-500">Your community on Discord</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {['Plan together', 'Share discoveries', 'Stay in the loop'].map((tag) => (
              <span key={tag} className="rounded-full border border-edge bg-ink px-3 py-1 text-xs text-zinc-400">
                {tag}
              </span>
            ))}
          </div>
        </aside>
      </section>
    </DashboardShell>
  );
}
