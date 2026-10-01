import { SkeletonList } from "@/components/Skeleton";

// Next.js RSC loading UI for the /app route tree. Shown while the server
// component is streaming (first paint and client-side navigations), so an
// empty-or-near-empty database never reads as a frozen click. Dana lock
// (#54): 3 skeleton rows under a day header, Quiet Pulse muted tokens,
// static under prefers-reduced-motion.
export default function AppLoading(): JSX.Element {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-title text-ink">Entries</h2>
        <p className="text-body-sm text-muted">Your recent time entries.</p>
      </div>
      <SkeletonList days={2} rowsPerDay={3} />
    </section>
  );
}
