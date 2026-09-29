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
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "sans-serif",
        ],
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
