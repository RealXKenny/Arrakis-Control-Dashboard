import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="rounded-full border border-edge bg-panel px-4 py-1 text-xs text-zinc-500">404</p>
      <h1 className="text-2xl font-semibold text-zinc-100">This dune does not exist</h1>
      <p className="max-w-md text-sm text-zinc-500">
        The page you are looking for was never charted, or it has been swallowed by the desert.
      </p>
      <Link
        href="/"
        className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
