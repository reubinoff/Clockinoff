"use client";

import { useEffect } from "react";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    if (typeof console !== "undefined") {
      console.error("[app-error]", error);
    }
  }, [error]);

  return (
    <main className="min-h-[calc(100vh-1px)] grid place-items-center p-6">
      <section
        role="alert"
        aria-live="polite"
        className="card w-full max-w-lg p-8 text-center"
      >
        <span className="tag inline-flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full bg-accent"
          />
          Clockinoff
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          We&rsquo;ll be right back
        </h1>
        <p className="mt-2 text-sm text-muted">
          Something went wrong loading this page. Your data is safe.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button type="button" className="btn btn-primary" onClick={() => reset()}>
            Try again
          </button>
          <a className="btn" href="/">
            Home
          </a>
          <a className="btn" href="/unavailable.html">
            Status
          </a>
        </div>
        {error?.digest ? (
          <p className="mt-5 text-xs text-muted">
            Ref <code className="rounded-sm bg-canvas-2 px-1.5 py-0.5">{error.digest}</code>
          </p>
        ) : null}
      </section>
    </main>
  );
}
