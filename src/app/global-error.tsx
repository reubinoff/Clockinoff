"use client";

import { useEffect } from "react";
import { appearanceBootScript } from "@/lib/appearance";

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
    // V2-10 Dark #10: global-error renders outside the app-router tree and
    // ships its own <html>, so it also needs the boot script + the same
    // full Quiet Pulse light/dark token remap (not the pre-V2 fallback).
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>Service unavailable · Timely</title>
        <script dangerouslySetInnerHTML={{ __html: appearanceBootScript() }} />
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

// V2-10 Dark #10: this style block owns its own token twin because
// global-error is served as a standalone HTML document (no Tailwind
// runtime). The light values below are the shipped V2-0 palette; the
// `[data-theme="dark"]` block is the locked Quiet Pulse dark map
// (canvas / surface / ink / muted / border / accent / accent-fg /
// shadow). System-preference fallback covers the pre-hydration case if
// the boot script somehow failed to set data-theme.
const globalErrorCss = `
:root,html[data-theme="light"]{color-scheme:light;--bg:#f7f6f3;--surface:#ffffff;--ink:#0f172a;--muted:#64748b;--border:#e7e5e4;--accent:#6d28d9;--accent-hover:#5b21b6;--accent-fg:#ffffff;--shadow:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.06)}
html[data-theme="dark"]{color-scheme:dark;--bg:#0c0b10;--surface:#1c1924;--ink:#f4f4f5;--muted:#a1a1aa;--border:#2a2633;--accent:#7c3aed;--accent-hover:#6d28d9;--accent-fg:#ffffff;--shadow:0 1px 2px rgba(0,0,0,.45),0 8px 24px rgba(0,0,0,.55)}
@media (prefers-color-scheme: dark){html:not([data-theme]){color-scheme:dark;--bg:#0c0b10;--surface:#1c1924;--ink:#f4f4f5;--muted:#a1a1aa;--border:#2a2633;--accent:#7c3aed;--accent-hover:#6d28d9;--accent-fg:#ffffff;--shadow:0 1px 2px rgba(0,0,0,.45),0 8px 24px rgba(0,0,0,.55)}}
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
.btn-primary:hover{background:var(--accent-hover);border-color:var(--accent-hover)}
footer{margin-top:20px;color:var(--muted);font-size:12px}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;padding:1px 6px;border-radius:4px;background:color-mix(in srgb,var(--ink) 8%,transparent)}
`;
