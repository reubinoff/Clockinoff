import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        accent: "#6d28d9",
        "accent-hover": "#5b21b6",
        "accent-fg": "#ffffff",
        "accent-soft": "#ede9fe",
        "accent-ring": "rgba(109,40,217,0.35)",
        surface: "#ffffff",
        canvas: "#f7f6f3",
        "canvas-2": "#efeee9",
        ink: "#0f172a",
        "ink-2": "#334155",
        muted: "#64748b",
        border: "#e7e5e4",
        "border-strong": "#d6d3d1",
        danger: "#b91c1c",
        "danger-soft": "#fef2f2",
        success: "#15803d",
        "success-soft": "#f0fdf4",
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
        card: "0 1px 2px rgba(15,23,42,0.04)",
        "card-lg":
          "0 1px 2px rgba(15,23,42,0.04), 0 8px 24px rgba(15,23,42,0.06)",
        sheet: "0 8px 32px rgba(15,23,42,0.12)",
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
