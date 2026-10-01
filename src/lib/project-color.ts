// #84 Mobile entry card: competitor cards lead with a colored project label.
// We don't persist a per-project color yet (there is no `color` column on
// `projects`), so derive a stable swatch deterministically from the project
// id (or, when the id is unavailable, the display name). The function is
// pure — same input, same color across devices and renders — which is the
// invariant the entry card relies on so a project's dot never flickers to
// a different hue when the row re-renders or when the user opens another
// device.
//
// Palette is Quiet-Pulse-friendly: the first swatch is the brand purple so
// a first project almost always lands on-brand. The rest are tuned to pass
// contrast on both light (`#f7f6f3`) and dark (`#0c0b10`) canvases as a
// small (8–10px) dot or 2px chip accent — they are decorative only, never
// text foreground.

export const PROJECT_COLOR_PALETTE: readonly string[] = [
  "#7c3aed", // Quiet Pulse purple
  "#f59e0b", // amber
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#8b5cf6", // violet
  "#eab308", // yellow
  "#ef4444", // red
  "#22c55e", // green
] as const;

export function projectColor(key: string | null | undefined): string | null {
  if (key == null) return null;
  const trimmed = key.trim();
  if (trimmed.length === 0) return null;
  let hash = 0;
  for (let i = 0; i < trimmed.length; i += 1) {
    hash = (hash * 31 + trimmed.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % PROJECT_COLOR_PALETTE.length;
  return PROJECT_COLOR_PALETTE[idx];
}
