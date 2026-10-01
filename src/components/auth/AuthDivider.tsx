// Thin muted "or" divider between primary email/password CTA and the
// secondary Google button. Dana spec: hairline + label, same both pages.
export function AuthDivider({ label = "or" }: { label?: string }): JSX.Element {
  return (
    <div className="flex items-center gap-3" role="presentation" aria-hidden="true">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs uppercase tracking-wide text-muted">{label}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
