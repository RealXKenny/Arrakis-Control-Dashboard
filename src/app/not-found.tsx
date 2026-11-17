import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-shell flex-col items-start px-4 py-24 sm:px-6">
      <p className="eyebrow">Lost in the dunes</p>
      <h1 className="mt-4 text-3xl sm:text-5xl">Page not found</h1>
      <p className="mt-4 max-w-prose text-sm text-sand-400">
        That route does not exist, or you do not have access to it.
      </p>
      <Link href="/" className="btn btn-primary mt-8">
        Back to the landing page
      </Link>
    </div>
  );
}
