'use client';

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="panel border-l-4 border-l-status-danger p-8">
      <p className="eyebrow">Signal lost</p>
      <h1 className="mt-3 text-xl">Something went wrong</h1>
      <p className="mt-3 max-w-prose text-sm text-sand-400">
        The console hit an unexpected fault. Nothing was changed. Try the request again.
      </p>
      <button type="button" onClick={reset} className="btn btn-primary mt-6">
        Retry
      </button>
    </div>
  );
}
