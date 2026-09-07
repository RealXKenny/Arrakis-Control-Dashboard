import Link from "next/link";

export default function SentryExamplePage() {
  function triggerTestError() {
    throw new Error("Sentry example test error");
  }

  return (
    <main>
      <div className="eyebrow">Sentry integration check</div>
      <h1>Trigger a test error</h1>
      <p className="subtitle">Use this page to verify that the dashboard reports client-side errors to Sentry.</p>
      <button
        type="button"
        onClick={triggerTestError}
        style={{
          padding: "12px 18px",
          color: "#160d08",
          background: "#ffe2a9",
          border: "0",
          borderRadius: "8px",
          cursor: "pointer",
          font: "inherit",
          fontWeight: 700,
        }}
      >
        Trigger test error
      </button>
      <p className="muted">
        <Link href="/">Back to dashboard</Link>
      </p>
    </main>
  );
}
