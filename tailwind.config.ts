import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // V2-10 Dark #10: every color token resolves through a CSS variable
      // scoped to `html[data-theme="light|dark"]` in `globals.css`. This is
      // what makes the whole 17-token palette flip together in one shot.
      colors: {
        accent: "var(--color-accent)",
        "accent-hover": "var(--color-accent-hover)",
        "accent-fg": "var(--color-accent-fg)",
        "accent-soft": "var(--color-accent-soft)",
        "accent-ring": "var(--color-accent-ring)",
        surface: "var(--color-surface)",
        canvas: "var(--color-canvas)",
        "canvas-2": "var(--color-canvas-2)",
        ink: "var(--color-ink)",
        "ink-2": "var(--color-ink-2)",
        muted: "var(--color-muted)",
        border: "var(--color-border)",
        "border-strong": "var(--color-border-strong)",
        danger: "var(--color-danger)",
        "danger-soft": "var(--color-danger-soft)",
        success: "var(--color-success)",
        "success-soft": "var(--color-success-soft)",
      },
      fontFamily: {
        sans: [
          "InterVariable",
          "Inter",
          "Geist",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Consolas",
          "Liberation Mono",
          "monospace",
        ],
      },
      // V2-1 typography scale (Quiet Pulse §4.3). Fluid clamps for display/title
      // let the same class scale from mobile → desktop without media queries.
      fontSize: {
        display: [
          "clamp(1.75rem, 1.4rem + 1.5vw, 2.25rem)",
          { lineHeight: "1.15", letterSpacing: "-0.02em", fontWeight: "600" },
        ],
        title: [
          "clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem)",
          { lineHeight: "1.25", fontWeight: "600" },
        ],
        "title-sm": ["1.125rem", { lineHeight: "1.3", fontWeight: "600" }],
        body: ["0.9375rem", { lineHeight: "1.5" }],
        "body-sm": ["0.875rem", { lineHeight: "1.45" }],
        label: [
          "0.75rem",
          { lineHeight: "1.3", letterSpacing: "0.02em", fontWeight: "500" },
        ],
        meta: ["0.75rem", { lineHeight: "1.3" }],
        "timer-lg": [
          "clamp(1.75rem, 1.5rem + 1vw, 2.5rem)",
          { lineHeight: "1", fontWeight: "500" },
        ],
        "timer-md": ["1.25rem", { lineHeight: "1", fontWeight: "500" }],
      },
      boxShadow: {
        card: "var(--shadow-card)",
        "card-lg": "var(--shadow-card-lg)",
        sheet: "var(--shadow-sheet)",
      },
      borderRadius: {
        "radius-sm": "8px",
        "radius-md": "12px",
        "radius-lg": "16px",
        "radius-xl": "20px",
        "2xl": "1rem",
      },
    },
  },
  plugins: [],
} satisfies Config;
