import Link from "next/link";

export default function NotFound(): JSX.Element {
  return (
    <main className="min-h-[calc(100vh-1px)] grid place-items-center p-6">
      <section className="card w-full max-w-lg p-8 text-center">
        <span className="tag">Clockinoff</span>
        <h1 className="mt-5 text-2xl font-semibold tracking-tight">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted">
          The page you&rsquo;re looking for doesn&rsquo;t exist or was moved.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link className="btn btn-primary" href="/">
            Home
          </Link>
          <Link className="btn" href="/app">
            Open app
          </Link>
        </div>
      </section>
    </main>
  );
}
