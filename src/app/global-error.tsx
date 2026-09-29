"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    if (typeof console !== "undefined") {
      console.error("[global-error]", error);
    }
  }, [error]);

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Service unavailable · Timely</title>
        <style>{globalErrorCss}</style>
      </head>
      <body>
        <main>
          <section className="card" role="alert" aria-live="polite">
            <span className="badge">
              <span className="dot" aria-hidden="true" />
              Timely
            </span>
            <h1>We&rsquo;ll be right back</h1>
            <p>Timely hit an unexpected error and is temporarily unavailable.</p>
            <p>Your data is safe. You can retry, or wait a moment and reload.</p>
            <div className="actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => reset()}
              >
                Try again
              </button>
              <a className="btn" href="/">
                Home
              </a>
            </div>
            {error?.digest ? (
              <footer>
                Error <code>503</code> &middot; Ref <code>{error.digest}</code>
              </footer>
            ) : (
              <footer>
                Error <code>503</code> &middot; Service Unavailable
              </footer>
            )}
          </section>
        </main>
      </body>
    </html>
  );
}

const globalErrorCss = `
:root{color-scheme:light dark;--bg:#fafaf9;--surface:#ffffff;--ink:#111827;--muted:#6b7280;--border:#e5e7eb;--accent:#6d28d9;--accent-fg:#ffffff;--shadow:0 1px 2px rgba(17,24,39,.04),0 1px 3px rgba(17,24,39,.05)}
@media (prefers-color-scheme: dark){:root{--bg:#0b0f14;--surface:#111827;--ink:#f3f4f6;--muted:#9ca3af;--border:#1f2937;--accent:#c4b5fd;--accent-fg:#1e1b4b;--shadow:0 1px 2px rgba(0,0,0,.4),0 1px 3px rgba(0,0,0,.35)}}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:InterVariable,Inter,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;line-height:1.5;-webkit-font-smoothing:antialiased}
main{min-height:100%;display:grid;place-items:center;padding:24px}
.card{width:100%;max-width:520px;background:var(--surface);border:1px solid var(--border);border-radius:12px;box-shadow:var(--shadow);padding:32px;text-align:center}
.badge{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;border-radius:999px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:12px;font-weight:500;letter-spacing:.02em;text-transform:uppercase}
.dot{width:8px;height:8px;border-radius:999px;background:var(--accent);animation:pulse 1.6s ease-in-out infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.4;transform:scale(.85)}}
h1{margin:20px 0 8px;font-size:24px;font-weight:600;letter-spacing:-.01em}
p{margin:0 0 8px;color:var(--muted);font-size:15px}
.actions{margin-top:24px;display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.btn{display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border-radius:8px;border:1px solid var(--border);background:transparent;color:var(--ink);font-size:14px;font-weight:500;text-decoration:none;cursor:pointer;transition:background 120ms ease,opacity 120ms ease}
.btn:hover{background:color-mix(in srgb,var(--ink) 6%,transparent)}
.btn-primary{background:var(--accent);color:var(--accent-fg);border-color:var(--accent)}
.btn-primary:hover{opacity:.9;background:var(--accent)}
footer{margin-top:20px;color:var(--muted);font-size:12px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;padding:1px 6px;border-radius:4px;background:color-mix(in srgb,var(--ink) 8%,transparent)}
`;
