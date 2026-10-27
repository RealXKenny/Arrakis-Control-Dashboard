import Link from 'next/link';

export default function NotFoundPage() {
  return (
    <main className="workspace-frame flex min-h-screen items-center justify-center bg-transparent py-12 font-sans text-zinc-200">
      <section className="w-full max-w-xl rounded-3xl border border-white/5 bg-zinc-900/40 p-8 text-center sm:p-10">
        <span className="inline-flex rounded-full border border-white/5 bg-zinc-800/60 px-3 py-1 font-mono text-xs text-zinc-400">
          404 · Uncharted territory
        </span>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-100">Lost in the deep desert.</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">
          This location is outside the dashboard’s mapped routes. Return to a known workspace to continue.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="rounded-full bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 no-underline transition-colors hover:bg-zinc-700"
          >
            Return home
          </Link>
          <Link
            href="/portal"
            className="rounded-full border border-indigo-500/20 bg-indigo-500/10 px-5 py-2.5 text-sm font-medium text-indigo-300 no-underline transition-colors hover:bg-indigo-500/15"
          >
            Open portal ↗
          </Link>
        </div>
      </section>
    </main>
  );
}
