import { IconInfo } from "@/components/icons";
import { GOOGLE_AUTH_ERROR_COPY } from "@/lib/google-auth-errors";

export function GoogleUnavailableBanner(): JSX.Element {
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl border border-border bg-canvas-2 px-3 py-3"
    >
      <IconInfo size={16} className="mt-0.5 shrink-0 text-ink-2" />
      <p className="text-sm text-ink-2">{GOOGLE_AUTH_ERROR_COPY.unavailable}</p>
    </div>
  );
}
