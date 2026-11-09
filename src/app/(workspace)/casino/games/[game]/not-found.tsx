import Link from 'next/link';

export default function GameNotFound() {
  return (
    <div className="panel p-8">
      <p className="eyebrow">Lost in the dunes</p>
      <h1 className="mt-3 text-xl">Table not found</h1>
      <p className="mt-3 max-w-prose text-sm text-sand-400">There is no such game at The Solaris Exchange.</p>
      <Link href="/casino" className="btn btn-primary mt-6">
        Back to the lobby
      </Link>
    </div>
  );
}
